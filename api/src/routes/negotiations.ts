import { Router, Request, Response } from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validation';

export const negotiationRouter = Router();

// Active negotiations
const negotiations = new Map<string, any>();

interface NegotiationSession {
  id: string;
  taskId: string;
  posterId: string;
  workerId: string;
  status: 'active' | 'agreed' | 'deadlocked' | 'cancelled';
  messages: NegotiationMessage[];
  proposedTerms: NegotiationTerms;
  constraints: {
    poster: TermConstraints;
    worker: TermConstraints;
  };
  startedAt: number;
  lastActivity: number;
  aiAnalysis?: NegotiationAnalysis;
}

interface NegotiationMessage {
  id: string;
  fromAgentId: string;
  message: string;
  proposedTerms?: NegotiationTerms;
  sentiment: 'positive' | 'neutral' | 'negative';
  timestamp: number;
}

interface NegotiationTerms {
  price?: number;
  timeline?: string;
  milestones?: Milestone[];
  paymentSchedule?: PaymentSchedule;
}

interface Milestone {
  description: string;
  deadline: string;
  payment: number;
}

interface PaymentSchedule {
  upfront: number; // percentage
  onCompletion: number;
  onVerification: number;
}

interface TermConstraints {
  minPrice?: number;
  maxPrice?: number;
  minTimeline?: string;
  maxTimeline?: string;
  nonNegotiables?: string[];
}

interface NegotiationAnalysis {
  sentiment: 'positive' | 'neutral' | 'negative';
  likelihoodOfDeal: number;
  recommendedCounter?: NegotiationTerms;
  nextBestAction: string;
  negotiationStyle: 'collaborative' | 'competitive' | 'accommodating';
}

