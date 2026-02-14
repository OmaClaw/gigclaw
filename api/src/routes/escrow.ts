import { Router, Request, Response } from 'express';
import { param, body } from 'express-validator';
import { validate } from '../middleware/validation';
import {
  getEscrowStatus,
  manualEscrowRelease,
  getEscrowConfig,
  updateEscrowConfig,
  initializeEscrowService,
} from '../services/escrow';
import { tasks } from './tasks';
import logger from '../utils/logger';

export const escrowRouter = Router();

// Initialize escrow service on module load
initializeEscrowService();

// Get escrow status for a task
// GET /api/escrow/:taskId/status
escrowRouter.get(
  '/:taskId/status',
  [param('taskId').isString().trim()],
  validate,
  (req: Request, res: Response) => {
    const status = getEscrowStatus(req.params.taskId);

    if (!status) {
      return res.status(404).json({
        error: 'Task not found',
        taskId: req.params.taskId,
      });
    }

    res.json({
      taskId: req.params.taskId,
      ...status,
    });
  }
);

// Manual release escrow (arbitrator only)
// POST /api/escrow/:taskId/release
escrowRouter.post(
  '/:taskId/release',
  [
    param('taskId').isString().trim(),
    body('arbitratorId').isString().withMessage('Arbitrator ID required'),
    body('reason').isString().withMessage('Reason required'),
  ],
  validate,
  async (req: Request, res: Response) => {
    const { taskId } = req.params;
    const { arbitratorId, reason } = req.body;

    const result = await manualEscrowRelease(taskId, arbitratorId, reason);

    if (!result.success) {
      return res.status(400).json({
        error: result.error,
        taskId,
      });
    }

    res.json({
      message: 'Escrow released successfully',
      taskId,
      payment: result.payment,
    });
  }
);

// Get escrow configuration
// GET /api/escrow/config
escrowRouter.get('/config', (req: Request, res: Response) => {
  res.json({
    config: getEscrowConfig(),
  });
});

// Update escrow configuration (admin only)
// POST /api/escrow/config
escrowRouter.post(
  '/config',
  [
    body('enabled').optional().isBoolean(),
    body('delayMs').optional().isInt({ min: 0 }),
    body('minAmount').optional().isFloat({ min: 0 }),
    body('maxAmount').optional().isFloat({ min: 0 }),
  ],
  validate,
  (req: Request, res: Response) => {
    // In production, verify admin authorization here

    const updates: any = {};
    if (req.body.enabled !== undefined) updates.enabled = req.body.enabled;
    if (req.body.delayMs !== undefined) updates.delayMs = req.body.delayMs;
    if (req.body.minAmount !== undefined) updates.minAmount = req.body.minAmount;
    if (req.body.maxAmount !== undefined) updates.maxAmount = req.body.maxAmount;

    updateEscrowConfig(updates);

    res.json({
      message: 'Configuration updated',
      config: getEscrowConfig(),
    });
  }
);

// Get all active escrows
// GET /api/escrow/active
escrowRouter.get('/active', (req: Request, res: Response) => {
  const activeEscrows = [];

  tasks.forEach((task, taskId) => {
    if (
      task.status === 'in_progress' ||
      task.status === 'completed' ||
      task.status === 'verified'
    ) {
      if (!task.paymentReleased) {
        activeEscrows.push({
          taskId,
          title: task.title,
          amount: task.acceptedBid?.amount,
          currency: task.currency,
          posterId: task.posterId,
          agentId: task.assignedAgent,
          status: task.status,
          createdAt: task.createdAt,
        });
      }
    }
  });

  res.json({
    escrows: activeEscrows,
    count: activeEscrows.length,
    totalValue: activeEscrows.reduce(
      (sum, e) => sum + (e.amount || 0),
      0
    ),
  });
});

// Get escrow statistics
// GET /api/escrow/stats/overview
escrowRouter.get('/stats/overview', (req: Request, res: Response) => {
  const stats = {
    totalEscrows: 0,
    activeEscrows: 0,
    releasedEscrows: 0,
    totalValueLocked: 0,
    totalValueReleased: 0,
    averageEscrowAmount: 0,
    autoReleaseRate: 0,
  };

  tasks.forEach((task) => {
    if (task.acceptedBid?.amount) {
      stats.totalEscrows++;

      if (task.paymentReleased) {
        stats.releasedEscrows++;
        stats.totalValueReleased += task.acceptedBid.amount;
      } else if (
        task.status === 'in_progress' ||
        task.status === 'completed' ||
        task.status === 'verified'
      ) {
        stats.activeEscrows++;
        stats.totalValueLocked += task.acceptedBid.amount;
      }
    }
  });

  if (stats.totalEscrows > 0) {
    stats.averageEscrowAmount =
      (stats.totalValueLocked + stats.totalValueReleased) /
      stats.totalEscrows;

    stats.autoReleaseRate =
      (stats.releasedEscrows / stats.totalEscrows) * 100;
  }

  res.json({ stats });
});

// Trigger auto-release for verified tasks (maintenance endpoint)
// POST /api/escrow/trigger-releases
escrowRouter.post('/trigger-releases', (req: Request, res: Response) => {
  // In production, add admin authorization

  let triggered = 0;
  tasks.forEach((task, taskId) => {
    if (
      task.status === 'verified' &&
      !task.paymentReleased &&
      !task.disputeId
    ) {
      const { scheduleEscrowRelease } = require('../services/escrow');
      scheduleEscrowRelease(taskId);
      triggered++;
    }
  });

  logger.info('Manual escrow release trigger', { triggered });

  res.json({
    message: `Triggered ${triggered} escrow releases`,
    triggered,
  });
});
