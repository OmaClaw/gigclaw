import { Router, Request, Response } from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validation';

export const standupRouter = Router();

// Standup meeting storage
const standups = new Map<string, any[]>(); // agentId -> standup history

// GET /api/standups - List all standups
standupRouter.get('/', (req: Request, res: Response) => {
  const allStandups: any[] = [];
  standups.forEach((agentStandups, agentId) => {
    agentStandups.forEach(standup => {
      allStandups.push({ ...standup, agentId });
    });
  });

  // Sort by timestamp descending
  allStandups.sort((a, b) => b.timestamp - a.timestamp);

  res.json({
    standups: allStandups.slice(0, 50), // Last 50
    count: allStandups.length,
    activeAgents: standups.size,
  });
});

// Agent memory/action items
interface AgentMemory {
  agentId: string;
  lastStandup: number;
  actionItems: string[];
  lessonsLearned: string[];
  performance: {
    tasksCompleted: number;
    tasksFailed: number;
    reputation: number;
  };
  relationships: Map<string, number>; // otherAgentId -> sentiment (-1 to 1)
}

const agentMemories = new Map<string, AgentMemory>();

// Initialize agent memory
function getOrCreateMemory(agentId: string): AgentMemory {
  if (!agentMemories.has(agentId)) {
    agentMemories.set(agentId, {
      agentId,
      lastStandup: 0,
      actionItems: [],
      lessonsLearned: [],
      performance: {
        tasksCompleted: 0,
        tasksFailed: 0,
        reputation: 50, // Starting reputation
      },
      relationships: new Map(),
    });
  }
  return agentMemories.get(agentId)!;
}

// Conduct standup meeting
standupRouter.post(
  '/conduct',
  [
    body('agentId').isString().withMessage('Agent ID required'),
    body('period')
      .optional()
      .isIn(['daily', 'weekly'])
      .withMessage('Period must be daily or weekly'),
    body('insights').optional().isArray(),
    body('challenges').optional().isArray(),
    validate,
  ],
  (req: Request, res: Response) => {
    const { agentId, period = 'daily', insights = [], challenges = [] } = req.body;

    const memory = getOrCreateMemory(agentId);
    const now = Date.now();

    // Generate standup report
    const standup = {
      id: `standup-${now}`,
      agentId,
      period,
      timestamp: now,
      insights,
      challenges,
      performance: { ...memory.performance },
      actionItems: [...memory.actionItems],
      relationships: Object.fromEntries(memory.relationships),
    };

    // Store standup
    if (!standups.has(agentId)) {
      standups.set(agentId, []);
    }
    standups.get(agentId)!.push(standup);

    // Update last standup time
    memory.lastStandup = now;

    // Generate new action items from insights
    insights.forEach((insight: string) => {
      const actionItem = `Follow up: ${insight}`;
      if (!memory.actionItems.includes(actionItem)) {
        memory.actionItems.push(actionItem);
      }
    });

    // Clear completed challenges
    memory.actionItems = memory.actionItems.filter(
      item => !challenges.some((c: string) => item.includes(c))
    );

    res.json({
      message: 'Standup conducted',
      standup,
      nextStandup: period === 'daily' ? now + 24 * 60 * 60 * 1000 : now + 7 * 24 * 60 * 60 * 1000,
      pendingActionItems: memory.actionItems.length,
    });
  }
);

// Get agent's standup history
standupRouter.get('/history/:agentId', (req, res) => {
  const history = standups.get(req.params.agentId) || [];
  const memory = agentMemories.get(req.params.agentId);

  res.json({
    agentId: req.params.agentId,
    standups: history.slice(-30), // Last 30 standups
    totalStandups: history.length,
    lastStandup: memory?.lastStandup || null,
    streak: calculateStreak(history),
  });
});

// Record relationship update between agents
standupRouter.post(
  '/relationship',
  [
    body('agentId').isString().withMessage('Agent ID required'),
    body('otherAgentId').isString().withMessage('Other agent ID required'),
    body('interaction')
      .isString()
      .isIn(['positive', 'negative', 'neutral', 'collaborated', 'conflict']),
    body('context').optional().isString(),
    validate,
  ],
  (req: Request, res: Response) => {
    const { agentId, otherAgentId, interaction, context = '' } = req.body;

    const memory = getOrCreateMemory(agentId);
    const otherMemory = getOrCreateMemory(otherAgentId);

    // Calculate sentiment change
    let sentimentChange = 0;
    switch (interaction) {
      case 'positive':
      case 'collaborated':
        sentimentChange = 0.1;
        break;
      case 'negative':
      case 'conflict':
        sentimentChange = -0.15;
        break;
      case 'neutral':
        sentimentChange = 0;
        break;
    }

    // Update relationship (range: -1 to 1)
    const currentSentiment = memory.relationships.get(otherAgentId) || 0;
    const newSentiment = Math.max(-1, Math.min(1, currentSentiment + sentimentChange));
    memory.relationships.set(otherAgentId, newSentiment);

    // Reciprocal relationship (other agent also updates view)
    const otherCurrentSentiment = otherMemory.relationships.get(agentId) || 0;
    const otherNewSentiment = Math.max(
      -1,
      Math.min(1, otherCurrentSentiment + sentimentChange * 0.8)
    ); // Slightly dampened
    otherMemory.relationships.set(agentId, otherNewSentiment);

    // Log lesson learned for significant changes
    if (Math.abs(sentimentChange) > 0.1) {
      const lesson = `${interaction === 'conflict' ? 'Avoid' : 'Collaborate with'} ${otherAgentId}: ${context}`;
      memory.lessonsLearned.push(lesson);

      // Keep only last 50 lessons
      if (memory.lessonsLearned.length > 50) {
        memory.lessonsLearned.shift();
      }
    }

    res.json({
      message: 'Relationship updated',
      relationship: {
        agentId,
        otherAgentId,
        sentiment: newSentiment,
        status: getRelationshipStatus(newSentiment),
        interaction,
        context,
      },
    });
  }
);

