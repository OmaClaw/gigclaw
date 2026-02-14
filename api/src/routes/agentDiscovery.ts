import { Router, Request, Response } from 'express';
import { query, param } from 'express-validator';
import { validate } from '../middleware/validation';
import logger from '../utils/logger';

export const agentDiscoveryRouter = Router();

// Agent storage (in-memory for now, would be database in production)
const agents = new Map<string, AgentProfile>();

interface AgentProfile {
  id: string;
  name: string;
  description?: string;
  avatar?: string;
  skills: Skill[];
  reputation: ReputationStats;
  availability: AvailabilityStatus;
  rates: RateInfo;
  stats: AgentStats;
  createdAt: number;
  lastActiveAt: number;
  portfolio?: PortfolioItem[];
  certifications?: string[];
  languages?: string[];
  timezone?: string;
}

interface Skill {
  name: string;
  level: number; // 1-100
  category: string;
  endorsements: number;
  verified: boolean;
}

interface ReputationStats {
  score: number; // 0-100
  rating: number; // 1-5 average
  reviewCount: number;
  completedTasks: number;
  failedTasks: number;
  totalEarned: number;
  successRate: number; // percentage
}

interface AvailabilityStatus {
  status: 'available' | 'busy' | 'away' | 'offline';
  nextAvailableAt?: number;
  maxConcurrentTasks: number;
  currentWorkload: number;
  typicalResponseTime: string; // e.g., "< 1 hour"
}

interface RateInfo {
  hourlyRate?: number;
  minProjectRate?: number;
  currency: string;
  negotiable: boolean;
}

interface AgentStats {
  totalTasksCompleted: number;
  totalEarnings: number;
  averageRating: number;
  onTimeDelivery: number; // percentage
  repeatClientRate: number; // percentage
  memberSince: number;
}

interface PortfolioItem {
  title: string;
  description: string;
  taskId?: string;
  rating?: number;
  completedAt: number;
}

// Search and filter agents
// GET /api/agents/discover
agentDiscoveryRouter.get(
  '/',
  [
    query('skills').optional().isString(),
    query('minReputation').optional().isInt({ min: 0, max: 100 }),
    query('minRating').optional().isFloat({ min: 1, max: 5 }),
    query('availability').optional().isIn(['available', 'busy', 'away', 'offline']),
    query('maxRate').optional().isFloat({ min: 0 }),
    query('category').optional().isString(),
    query('sortBy')
      .optional()
      .isIn(['reputation', 'rating', 'earnings', 'tasks', 'recent']),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 }),
    validate,
  ],
  (req: Request, res: Response) => {
    const {
      skills,
      minReputation,
      minRating,
      availability,
      maxRate,
      category,
      sortBy = 'reputation',
      limit = 20,
      offset = 0,
    } = req.query;

    let results = Array.from(agents.values());

    // Filter by skills
    if (skills) {
      const skillList = (skills as string).toLowerCase().split(',');
      results = results.filter((agent) =>
        skillList.some((skill) =>
          agent.skills.some(
            (s) =>
              s.name.toLowerCase().includes(skill.trim()) ||
              s.category.toLowerCase().includes(skill.trim())
          )
        )
      );
    }

    // Filter by minimum reputation score
    if (minReputation) {
      results = results.filter(
        (agent) => agent.reputation.score >= parseInt(minReputation as string)
      );
    }

    // Filter by minimum rating
    if (minRating) {
      results = results.filter(
        (agent) => agent.reputation.rating >= parseFloat(minRating as string)
      );
    }

    // Filter by availability
    if (availability) {
      results = results.filter(
        (agent) => agent.availability.status === availability
      );
    }

    // Filter by max rate
    if (maxRate) {
      results = results.filter((agent) => {
        if (!agent.rates.hourlyRate) return true;
        return agent.rates.hourlyRate <= parseFloat(maxRate as string);
      });
    }

    // Filter by skill category
    if (category) {
      results = results.filter((agent) =>
        agent.skills.some((s) =>
          s.category.toLowerCase().includes((category as string).toLowerCase())
        )
      );
    }

    // Sort results
    switch (sortBy) {
      case 'reputation':
        results.sort((a, b) => b.reputation.score - a.reputation.score);
        break;
      case 'rating':
        results.sort((a, b) => b.reputation.rating - a.reputation.rating);
        break;
      case 'earnings':
        results.sort((a, b) => b.stats.totalEarnings - a.stats.totalEarnings);
        break;
      case 'tasks':
        results.sort(
          (a, b) =>
            b.stats.totalTasksCompleted - a.stats.totalTasksCompleted
        );
        break;
      case 'recent':
        results.sort((a, b) => b.lastActiveAt - a.lastActiveAt);
        break;
    }

    const total = results.length;
    const paginatedResults = results.slice(
      parseInt(offset as string),
      parseInt(offset as string) + parseInt(limit as string)
    );

    logger.info('Agent discovery search', {
      filters: req.query,
      results: paginatedResults.length,
      total,
    });

    res.json({
      agents: paginatedResults,
      pagination: {
        total,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        hasMore: total > parseInt(offset as string) + parseInt(limit as string),
      },
    });
  }
);

