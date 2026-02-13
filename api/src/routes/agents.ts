import { Router } from 'express';

// In-memory agent registry
const agents = new Map();

export const agentRouter = Router();

// Register agent
agentRouter.post('/register', (req, res) => {
  const { agentId, name, skills, walletAddress } = req.body;

  const agent = {
    id: agentId,
    name,
    skills,
    walletAddress,
    reputation: {
      completedTasks: 0,
      failedTasks: 0,
      successRate: 0,
      totalEarned: 0,
      rating: 0,
    },
    status: 'available',
    createdAt: Date.now(),
  };

  agents.set(agentId, agent);

  res.status(201).json({
    message: 'Agent registered',
    agent,
  });
});

// Get agent by ID
agentRouter.get('/:id', (req, res) => {
  const agent = agents.get(req.params.id);
  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' });
  }
  res.json(agent);
});

// List all agents
agentRouter.get('/', (req, res) => {
  const agentList = Array.from(agents.values());
  res.json({ agents: agentList });
});

// Update agent status
agentRouter.post('/:id/status', (req, res) => {
  const agent = agents.get(req.params.id);
  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' });
  }

  const { status } = req.body;
  agent.status = status;

  res.json({
    message: 'Status updated',
    agent,
  });
});

// Update reputation (called after task completion)
agentRouter.post('/:id/reputation', (req, res) => {
  const agent = agents.get(req.params.id);
  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' });
  }

  const { earned, success } = req.body;

  if (success) {
    agent.reputation.completedTasks += 1;
    agent.reputation.totalEarned += earned;
  } else {
    agent.reputation.failedTasks += 1;
  }

  const total = agent.reputation.completedTasks + agent.reputation.failedTasks;
  agent.reputation.successRate = (agent.reputation.completedTasks / total) * 100;

  res.json({
    message: 'Reputation updated',
    reputation: agent.reputation,
  });
});

export { agents };