// Get agent's relationships
standupRouter.get('/relationships/:agentId', (req, res) => {
  const memory = agentMemories.get(req.params.agentId);

  if (!memory) {
    return res.json({
      agentId: req.params.agentId,
      relationships: [],
      summary: { allies: 0, rivals: 0, neutral: 0 },
    });
  }

  const relationships = Array.from(memory.relationships.entries()).map(([otherId, sentiment]) => ({
    agentId: otherId,
    sentiment,
    status: getRelationshipStatus(sentiment),
  }));

  const summary = {
    allies: relationships.filter(r => r.sentiment > 0.3).length,
    rivals: relationships.filter(r => r.sentiment < -0.3).length,
    neutral: relationships.filter(r => r.sentiment >= -0.3 && r.sentiment <= 0.3).length,
  };

  res.json({
    agentId: req.params.agentId,
    relationships,
    summary,
  });
});

// Update agent performance
standupRouter.post(
  '/performance',
  [
    body('agentId').isString().withMessage('Agent ID required'),
    body('taskCompleted').optional().isBoolean(),
    body('taskFailed').optional().isBoolean(),
    body('reputationDelta').optional().isInt(),
    validate,
  ],
  (req: Request, res: Response) => {
    const { agentId, taskCompleted, taskFailed, reputationDelta = 0 } = req.body;

    const memory = getOrCreateMemory(agentId);

    if (taskCompleted) {
      memory.performance.tasksCompleted++;
      memory.performance.reputation = Math.min(100, memory.performance.reputation + 2);
    }

    if (taskFailed) {
      memory.performance.tasksFailed++;
      memory.performance.reputation = Math.max(0, memory.performance.reputation - 5);
    }

    memory.performance.reputation = Math.max(
      0,
      Math.min(100, memory.performance.reputation + reputationDelta)
    );

    // Derive lesson from failure
    if (taskFailed) {
      memory.lessonsLearned.push(`Failed task: ${new Date().toISOString()} - Review and improve`);
    }

    res.json({
      message: 'Performance updated',
      performance: memory.performance,
    });
  }
);

// Get agent memory (action items, lessons, etc.)
standupRouter.get('/memory/:agentId', (req, res) => {
  const memory = getOrCreateMemory(req.params.agentId);

  res.json({
    agentId: req.params.agentId,
    actionItems: memory.actionItems,
    lessonsLearned: memory.lessonsLearned.slice(-20), // Last 20 lessons
    performance: memory.performance,
    lastStandup: memory.lastStandup,
    relationshipCount: memory.relationships.size,
  });
});

// Autonomous improvement suggestions
standupRouter.post(
  '/improve',
  [body('agentId').isString().withMessage('Agent ID required'), validate],
  (req: Request, res: Response) => {
    const { agentId } = req.body;
    const memory = getOrCreateMemory(agentId);

    // Generate improvement suggestions based on history
    const suggestions: string[] = [];

    // Based on failures
    if (memory.performance.tasksFailed > memory.performance.tasksCompleted * 0.3) {
      suggestions.push('High failure rate detected. Consider specializing in fewer skill areas.');
    }

    // Based on relationships
    const rivals = Array.from(memory.relationships.entries()).filter(([, s]) => s < -0.3);
    if (rivals.length > 2) {
      suggestions.push(
        `Multiple agent conflicts detected. Consider mediation or focus on collaboration.`
      );
    }

    // Based on standup consistency
    const history = standups.get(agentId) || [];
    const lastWeek = history.filter(s => s.timestamp > Date.now() - 7 * 24 * 60 * 60 * 1000);
    if (lastWeek.length < 7) {
      suggestions.push('Inconsistent standup participation. Daily check-ins improve coordination.');
    }

    // Based on action items
    if (memory.actionItems.length > 10) {
      suggestions.push('High backlog of action items. Consider prioritizing or delegating.');
    }

    res.json({
      agentId,
      suggestions,
      generatedAt: Date.now(),
      nextReview: Date.now() + 24 * 60 * 60 * 1000,
    });
  }
);

// Helper functions
function calculateStreak(history: any[]): number {
  if (history.length === 0) return 0;

  const oneDay = 24 * 60 * 60 * 1000;
  let streak = 0;
  const now = Date.now();

  for (let i = history.length - 1; i >= 0; i--) {
    const daysAgo = Math.floor((now - history[i].timestamp) / oneDay);
    if (daysAgo === streak) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

function getRelationshipStatus(sentiment: number): string {
  if (sentiment > 0.7) return 'close ally';
  if (sentiment > 0.3) return 'friendly';
  if (sentiment > -0.3) return 'neutral';
  if (sentiment > -0.7) return 'strained';
  return 'rival';
}

export { standups, agentMemories };
