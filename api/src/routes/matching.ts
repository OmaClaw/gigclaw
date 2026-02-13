import { Router } from 'express';
import { tasks } from './tasks';
import { agents } from './agents';

export const matchingRouter = Router();

// Find best agents for a task
matchingRouter.post('/find-agents', (req, res) => {
  const { taskId } = req.body;
  const task = tasks.get(taskId);

  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  // Score all available agents
  const scoredAgents = Array.from(agents.values())
    .filter((agent: any) => agent.status === 'available')
    .map((agent: any) => {
      let score = 0;

      // Skill match
      const skillMatches = task.requiredSkills.filter((skill: string) =>
        agent.skills.includes(skill)
      ).length;
      score += skillMatches * 20;

      // Reputation
      score += agent.reputation.successRate * 0.5;
      score += Math.min(agent.reputation.completedTasks, 10);

      // Success rate bonus
      if (agent.reputation.successRate > 90) score += 10;

      return {
        agent,
        score,
        skillMatches,
      };
    })
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, 5); // Top 5 matches

  res.json({
    taskId,
    matches: scoredAgents,
  });
});

// Auto-match task to best agent
matchingRouter.post('/auto-match', (req, res) => {
  const { taskId } = req.body;
  const task = tasks.get(taskId);

  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  // Find best match
  const bestMatch = Array.from(agents.values())
    .filter((agent: any) => agent.status === 'available')
    .map((agent: any) => {
      let score = 0;

      const skillMatches = task.requiredSkills.filter((skill: string) =>
        agent.skills.includes(skill)
      ).length;
      score += skillMatches * 20;
      score += agent.reputation.successRate * 0.5;
      score += Math.min(agent.reputation.completedTasks, 10);

      return { agent, score };
    })
    .sort((a: any, b: any) => b.score - a.score)[0];

  if (!bestMatch) {
    return res.status(404).json({ error: 'No available agents found' });
  }

  res.json({
    taskId,
    recommendedAgent: bestMatch.agent,
    matchScore: bestMatch.score,
  });
});

// Get recommended tasks for an agent
matchingRouter.post('/recommend-tasks', (req, res) => {
  const { agentId } = req.body;
  const agent = agents.get(agentId);

  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' });
  }

  // Score all open tasks
  const scoredTasks = Array.from(tasks.values())
    .filter((task: any) => task.status === 'posted')
    .map((task: any) => {
      let score = 0;

      // Skill match
      const skillMatches = task.requiredSkills.filter((skill: string) =>
        agent.skills.includes(skill)
      ).length;
      score += skillMatches * 25;

      // Budget preference (agents prefer higher budget)
      score += Math.min(task.budget / 1000000, 20); // Max 20 points for budget

      // Urgency (closer deadline = higher score)
      const daysUntilDeadline = (task.deadline - Date.now()) / (1000 * 60 * 60 * 24);
      if (daysUntilDeadline < 1) score += 15;
      else if (daysUntilDeadline < 3) score += 10;
      else if (daysUntilDeadline < 7) score += 5;

      return {
        task,
        score,
        skillMatches,
      };
    })
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, 5);

  res.json({
    agentId,
    recommendations: scoredTasks,
  });
});