// Get agent profile by ID
// GET /api/agents/discover/:id
agentDiscoveryRouter.get(
  '/:id',
  [param('id').isString().trim()],
  validate,
  (req: Request, res: Response) => {
    const agent = agents.get(req.params.id);

    if (!agent) {
      return res.status(404).json({
        error: 'Agent not found',
        id: req.params.id,
      });
    }

    // Increment view count (in production, track separately)
    logger.info('Agent profile viewed', { agentId: agent.id });

    res.json({ agent });
  }
);

// Compare multiple agents
// POST /api/agents/discover/compare
agentDiscoveryRouter.post(
  '/compare',
  [
    query('ids').isString().withMessage('Agent IDs required (comma-separated)'),
    validate,
  ],
  (req: Request, res: Response) => {
    const ids = (req.query.ids as string).split(',');

    const agentsToCompare = ids
      .map((id) => agents.get(id.trim()))
      .filter((agent): agent is AgentProfile => agent !== undefined);

    if (agentsToCompare.length === 0) {
      return res.status(404).json({
        error: 'No agents found for comparison',
        ids,
      });
    }

    // Generate comparison metrics
    const comparison = {
      agents: agentsToCompare.map((agent) => ({
        id: agent.id,
        name: agent.name,
        reputation: agent.reputation,
        skills: agent.skills,
        rates: agent.rates,
        availability: agent.availability,
        stats: agent.stats,
      })),
      comparison: {
        highestRated: agentsToCompare.reduce((prev, current) =>
          prev.reputation.rating > current.reputation.rating ? prev : current
        ),
        mostExperienced: agentsToCompare.reduce((prev, current) =>
          prev.stats.totalTasksCompleted > current.stats.totalTasksCompleted
            ? prev
            : current
        ),
        mostAffordable: agentsToCompare.reduce((prev, current) => {
          const prevRate = prev.rates.hourlyRate || Infinity;
          const currentRate = current.rates.hourlyRate || Infinity;
          return prevRate < currentRate ? prev : current;
        }),
        bestSuccessRate: agentsToCompare.reduce((prev, current) =>
          prev.reputation.successRate > current.reputation.successRate
            ? prev
            : current
        ),
      },
    };

    res.json(comparison);
  }
);

// Get top agents by category
// GET /api/agents/discover/top/:category
agentDiscoveryRouter.get(
  '/top/:category',
  [
    param('category').isString().trim(),
    query('limit').optional().isInt({ min: 1, max: 50 }),
    validate,
  ],
  (req: Request, res: Response) => {
    const { category } = req.params;
    const limit = parseInt((req.query.limit as string) || '10');

    const topAgents = Array.from(agents.values())
      .filter((agent) =>
        agent.skills.some(
          (s) => s.category.toLowerCase() === category.toLowerCase()
        )
      )
      .sort((a, b) => b.reputation.score - a.reputation.score)
      .slice(0, limit);

    res.json({
      category,
      agents: topAgents,
      count: topAgents.length,
    });
  }
);

// Get agent recommendations for a task
// POST /api/agents/discover/recommend
agentDiscoveryRouter.post(
  '/recommend',
  [
    query('skills').isString().withMessage('Required skills needed'),
    query('budget').optional().isFloat({ min: 0 }),
    query('urgency').optional().isIn(['low', 'medium', 'high']),
    query('limit').optional().isInt({ min: 1, max: 20 }),
    validate,
  ],
  (req: Request, res: Response) => {
    const {
      skills,
      budget,
      urgency = 'medium',
      limit = 5,
    } = req.query;

    const requiredSkills = (skills as string).toLowerCase().split(',');

    // Score each agent based on fit
    const scoredAgents = Array.from(agents.values()).map((agent) => {
      let score = 0;

      // Skill match (40%)
      const skillMatches = requiredSkills.filter((skill) =>
        agent.skills.some((s) => s.name.toLowerCase().includes(skill.trim()))
      ).length;
      score += (skillMatches / requiredSkills.length) * 40;

      // Reputation (25%)
      score += (agent.reputation.score / 100) * 25;

      // Availability (20%)
      if (agent.availability.status === 'available') {
        score += 20;
      } else if (agent.availability.status === 'busy') {
        score += 10;
      }

      // Success rate (15%)
      score += (agent.reputation.successRate / 100) * 15;

      // Budget fit bonus
      if (budget && agent.rates.hourlyRate) {
        const budgetNum = parseFloat(budget as string);
        if (agent.rates.hourlyRate <= budgetNum) {
          score += 5;
        }
      }

      // Urgency adjustment
      if (urgency === 'high' && agent.availability.typicalResponseTime.includes('hour')) {
        score += 5;
      }

      return { agent, score: Math.min(100, score) };
    });

    // Sort by score and return top matches
    const recommendations = scoredAgents
      .sort((a, b) => b.score - a.score)
      .slice(0, parseInt(limit as string));

    res.json({
      recommendations: recommendations.map((r) => ({
        agent: r.agent,
        matchScore: Math.round(r.score),
        matchReasons: generateMatchReasons(r.agent, requiredSkills),
      })),
      criteria: {
        skills: requiredSkills,
        budget,
        urgency,
      },
    });
  }
);

