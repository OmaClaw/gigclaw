import { Router, Request, Response } from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validation';
import crypto from 'crypto';

export const webhookRouter = Router();

// Store webhook subscriptions (in-memory for now, move to DB in production)
const webhooks = new Map<string, any[]>();
const webhookLogs = new Map<string, any[]>(); // Delivery logs

// Webhook event types
type WebhookEvent = 
  | 'task.created' 
  | 'task.bid' 
  | 'task.assigned' 
  | 'task.completed' 
  | 'task.verified' 
  | 'task.cancelled'
  | 'payment.released'
  | 'reputation.updated';

interface WebhookSubscription {
  id: string;
  url: string;
  events: WebhookEvent[];
  secret: string;
  createdAt: number;
  active: boolean;
  lastDelivered?: number;
  failureCount: number;
}

interface WebhookLog {
  id: string;
  webhookId: string;
  event: WebhookEvent;
  url: string;
  status: 'success' | 'failed' | 'pending';
  statusCode?: number;
  responseBody?: string;
  timestamp: number;
  retryCount: number;
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
    'task.cancelled',
    'payment.released',
    'reputation.updated'
  ]).withMessage('Invalid event type'),
  body('agentId').isString().withMessage('Agent ID required'),
  validate
], (req: Request, res: Response) => {
  const { url, events, agentId } = req.body;
  
  const subscription: WebhookSubscription = {
    id: crypto.randomUUID(),
    url,
    events,
    secret: crypto.randomBytes(32).toString('hex'),
    createdAt: Date.now(),
    active: true,
    failureCount: 0
  };
  
  if (!webhooks.has(agentId)) {
    webhooks.set(agentId, []);
  }
  webhooks.get(agentId)!.push(subscription);
  
  res.status(201).json({
    message: 'Webhook registered successfully',
    webhookId: subscription.id,
    secret: subscription.secret,
    events: subscription.events,
    url: subscription.url,
    tip: 'Store the secret securely - it will not be shown again'
  });
});

// Test webhook
webhookRouter.post('/test', [
  body('webhookId').isUUID().withMessage('Valid webhook ID required'),
  body('agentId').isString().withMessage('Agent ID required'),
  validate
], async (req: Request, res: Response) => {
  const { webhookId, agentId } = req.body;
  
  const agentWebhooks = webhooks.get(agentId);
  if (!agentWebhooks) {
    return res.status(404).json({ error: 'No webhooks found for this agent' });
  }
  
  const webhook = agentWebhooks.find(w => w.id === webhookId);
  if (!webhook) {
    return res.status(404).json({ error: 'Webhook not found' });
  }
  
  // Send test payload
  const testPayload = {
    event: 'test',
    timestamp: Date.now(),
    payload: {
      message: 'This is a test webhook from GigClaw',
      webhookId: webhook.id,
      agentId
    }
  };
  
  try {
    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-GigClaw-Event': 'test',
        'X-GigClaw-Signature': generateSignature(testPayload, webhook.secret),
        'X-GigClaw-Delivery': crypto.randomUUID()
      },
      body: JSON.stringify(testPayload)
    });
    
    const responseBody = await response.text();
    
    res.json({
      success: response.ok,
      statusCode: response.status,
      responseBody: responseBody.slice(0, 500), // Limit response size
      message: response.ok ? 'Webhook test successful' : 'Webhook test failed'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Webhook test failed - could not reach URL'
    });
  }
});

// List webhooks
webhookRouter.get('/:agentId', (req, res) => {
  const agentWebhooks = webhooks.get(req.params.agentId) || [];
  const safeWebhooks = agentWebhooks.map(w => ({
    id: w.id,
    url: w.url,
    events: w.events,
    active: w.active,
    createdAt: w.createdAt,
    lastDelivered: w.lastDelivered,
    failureCount: w.failureCount
  }));
  res.json({ 
    webhooks: safeWebhooks,
    count: safeWebhooks.length
  });
});

