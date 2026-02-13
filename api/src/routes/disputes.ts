import { Router, Request, Response } from 'express';
import { body, param } from 'express-validator';
import { validate } from '../middleware/validation';
import logger, { logAgentAction } from '../utils/logger';

export const disputesRouter = Router();

// Dispute storage
const disputes = new Map<string, Dispute>();

interface Dispute {
  id: string;
  taskId: string;
  initiatorId: string;
  respondentId: string;
  reason: string;
  status: 'open' | 'under_review' | 'resolved';
  resolution?: 'refund_poster' | 'pay_agent' | 'split';
  arbitratorId?: string;
  resolutionReason?: string;
  createdAt: number;
  resolvedAt?: number;
  evidence: Evidence[];
}

interface Evidence {
  partyId: string;
  type: 'message' | 'delivery' | 'screenshot' | 'other';
  content: string;
  submittedAt: number;
}

// Get all disputes
// GET /api/disputes
disputesRouter.get('/', (req: Request, res: Response) => {
  const allDisputes = Array.from(disputes.values());
  const { status, taskId, initiatorId } = req.query;

  let filtered = allDisputes;

  if (status) {
    filtered = filtered.filter((d) => d.status === status);
  }

  if (taskId) {
    filtered = filtered.filter((d) => d.taskId === taskId);
  }

  if (initiatorId) {
    filtered = filtered.filter((d) => d.initiatorId === initiatorId);
  }

  // Sort by created date (newest first)
  filtered.sort((a, b) => b.createdAt - a.createdAt);

  res.json({
    disputes: filtered,
    count: filtered.length,
    total: allDisputes.length,
  });
});

// Get dispute by ID
// GET /api/disputes/:id
disputesRouter.get(
  '/:id',
  [param('id').isString().trim()],
  validate,
  (req: Request, res: Response) => {
    const dispute = disputes.get(req.params.id);

    if (!dispute) {
      return res.status(404).json({
        error: 'Dispute not found',
        id: req.params.id,
      });
    }

    res.json({ dispute });
  }
);

