import { Router, Request, Response } from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validation';

export const bidRouter = Router();

// In-memory store (replace with DB in production)
const bids = new Map<string, any[]>(); // taskId -> bids[]

// Submit a bid
bidRouter.post('/', [
  body('taskId').isString().withMessage('Task ID required'),
  body('agentId').isString().withMessage('Agent ID required'),
  body('proposedPrice').isFloat({ min: 0.01 }).withMessage('Valid price required'),
  body('estimatedHours').optional().isInt({ min: 1 }),
  body('relevantSkills').optional().isArray(),
  body('message').optional().isString().isLength({ max: 500 }),
  validate
], (req: Request, res: Response) => {
  const { taskId, agentId, proposedPrice, estimatedHours, relevantSkills, message } = req.body;
  
  const bid = {
    id: `bid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    taskId,
    agentId,
    proposedPrice,
    estimatedHours: estimatedHours || null,
    relevantSkills: relevantSkills || [],
    message: message || '',
    status: 'pending',
    createdAt: Date.now()
  };
  
  if (!bids.has(taskId)) {
    bids.set(taskId, []);
  }
  bids.get(taskId)!.push(bid);
  
  res.status(201).json({
    message: 'Bid submitted successfully',
    bidId: bid.id,
    bid
  });
});

// Get bids for a task
bidRouter.get('/task/:taskId', (req, res) => {
  const taskBids = bids.get(req.params.taskId) || [];
  res.json({
    bids: taskBids,
    count: taskBids.length
  });
});

// Get bids by agent
bidRouter.get('/agent/:agentId', (req, res) => {
  const agentBids: any[] = [];
  bids.forEach((taskBids) => {
    taskBids.forEach(bid => {
      if (bid.agentId === req.params.agentId) {
        agentBids.push(bid);
      }
    });
  });
  
  res.json({
    bids: agentBids,
    count: agentBids.length
  });
});

// Accept a bid (mark others as rejected)
bidRouter.post('/:bidId/accept', (req, res) => {
  const { bidId } = req.params;
  
  let foundBid = null;
  let taskId = null;
  
  bids.forEach((taskBids, tid) => {
    const bid = taskBids.find(b => b.id === bidId);
    if (bid) {
      foundBid = bid;
      taskId = tid;
    }
  });
  
  if (!foundBid) {
    return res.status(404).json({ error: 'Bid not found' });
  }
  
  // Mark this bid as accepted
  foundBid.status = 'accepted';
  
  // Mark other bids as rejected
  const taskBids = bids.get(taskId) || [];
  taskBids.forEach(bid => {
    if (bid.id !== bidId) {
      bid.status = 'rejected';
    }
  });
  
  res.json({
    message: 'Bid accepted',
    bid: foundBid,
    taskId
  });
});

// Reject a bid
bidRouter.post('/:bidId/reject', (req, res) => {
  const { bidId } = req.params;
  
  let foundBid = null;
  
  bids.forEach((taskBids) => {
    const bid = taskBids.find(b => b.id === bidId);
    if (bid) {
      foundBid = bid;
    }
  });
  
  if (!foundBid) {
    return res.status(404).json({ error: 'Bid not found' });
  }
  
  foundBid.status = 'rejected';
  
  res.json({
    message: 'Bid rejected',
    bid: foundBid
  });
});

export { bids };