// Get webhook delivery logs
webhookRouter.get('/:agentId/logs', (req, res) => {
  const logs = webhookLogs.get(req.params.agentId) || [];
  const recentLogs = logs
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 50); // Last 50 deliveries
  
  res.json({
    logs: recentLogs,
    total: logs.length
  });
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
  res.json({ message: 'Webhook deleted successfully' });
});

// Pause/resume webhook
webhookRouter.patch('/:agentId/:webhookId/status', [
  body('active').isBoolean().withMessage('Active must be boolean'),
  validate
], (req: Request, res: Response) => {
  const { active } = req.body;
  const agentWebhooks = webhooks.get(req.params.agentId);
  
  if (!agentWebhooks) {
    return res.status(404).json({ error: 'No webhooks found' });
  }
  
  const webhook = agentWebhooks.find(w => w.id === req.params.webhookId);
  if (!webhook) {
    return res.status(404).json({ error: 'Webhook not found' });
  }
  
  webhook.active = active;
  if (active) {
    webhook.failureCount = 0; // Reset on reactivate
  }
  
  res.json({
    message: `Webhook ${active ? 'activated' : 'paused'}`,
    webhookId: webhook.id,
    active: webhook.active
  });
});

// Export function to trigger webhooks
export async function triggerWebhook(
  event: WebhookEvent,
  payload: any,
  agentId?: string
) {
  const allWebhooks: Array<{ sub: WebhookSubscription; agentId: string }> = [];
  
  webhooks.forEach((subs, id) => {
    subs.forEach(sub => {
      if (sub.active && sub.events.includes(event)) {
        allWebhooks.push({ sub, agentId: id });
      }
    });
  });
  
  if (agentId && webhooks.has(agentId)) {
    webhooks.get(agentId)!.forEach(sub => {
      if (sub.active && 
          sub.events.includes(event) && 
          !allWebhooks.find(w => w.sub.id === sub.id)) {
        allWebhooks.push({ sub, agentId });
      }
    });
  }
  
  allWebhooks.forEach(async ({ sub, agentId: subAgentId }) => {
    const deliveryId = crypto.randomUUID();
    const log: WebhookLog = {
      id: deliveryId,
      webhookId: sub.id,
      event,
      url: sub.url,
      status: 'pending',
      timestamp: Date.now(),
      retryCount: 0
    };
    
    // Store log
    if (!webhookLogs.has(subAgentId)) {
      webhookLogs.set(subAgentId, []);
    }
    webhookLogs.get(subAgentId)!.push(log);
    
    // Try delivery with retries
    let success = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(sub.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-GigClaw-Event': event,
            'X-GigClaw-Signature': generateSignature(payload, sub.secret),
            'X-GigClaw-Delivery': deliveryId,
            'X-GigClaw-Attempt': String(attempt + 1)
          },
          body: JSON.stringify({
            event,
            timestamp: Date.now(),
            deliveryId,
            payload
          })
        });
        
        log.statusCode = response.status;
        log.responseBody = await response.text();
        
        if (response.ok) {
          success = true;
          log.status = 'success';
          sub.lastDelivered = Date.now();
          sub.failureCount = 0;
          break;
        } else {
          throw new Error(`HTTP ${response.status}`);
        }
      } catch (error: any) {
        log.retryCount = attempt;
        if (attempt < 2) {
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); // Exponential backoff
        }
      }
    }
    
    if (!success) {
      log.status = 'failed';
      sub.failureCount++;
      
      // Auto-deactivate after 10 consecutive failures
      if (sub.failureCount >= 10) {
        sub.active = false;
        console.error(`Webhook ${sub.id} auto-deactivated after 10 failures`);
      }
    }
  });
}

function generateSignature(payload: any, secret: string): string {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(JSON.stringify(payload));
  return `sha256=${hmac.digest('hex')}`;
}

export { webhooks, webhookLogs };