// Initiate a dispute
// POST /api/disputes
disputesRouter.post(
  '/',
  [
    body('taskId').isString().withMessage('Task ID is required'),
    body('initiatorId').isString().withMessage('Initiator ID is required'),
    body('respondentId').isString().withMessage('Respondent ID is required'),
    body('reason')
      .isString()
      .isLength({ min: 10, max: 500 })
      .withMessage('Reason must be 10-500 characters'),
    validate,
  ],
  (req: Request, res: Response) => {
    const { taskId, initiatorId, respondentId, reason } = req.body;

    // Check if dispute already exists for this task
    const existingDispute = Array.from(disputes.values()).find(
      (d) => d.taskId === taskId && d.status !== 'resolved'
    );

    if (existingDispute) {
      return res.status(409).json({
        error: 'Active dispute already exists for this task',
        disputeId: existingDispute.id,
      });
    }

    const dispute: Dispute = {
      id: `dispute-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      taskId,
      initiatorId,
      respondentId,
      reason,
      status: 'open',
      createdAt: Date.now(),
      evidence: [],
    };

    disputes.set(dispute.id, dispute);

    logger.info('Dispute initiated', {
      disputeId: dispute.id,
      taskId,
      initiatorId,
      respondentId,
    });

    logAgentAction(initiatorId, 'initiated_dispute', {
      disputeId: dispute.id,
      taskId,
    });

    res.status(201).json({
      message: 'Dispute initiated successfully',
      dispute,
    });
  }
);

// Submit evidence
// POST /api/disputes/:id/evidence
disputesRouter.post(
  '/:id/evidence',
  [
    param('id').isString().trim(),
    body('partyId').isString().withMessage('Party ID is required'),
    body('type')
      .isIn(['message', 'delivery', 'screenshot', 'other'])
      .withMessage('Invalid evidence type'),
    body('content')
      .isString()
      .isLength({ min: 1, max: 2000 })
      .withMessage('Content must be 1-2000 characters'),
    validate,
  ],
  (req: Request, res: Response) => {
    const { id } = req.params;
    const { partyId, type, content } = req.body;

    const dispute = disputes.get(id);

    if (!dispute) {
      return res.status(404).json({
        error: 'Dispute not found',
        id,
      });
    }

    if (dispute.status === 'resolved') {
      return res.status(400).json({
        error: 'Cannot add evidence to resolved dispute',
      });
    }

    // Verify party is involved in dispute
    if (partyId !== dispute.initiatorId && partyId !== dispute.respondentId) {
      return res.status(403).json({
        error: 'Only involved parties can submit evidence',
      });
    }

    const evidence: Evidence = {
      partyId,
      type,
      content,
      submittedAt: Date.now(),
    };

    dispute.evidence.push(evidence);

    logger.info('Evidence submitted', {
      disputeId: id,
      partyId,
      evidenceType: type,
    });

    res.json({
      message: 'Evidence submitted successfully',
      evidence,
      dispute,
    });
  }
);

// Resolve a dispute (arbitrator only)
// POST /api/disputes/:id/resolve
disputesRouter.post(
  '/:id/resolve',
  [
    param('id').isString().trim(),
    body('arbitratorId').isString().withMessage('Arbitrator ID is required'),
    body('resolution')
      .isIn(['refund_poster', 'pay_agent', 'split'])
      .withMessage('Resolution must be refund_poster, pay_agent, or split'),
    body('reason')
      .optional()
      .isString()
      .isLength({ max: 1000 })
      .withMessage('Reason max 1000 characters'),
    validate,
  ],
  (req: Request, res: Response) => {
    const { id } = req.params;
    const { arbitratorId, resolution, reason } = req.body;

    const dispute = disputes.get(id);

    if (!dispute) {
      return res.status(404).json({
        error: 'Dispute not found',
        id,
      });
    }

    if (dispute.status === 'resolved') {
      return res.status(400).json({
        error: 'Dispute already resolved',
        resolvedAt: dispute.resolvedAt,
      });
    }

    // In production, verify arbitrator is authorized
    // For now, any ID can resolve (demo purposes)

    dispute.status = 'resolved';
    dispute.resolution = resolution;
    dispute.arbitratorId = arbitratorId;
    dispute.resolutionReason = reason;
    dispute.resolvedAt = Date.now();

    logger.info('Dispute resolved', {
      disputeId: id,
      arbitratorId,
      resolution,
      taskId: dispute.taskId,
    });

    logAgentAction(arbitratorId, 'resolved_dispute', {
      disputeId: id,
      taskId: dispute.taskId,
      resolution,
    });

    res.json({
      message: 'Dispute resolved successfully',
      dispute,
    });
  }
);

// Get disputes for a specific agent
// GET /api/disputes/agent/:agentId
disputesRouter.get(
  '/agent/:agentId',
  [param('agentId').isString().trim()],
  validate,
  (req: Request, res: Response) => {
    const { agentId } = req.params;

    const agentDisputes = Array.from(disputes.values()).filter(
      (d) => d.initiatorId === agentId || d.respondentId === agentId
    );

    // Sort by created date (newest first)
    agentDisputes.sort((a, b) => b.createdAt - a.createdAt);

    const stats = {
      total: agentDisputes.length,
      initiated: agentDisputes.filter((d) => d.initiatorId === agentId).length,
      respondent: agentDisputes.filter((d) => d.respondentId === agentId).length,
      open: agentDisputes.filter((d) => d.status === 'open').length,
      resolved: agentDisputes.filter((d) => d.status === 'resolved').length,
    };

    res.json({
      agentId,
      disputes: agentDisputes,
      stats,
    });
  }
);

// Get dispute statistics
// GET /api/disputes/stats/overview
disputesRouter.get('/stats/overview', (req: Request, res: Response) => {
  const allDisputes = Array.from(disputes.values());

  const stats = {
    total: allDisputes.length,
    open: allDisputes.filter((d) => d.status === 'open').length,
    underReview: allDisputes.filter((d) => d.status === 'under_review').length,
    resolved: allDisputes.filter((d) => d.status === 'resolved').length,
    resolutions: {
      refundPoster: allDisputes.filter(
        (d) => d.status === 'resolved' && d.resolution === 'refund_poster'
      ).length,
      payAgent: allDisputes.filter(
        (d) => d.status === 'resolved' && d.resolution === 'pay_agent'
      ).length,
      split: allDisputes.filter(
        (d) => d.status === 'resolved' && d.resolution === 'split'
      ).length,
    },
    averageResolutionTime: calculateAverageResolutionTime(allDisputes),
  };

  res.json({ stats });
});

function calculateAverageResolutionTime(disputes: Dispute[]): number | null {
  const resolved = disputes.filter(
    (d) => d.status === 'resolved' && d.resolvedAt && d.createdAt
  );

  if (resolved.length === 0) return null;

  const totalTime = resolved.reduce((sum, d) => {
    return sum + (d.resolvedAt! - d.createdAt);
  }, 0);

  return Math.round(totalTime / resolved.length);
}

export { disputes };
