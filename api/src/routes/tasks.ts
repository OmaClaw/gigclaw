import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';

// In-memory store (replace with DB in production)
const tasks = new Map();

export const taskRouter = Router();

// Get all open tasks
taskRouter.get('/', (req, res) => {
  const openTasks = Array.from(tasks.values())
    .filter((t: any) => t.status === 'posted')
    .sort((a: any, b: any) => b.createdAt - a.createdAt);
  
  res.json({ tasks: openTasks });
});

// Get task by ID
taskRouter.get('/:id', (req, res) => {
  const task = tasks.get(req.params.id);
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }
  res.json(task);
});

// Create new task
taskRouter.post('/', (req, res) => {
  const { title, description, budget, deadline, requiredSkills, posterId } = req.body;
  
  const taskId = uuidv4();
  const task = {
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
  };
  
  tasks.set(taskId, task);
  
  res.status(201).json({ 
    message: 'Task created',
    taskId,
    task 
  });
});

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
    id: uuidv4(),
    agentId,
    amount,
    estimatedDuration,
    createdAt: Date.now(),
    accepted: false,
  };
  
  task.bids.push(bid);
  
  res.json({ 
    message: 'Bid placed',
    bid 
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
    task 
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
    task 
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
    task 
  });
});

export { tasks };
