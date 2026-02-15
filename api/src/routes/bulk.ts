import { Router, Request, Response } from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validation';
import { tasks } from './tasks';
import { wsService } from '../services/websocket';
import logger from '../utils/logger';

export const bulkRouter = Router();

// Bulk create tasks
// POST /api/bulk/tasks/create
bulkRouter.post(
  '/tasks/create',
  [
    body('tasks').isArray({ min: 1, max: 50 }),
    body('tasks.*.title').isString().isLength({ min: 3, max: 200 }),
    body('tasks.*.budget').isFloat({ min: 1 }),
    validate,
  ],
  async (req: Request, res: Response) => {
    const { tasks: taskList } = req.body;
    const results = [];
    const errors = [];

    for (const taskData of taskList) {
      try {
        const taskId = `task${Date.now().toString(36).slice(-6)}${Math.random()
          .toString(36)
          .slice(2, 5)}`;

        const task = {
          id: taskId,
          ...taskData,
          status: 'posted',
          assignedAgent: null,
          bids: [],
          createdAt: Date.now(),
          completedAt: null,
          onChain: false,
          signature: null,
        };

        tasks.set(taskId, task);
        wsService.broadcastTaskCreated(task);

        results.push({
          success: true,
          taskId,
          task,
        });
      } catch (error) {
        errors.push({
          task: taskData,
          error: (error as Error).message,
        });
      }
    }

    logger.info('Bulk task creation', {
      attempted: taskList.length,
      succeeded: results.length,
      failed: errors.length,
    });

    res.status(201).json({
      message: `Created ${results.length} tasks`,
      results,
      errors: errors.length > 0 ? errors : undefined,
      summary: {
        attempted: taskList.length,
        succeeded: results.length,
        failed: errors.length,
      },
    });
  }
);

// Bulk update task status
// POST /api/bulk/tasks/update-status
bulkRouter.post(
  '/tasks/update-status',
  [
    body('updates').isArray({ min: 1, max: 100 }),
    body('updates.*.taskId').isString(),
    body('updates.*.status').isIn([
      'posted',
      'in_progress',
      'completed',
      'verified',
      'cancelled',
    ]),
    validate,
  ],
  (req: Request, res: Response) => {
    const { updates } = req.body;
    const results = [];
    const errors = [];

    for (const update of updates) {
      const task = tasks.get(update.taskId);

      if (!task) {
        errors.push({
          taskId: update.taskId,
          error: 'Task not found',
        });
        continue;
      }

      const oldStatus = task.status;
      task.status = update.status;

      if (update.status === 'completed') {
        task.completedAt = Date.now();
      }

      results.push({
        taskId: update.taskId,
        oldStatus,
        newStatus: update.status,
        success: true,
      });

      wsService.broadcastToChannel('tasks:updates', {
        type: 'status_change',
        taskId: update.taskId,
        oldStatus,
        newStatus: update.status,
      });
    }

    logger.info('Bulk task status update', {
      attempted: updates.length,
      succeeded: results.length,
      failed: errors.length,
    });

    res.json({
      message: `Updated ${results.length} tasks`,
      results,
      errors: errors.length > 0 ? errors : undefined,
      summary: {
        attempted: updates.length,
        succeeded: results.length,
        failed: errors.length,
      },
    });
  }
);

// Bulk delete tasks (admin only)
// POST /api/bulk/tasks/delete
bulkRouter.post(
  '/tasks/delete',
  [
    body('taskIds').isArray({ min: 1, max: 100 }),
    body('reason').optional().isString(),
    validate,
  ],
  (req: Request, res: Response) => {
    const { taskIds, reason } = req.body;
    const results = [];
    const errors = [];

    for (const taskId of taskIds) {
      const task = tasks.get(taskId);

      if (!task) {
        errors.push({
          taskId,
          error: 'Task not found',
        });
        continue;
      }

      // Only allow deletion of non-active tasks
      if (task.status === 'in_progress') {
        errors.push({
          taskId,
          error: 'Cannot delete task in progress',
        });
        continue;
      }

      tasks.delete(taskId);

      results.push({
        taskId,
        success: true,
      });

      wsService.broadcastToChannel('tasks:updates', {
        type: 'deleted',
        taskId,
        reason,
      });
    }

    logger.info('Bulk task deletion', {
      attempted: taskIds.length,
      deleted: results.length,
      failed: errors.length,
      reason,
    });

    res.json({
      message: `Deleted ${results.length} tasks`,
      results,
      errors: errors.length > 0 ? errors : undefined,
      summary: {
        attempted: taskIds.length,
        deleted: results.length,
        failed: errors.length,
      },
    });
  }
);

// Bulk accept bids
// POST /api/bulk/bids/accept
bulkRouter.post(
  '/bids/accept',
  [
    body('acceptances').isArray({ min: 1, max: 50 }),
    body('acceptances.*.taskId').isString(),
    body('acceptances.*.bidId').isString(),
    validate,
  ],
  (req: Request, res: Response) => {
    const { acceptances } = req.body;
    const results = [];
    const errors = [];

    for (const acceptance of acceptances) {
      const task = tasks.get(acceptance.taskId);

      if (!task) {
        errors.push({
          taskId: acceptance.taskId,
          error: 'Task not found',
        });
        continue;
      }

      const bid = task.bids?.find((b: any) => b.id === acceptance.bidId);

      if (!bid) {
        errors.push({
          taskId: acceptance.taskId,
          bidId: acceptance.bidId,
          error: 'Bid not found',
        });
        continue;
      }

      bid.accepted = true;
      task.assignedAgent = bid.agentId;
      task.status = 'in_progress';
      task.acceptedBid = bid;

      results.push({
        taskId: acceptance.taskId,
        bidId: acceptance.bidId,
        agentId: bid.agentId,
        success: true,
      });

      wsService.broadcastBidAccepted(acceptance.taskId, bid);
    }

    logger.info('Bulk bid acceptance', {
      attempted: acceptances.length,
      succeeded: results.length,
      failed: errors.length,
    });

    res.json({
      message: `Accepted ${results.length} bids`,
      results,
      errors: errors.length > 0 ? errors : undefined,
      summary: {
        attempted: acceptances.length,
        succeeded: results.length,
        failed: errors.length,
      },
    });
  }
);

// Get bulk operation status/history
// GET /api/bulk/status/:operationId
bulkRouter.get('/status/:operationId', (req: Request, res: Response) => {
  // In production, this would check a database for operation status
  res.json({
    operationId: req.params.operationId,
    status: 'completed',
    completedAt: Date.now(),
    message: 'Operation completed successfully',
  });
});

// Bulk operation statistics
// GET /api/bulk/stats
bulkRouter.get('/stats', (req: Request, res: Response) => {
  // In production, this would aggregate from database
  res.json({
    stats: {
      totalOperations: 0,
      tasksCreated: 0,
      tasksUpdated: 0,
      tasksDeleted: 0,
      bidsAccepted: 0,
      averageProcessingTime: 0,
    },
    note: 'Bulk operation stats tracking coming soon',
  });
});
