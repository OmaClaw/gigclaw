import { Router, Request, Response, NextFunction } from 'express';
import { createTaskValidation } from '../middleware/validation';
import { triggerWebhook } from '../routes/webhooks';
import { getTasksFromChain, createTaskOnChain } from '../services/solana';
import { wsService } from '../services/websocket';
import logger from '../utils/logger';

// In-memory store (fallback when Solana unavailable)
const tasks = new Map<string, any>();

export const taskRouter = Router();

// Get all open tasks - read from Solana, fallback to memory
taskRouter.get('/', async (req, res) => {
  try {
    // Try to get tasks from blockchain
    const chainTasks = await getTasksFromChain();

    if (chainTasks.length > 0) {
      // Merge with any in-memory tasks not yet on chain
      const memoryTasks = Array.from(tasks.values()).filter(
        (t: any) => !t.onChain && t.status === 'posted'
      );

      const allTasks = [...chainTasks, ...memoryTasks].sort(
        (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      return res.json({
        tasks: allTasks,
        source: chainTasks.length > 0 ? 'blockchain' : 'memory',
        chainCount: chainTasks.length,
        memoryCount: memoryTasks.length,
      });
    }

    // Fallback to in-memory
    const openTasks = Array.from(tasks.values())
      .filter((t: any) => t.status === 'posted')
      .sort((a: any, b: any) => b.createdAt - a.createdAt);

    res.json({
      tasks: openTasks,
      source: 'memory',
      note: 'No tasks found on blockchain yet',
    });
  } catch (_error) {
    // Fallback to in-memory on error
    const openTasks = Array.from(tasks.values())
      .filter((t: any) => t.status === 'posted')
      .sort((a: any, b: any) => b.createdAt - a.createdAt);

    res.json({
      tasks: openTasks,
      source: 'memory',
      error: 'Failed to read from blockchain',
    });
  }
});

// Get task by ID
taskRouter.get('/:id', (req, res) => {
  const task = tasks.get(req.params.id);
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }
  res.json(task);
});

// Create new task - save to memory AND create on blockchain
taskRouter.post(
  '/',
  createTaskValidation,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { title, description, budget, deadline, requiredSkills, posterId } = req.body;

      // Generate short task ID (max 16 chars for Solana PDA seeds)
      const taskId = `task${Date.now().toString(36).slice(-8)}${Math.random().toString(36).slice(2, 6)}`;
      const task: any = {
        id: taskId,
        title,
        description,
        budget,
        deadline,
        requiredSkills,
        posterId,
        status: 'posted',
        assignedAgent: null,
        bids: [],
        createdAt: Date.now(),
        completedAt: null,
        onChain: false,
        signature: null as string | null,
      };

      tasks.set(taskId, task);

      // Broadcast to WebSocket clients
      wsService.broadcastTaskCreated(task);
      logger.info('Task created and broadcasted', { taskId, posterId });

      // Trigger webhook
      triggerWebhook('task.created', {
        taskId,
        title,
        budget,
        posterId,
        requiredSkills,
      });

      // Create on blockchain with funded wallet
      let blockchainResult: any = {
        status: 'pending',
        note: 'Blockchain creation not attempted',
      };

      try {
        console.log(`[Task] Creating task ${taskId} on blockchain...`);
        const result = await createTaskOnChain(
          taskId,
          title,
          description,
          budget,
          new Date(deadline),
          requiredSkills
        );

        if (result.success) {
          task.onChain = true;
          task.signature = result.signature;
          blockchainResult = {
            status: 'confirmed',
            signature: result.signature,
            explorer: `https://explorer.solana.com/tx/${result.signature}?cluster=devnet`,
          };
          console.log(`[Task] ✅ Task ${taskId} created on chain:`, result.signature);
        } else {
          blockchainResult = {
            status: 'failed',
            error: result.error,
            note: 'Task saved to API but blockchain creation failed',
          };
          console.error(`[Task] ❌ Blockchain creation failed:`, result.error);
        }
      } catch (_chainError: any) {
        blockchainResult = {
          status: 'error',
          error: _chainError.message,
          note: 'Task saved to API but blockchain creation error',
        };
        console.error(`[Task] ❌ Blockchain error:`, _chainError.message);
      }

      res.status(201).json({
        message: 'Task created',
        taskId,
        task,
        blockchain: blockchainResult,
      });
    } catch (_error) {
      next(_error);
    }
  }
);

// Bid on task
taskRouter.post('/:id/bid', (req, res) => {
  const task = tasks.get(req.params.id);
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  if (task.status !== 'posted') {
    return res.status(400).json({ error: 'Task is not open for bidding' });
  }

  const { agentId, amount, estimatedDuration } = req.body;

  const bid = {
    id: `bid${Date.now().toString(36).slice(-6)}${Math.random().toString(36).slice(2, 5)}`,
    agentId,
    amount,
    estimatedDuration,
    createdAt: Date.now(),
    accepted: false,
  };

  task.bids.push(bid);

  res.json({
    message: 'Bid placed',
    bid,
  });
});

// Accept bid
taskRouter.post('/:id/accept', (req, res) => {
  const task = tasks.get(req.params.id);
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  const { bidId } = req.body;
  const bid = task.bids.find((b: any) => b.id === bidId);

  if (!bid) {
    return res.status(404).json({ error: 'Bid not found' });
  }

  bid.accepted = true;
  task.assignedAgent = bid.agentId;
  task.status = 'in_progress';
  task.acceptedBid = bid;

  res.json({
    message: 'Bid accepted',
    task,
  });
});

// Complete task
taskRouter.post('/:id/complete', (req, res) => {
  const task = tasks.get(req.params.id);
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  const { agentId, deliveryUrl } = req.body;

  if (task.assignedAgent !== agentId) {
    return res.status(403).json({ error: 'Not assigned to this task' });
  }

  task.status = 'completed';
  task.deliveryUrl = deliveryUrl;
  task.completedAt = Date.now();

  res.json({
    message: 'Task completed',
    task,
  });
});

// Verify and pay
taskRouter.post('/:id/verify', (req, res) => {
  const task = tasks.get(req.params.id);
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  task.status = 'verified';

  res.json({
    message: 'Task verified and payment released',
    task,
  });
});

export { tasks };