// Start negotiation
negotiationRouter.post(
  '/start',
  [
    body('taskId').isString(),
    body('posterId').isString(),
    body('workerId').isString(),
    body('initialBid').isObject(),
    body('constraints').optional().isObject(),
    validate,
  ],
  (req: Request, res: Response) => {
    const { taskId, posterId, workerId, initialBid, constraints = {} } = req.body;

    const negotiation: NegotiationSession = {
      id: `neg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      taskId,
      posterId,
      workerId,
      status: 'active',
      messages: [],
      proposedTerms: initialBid,
      constraints: {
        poster: constraints.poster || {},
        worker: constraints.worker || {},
      },
      startedAt: Date.now(),
      lastActivity: Date.now(),
    };

    negotiations.set(negotiation.id, negotiation);

    res.status(201).json({
      message: 'Negotiation started',
      negotiationId: negotiation.id,
      negotiation,
    });
  }
);

// Send message in negotiation
negotiationRouter.post(
  '/:id/message',
  [
    body('fromAgentId').isString(),
    body('message').isString().isLength({ min: 1, max: 1000 }),
    body('proposedTerms').optional().isObject(),
    validate,
  ],
  (req: Request, res: Response) => {
    const { id } = req.params;
    const { fromAgentId, message, proposedTerms } = req.body;

    const negotiation = negotiations.get(id);
    if (!negotiation) {
      return res.status(404).json({ error: 'Negotiation not found' });
    }

    if (negotiation.status !== 'active') {
      return res.status(400).json({ error: 'Negotiation is not active' });
    }

    // Validate sender is part of negotiation
    if (fromAgentId !== negotiation.posterId && fromAgentId !== negotiation.workerId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Analyze sentiment (simple heuristic - would use NLP in production)
    const sentiment = analyzeSentiment(message);

    const msg: NegotiationMessage = {
      id: `msg-${Date.now()}`,
      fromAgentId,
      message,
      proposedTerms,
      sentiment,
      timestamp: Date.now(),
    };

    negotiation.messages.push(msg);
    negotiation.lastActivity = Date.now();

    // Update proposed terms if provided
    if (proposedTerms) {
      negotiation.proposedTerms = { ...negotiation.proposedTerms, ...proposedTerms };
    }

    // Generate AI analysis
    negotiation.aiAnalysis = generateAnalysis(negotiation);

    res.json({
      message: 'Message sent',
      negotiation,
    });
  }
);

// Get negotiation status
negotiationRouter.get('/:id', (req, res) => {
  const negotiation = negotiations.get(req.params.id);
  if (!negotiation) {
    return res.status(404).json({ error: 'Negotiation not found' });
  }

  res.json(negotiation);
});

// Accept terms
negotiationRouter.post(
  '/:id/accept',
  [body('agentId').isString(), validate],
  (req: Request, res: Response) => {
    const { id } = req.params;
    const { agentId } = req.body;

    const negotiation = negotiations.get(id);
    if (!negotiation) {
      return res.status(404).json({ error: 'Negotiation not found' });
    }

    if (negotiation.status !== 'active') {
      return res.status(400).json({ error: 'Negotiation already finalized' });
    }

    // Determine if both parties have agreed
    const otherParty =
      agentId === negotiation.posterId ? negotiation.workerId : negotiation.posterId;

    // In real implementation, track individual acceptances
    negotiation.status = 'agreed';

    res.json({
      message: 'Terms accepted',
      negotiation,
      finalTerms: negotiation.proposedTerms,
    });
  }
);

// Cancel negotiation
negotiationRouter.post(
  '/:id/cancel',
  [body('agentId').isString(), body('reason').optional().isString(), validate],
  (req: Request, res: Response) => {
    const { id } = req.params;
    const { agentId, reason } = req.body;

    const negotiation = negotiations.get(id);
    if (!negotiation) {
      return res.status(404).json({ error: 'Negotiation not found' });
    }

    negotiation.status = 'cancelled';
    negotiation.cancelReason = reason;

    res.json({
      message: 'Negotiation cancelled',
      negotiation,
    });
  }
);

// Get AI analysis
negotiationRouter.get('/:id/analysis', (req, res) => {
  const negotiation = negotiations.get(req.params.id);
  if (!negotiation) {
    return res.status(404).json({ error: 'Negotiation not found' });
  }

  const analysis = negotiation.aiAnalysis || generateAnalysis(negotiation);

  res.json(analysis);
});

// List agent's negotiations
negotiationRouter.get('/agent/:agentId', (req, res) => {
  const agentId = req.params.agentId;

  const agentNegotiations = Array.from(negotiations.values())
    .filter(n => n.posterId === agentId || n.workerId === agentId)
    .sort((a, b) => b.lastActivity - a.lastActivity);

  res.json({
    negotiations: agentNegotiations,
    count: agentNegotiations.length,
  });
});

// Helper functions
function analyzeSentiment(message: string): 'positive' | 'neutral' | 'negative' {
  const positive = ['yes', 'agree', 'deal', 'sure', 'happy', 'great', 'perfect', 'excellent'];
  const negative = ['no', 'disagree', 'reject', 'unhappy', 'bad', 'terrible', 'impossible'];

  const lower = message.toLowerCase();
  const posCount = positive.filter(w => lower.includes(w)).length;
  const negCount = negative.filter(w => lower.includes(w)).length;

  if (posCount > negCount) return 'positive';
  if (negCount > posCount) return 'negative';
  return 'neutral';
}

function generateAnalysis(negotiation: NegotiationSession): NegotiationAnalysis {
  const messages = negotiation.messages;

  if (messages.length === 0) {
    return {
      sentiment: 'neutral',
      likelihoodOfDeal: 0.5,
      nextBestAction: 'Start with a friendly opening message',
      negotiationStyle: 'collaborative',
    };
  }

  const sentiments = messages.map(m => m.sentiment);
  const positiveCount = sentiments.filter(s => s === 'positive').length;
  const negativeCount = sentiments.filter(s => s === 'negative').length;

  const total = sentiments.length;
  const positivity = positiveCount / total;
  const negativity = negativeCount / total;

  let likelihood = 0.5;
  if (positivity > 0.6) likelihood = 0.8;
  if (positivity > 0.8) likelihood = 0.95;
  if (negativity > 0.5) likelihood = 0.2;

  const style =
    negativity > 0.3 ? 'competitive' : positivity > 0.7 ? 'accommodating' : 'collaborative';

  return {
    sentiment:
      positivity > negativity ? 'positive' : negativity > positivity ? 'negative' : 'neutral',
    likelihoodOfDeal: likelihood,
    recommendedCounter: generateCounterOffer(negotiation),
    nextBestAction:
      likelihood > 0.7
        ? 'Push for agreement'
        : likelihood < 0.3
          ? 'Make a concession'
          : 'Continue discussion',
    negotiationStyle: style,
  };
}

function generateCounterOffer(negotiation: NegotiationSession): NegotiationTerms | undefined {
  const current = negotiation.proposedTerms;

  // Simple midpoint strategy
  if (current.price) {
    const posterMax = negotiation.constraints.poster.maxPrice || current.price * 1.2;
    const workerMin = negotiation.constraints.worker.minPrice || current.price * 0.8;
    const midpoint = (posterMax + workerMin) / 2;

    return {
      price: Math.round(midpoint),
      timeline: current.timeline,
      milestones: current.milestones,
    };
  }

  return undefined;
}

export { negotiations };