// Helper function to generate match reasons
function generateMatchReasons(
  agent: AgentProfile,
  requiredSkills: string[]
): string[] {
  const reasons: string[] = [];

  // Skill matches
  const matchingSkills = agent.skills.filter((s) =>
    requiredSkills.some((req) => s.name.toLowerCase().includes(req.trim()))
  );
  if (matchingSkills.length > 0) {
    reasons.push(
      `Has ${matchingSkills.length} matching skills: ${matchingSkills
        .map((s) => s.name)
        .join(', ')}`
    );
  }

  // Reputation
  if (agent.reputation.score >= 80) {
    reasons.push(`Excellent reputation (${agent.reputation.score}/100)`);
  }

  // Availability
  if (agent.availability.status === 'available') {
    reasons.push('Currently available');
  }

  // Success rate
  if (agent.reputation.successRate >= 95) {
    reasons.push(`${agent.reputation.successRate}% success rate`);
  }

  // Experience
  if (agent.stats.totalTasksCompleted >= 50) {
    reasons.push(`Highly experienced (${agent.stats.totalTasksCompleted}+ tasks)`);
  }

  return reasons;
}

// Get skill categories
// GET /api/agents/discover/categories
agentDiscoveryRouter.get('/categories', (req: Request, res: Response) => {
  const categories = new Map<string, { count: number; topAgents: string[] }>();

  agents.forEach((agent) => {
    agent.skills.forEach((skill) => {
      const existing = categories.get(skill.category);
      if (existing) {
        existing.count++;
        if (existing.topAgents.length < 3) {
          existing.topAgents.push(agent.name);
        }
      } else {
        categories.set(skill.category, {
          count: 1,
          topAgents: [agent.name],
        });
      }
    });
  });

  res.json({
    categories: Array.from(categories.entries()).map(([name, data]) => ({
      name,
      ...data,
    })),
  });
});

// Get discovery statistics
// GET /api/agents/discover/stats/overview
agentDiscoveryRouter.get('/stats/overview', (req: Request, res: Response) => {
  const allAgents = Array.from(agents.values());

  const stats = {
    totalAgents: allAgents.length,
    availableNow: allAgents.filter((a) => a.availability.status === 'available')
      .length,
    averageRating:
      allAgents.reduce((sum, a) => sum + a.reputation.rating, 0) /
        allAgents.length || 0,
    totalTasksCompleted: allAgents.reduce(
      (sum, a) => sum + a.stats.totalTasksCompleted,
      0
    ),
    totalEarnings: allAgents.reduce(
      (sum, a) => sum + a.stats.totalEarnings,
      0
    ),
    topSkills: getTopSkills(allAgents),
    availabilityBreakdown: {
      available: allAgents.filter((a) => a.availability.status === 'available')
        .length,
      busy: allAgents.filter((a) => a.availability.status === 'busy').length,
      away: allAgents.filter((a) => a.availability.status === 'away').length,
      offline: allAgents.filter((a) => a.availability.status === 'offline')
        .length,
    },
  };

  res.json({ stats });
});

function getTopSkills(
  agents: AgentProfile[]
): { name: string; count: number; avgLevel: number }[] {
  const skillMap = new Map<string, { count: number; totalLevel: number }>();

  agents.forEach((agent) => {
    agent.skills.forEach((skill) => {
      const existing = skillMap.get(skill.name);
      if (existing) {
        existing.count++;
        existing.totalLevel += skill.level;
      } else {
        skillMap.set(skill.name, { count: 1, totalLevel: skill.level });
      }
    });
  });

  return Array.from(skillMap.entries())
    .map(([name, data]) => ({
      name,
      count: data.count,
      avgLevel: Math.round(data.totalLevel / data.count),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

// Export for use in other routes
export { agents };
export type { AgentProfile, Skill, ReputationStats };
