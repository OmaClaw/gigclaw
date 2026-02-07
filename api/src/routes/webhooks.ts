import { Router, Request, Response } from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validation';

export const webhookRouter = Router();

// Store webhook subscriptions (in-memory for now, move to DB in production)
const webhooks = new Map<string, any[]>();

// Register webhook for task events
type WebhookEvent = 'task.created' | 'task.bid' | 'task.assigned' | 'task.completed' | 'task.verified' | 'task.cancelled';

interface WebhookSubscription {
  id: string;
  url: string;
  events: WebhookEvent[];
  secret: string;
  createdAt: number;
}

// Register webhook
webhookRouter.post('/register', [
  body('url').isURL().withMessage('Valid URL required'),
  body('events').isArray({ min: 1 }).withMessage('At least one event required'),
  body('events.*').isIn([
    'task.created',
    'task.bid',
    'task.assigned',
    'task.completed',
    'task.verified',
    'task.cancelled'
  ]).withMessage('Invalid event type'),
  validate
], (req: Request, res: Response) => {
  const { url, events, agentId } = req.body;
  
  const subscription: WebhookSubscription = {
    id: crypto.randomUUID(),
    url,
    events,
    secret: crypto.randomUUID(), // For HMAC verification
    createdAt: Date.now()
  };
  
  if (!webhooks.has(agentId)) {
    webhooks.set(agentId, []);
  }
  webhooks.get(agentId)!.push(subscription);
  
  res.status(201).json({
    message: 'Webhook registered',
    webhookId: subscription.id,
    secret: subscription.secret, // Show once
    events: subscription.events
  });
});

// List webhooks
webhookRouter.get('/:agentId', (req, res) => {
  const agentWebhooks = webhooks.get(req.params.agentId) || [];
  // Don't return secrets
  const safeWebhooks = agentWebhooks.map(w => ({
    id: w.id,
    url: w.url,
    events: w.events,
    createdAt: w.createdAt
  }));
  res.json({ webhooks: safeWebhooks });
});

// Delete webhook
webhookRouter.delete('/:agentId/:webhookId', (req, res) => {
  const agentWebhooks = webhooks.get(req.params.agentId);
  if (!agentWebhooks) {
    return res.status(404).json({ error: 'No webhooks found' });
  }
  
  const index = agentWebhooks.findIndex(w => w.id === req.params.webhookId);
  if (index === -1) {
    return res.status(404).json({ error: 'Webhook not found' });
  }
  
  agentWebhooks.splice(index, 1);
  res.json({ message: 'Webhook deleted' });
});

// Export function to trigger webhooks
export async function triggerWebhook(
  event: WebhookEvent,
  payload: any,
  agentId?: string
) {
  // Find all webhooks subscribed to this event
  const allWebhooks: Array<{ sub: WebhookSubscription; agentId: string }> = [];
  
  webhooks.forEach((subs, id) => {
    subs.forEach(sub => {
      if (sub.events.includes(event) || sub.events.includes('*' as WebhookEvent)) {
        allWebhooks.push({ sub, agentId: id });
      }
    });
  });
  
  // Also trigger for specific agent if provided
  if (agentId && webhooks.has(agentId)) {
    webhooks.get(agentId)!.forEach(sub => {
      if (sub.events.includes(event) && !allWebhooks.find(w => w.sub.id === sub.id)) {
        allWebhooks.push({ sub, agentId });
      }
    });
  }
  
  // Fire webhooks asynchronously (don't block)
  allWebhooks.forEach(async ({ sub }) => {
    try {
      const response = await fetch(sub.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GigClaw-Event': event,
          'X-GigClaw-Signature': generateSignature(payload, sub.secret)
        },
        body: JSON.stringify({
          event,
          timestamp: Date.now(),
          payload
        })
      });
      
      if (!response.ok) {
        console.error(`Webhook failed: ${sub.url} - ${response.status}`);
      }
    } catch (error) {
      console.error(`Webhook error: ${sub.url}`, error);
    }
  });
}

function generateSignature(payload: any, secret: string): string {
  // Simple HMAC would go here - using placeholder for now
  return `sha256=${secret.slice(0, 16)}`;
}

export { webhooks };
