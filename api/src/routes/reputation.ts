import { Router, Request, Response } from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validation';

export const reputationRouter = Router();

// Agent reputation with decay tracking
interface AgentReputation {
  agentId: string;
  baseReputation: number; // Raw reputation earned
  effectiveReputation: number; // After decay
  lastActivity: number;
  decayRate: number; // Reputation lost per day of inactivity
  streakDays: number; // Consecutive active days
  bonuses: Map<string, number>; // Bonus multipliers
  penalties: Map<string, number>; // Penalty multipliers
  skillLevels: Map<string, number>; // Per-skill reputation
}

const reputations = new Map<string, AgentReputation>();

// Decay configuration
const DECAY_CONFIG = {
  baseDecayRate: 0.5, // Lose 0.5 rep per day inactive
  streakBonus: 0.1, // +10% per active day (max 50%)
  maxStreak: 5,
  gracePeriod: 86400000, // 1 day before decay starts
  recoveryRate: 0.3 // Regain rep when active again
};

// Get or create reputation
function getReputation(agentId: string): AgentReputation {
  if (!reputations.has(agentId)) {
    reputations.set(agentId, {
      agentId,
      baseReputation: 50, // Starting reputation
      effectiveReputation: 50,
      lastActivity: Date.now(),
      decayRate: DECAY_CONFIG.baseDecayRate,
      streakDays: 0,
      bonuses: new Map(),
      penalties: new Map(),
      skillLevels: new Map()
    });
  }
  return reputations.get(agentId)!;
}

// Calculate effective reputation with decay
function calculateEffectiveReputation(rep: AgentReputation): number {
  const now = Date.now();
  const inactiveTime = now - rep.lastActivity;
  const inactiveDays = Math.floor(inactiveTime / 86400000);
  
  let effectiveRep = rep.baseReputation;
  
  // Apply decay if beyond grace period
  if (inactiveTime > DECAY_CONFIG.gracePeriod) {
    const decayDays = inactiveDays;
    const decayAmount = decayDays * rep.decayRate;
    effectiveRep = Math.max(0, effectiveRep - decayAmount);
  }
  
  // Apply streak bonus (if recently active)
  if (inactiveDays === 0 && rep.streakDays > 0) {
    const streakMultiplier = 1 + Math.min(rep.streakDays * DECAY_CONFIG.streakBonus, 0.5);
    effectiveRep *= streakMultiplier;
  }
  
  // Apply bonuses
  rep.bonuses.forEach((bonus, name) => {
    effectiveRep *= (1 + bonus);
  });
  
  // Apply penalties
  rep.penalties.forEach((penalty, name) => {
    effectiveRep *= (1 - penalty);
  });
  
  return Math.min(100, Math.max(0, effectiveRep));
}

// Record activity (resets decay timer, updates streak)
reputationRouter.post('/activity', [
  body('agentId').isString(),
  body('activityType').isIn(['task_completed', 'task_failed', 'vote', 'proposal', 'standup', 'collaboration']),
  body('value').optional().isInt(),
  validate
], (req: Request, res: Response) => {
  const { agentId, activityType, value = 0 } = req.body;
  const rep = getReputation(agentId);
  const now = Date.now();
  
  // Check if this is a new day
  const lastDay = Math.floor(rep.lastActivity / 86400000);
  const currentDay = Math.floor(now / 86400000);
  
  if (currentDay > lastDay) {
    // New day - update streak
    if (currentDay - lastDay === 1) {
      rep.streakDays = Math.min(rep.streakDays + 1, DECAY_CONFIG.maxStreak);
    } else {
      // Streak broken
      rep.streakDays = 1;
    }
  }
  
  // Update last activity
  rep.lastActivity = now;
  
  // Base reputation changes
  switch (activityType) {
    case 'task_completed':
      rep.baseReputation += 2;
      break;
    case 'task_failed':
      rep.baseReputation = Math.max(0, rep.baseReputation - 5);
      break;
    case 'vote':
      rep.baseReputation += 0.1;
      break;
    case 'proposal':
      rep.baseReputation += 1;
      break;
    case 'standup':
      rep.baseReputation += 0.5;
      break;
    case 'collaboration':
      rep.baseReputation += 1.5;
      break;
  }
  
  // Recalculate effective reputation
  rep.effectiveReputation = calculateEffectiveReputation(rep);
  
  res.json({
    message: 'Activity recorded',
    reputation: {
      agentId: rep.agentId,
      baseReputation: rep.baseReputation,
      effectiveReputation: rep.effectiveReputation,
      streakDays: rep.streakDays,
      decayRate: rep.decayRate,
      lastActivity: rep.lastActivity
    }
  });
});

// Get reputation status
reputationRouter.get('/:agentId', (req, res) => {
  const rep = getReputation(req.params.agentId);
  rep.effectiveReputation = calculateEffectiveReputation(rep);
  
  const now = Date.now();
  const inactiveTime = now - rep.lastActivity;
  const inactiveDays = Math.floor(inactiveTime / 86400000);
  const decayAmount = inactiveTime > DECAY_CONFIG.gracePeriod 
    ? inactiveDays * rep.decayRate 
    : 0;
  
  res.json({
    agentId: rep.agentId,
    baseReputation: rep.baseReputation,
    effectiveReputation: rep.effectiveReputation,
    streakDays: rep.streakDays,
    streakBonus: Math.min(rep.streakDays * DECAY_CONFIG.streakBonus * 100, 50),
    decayRate: rep.decayRate,
    daysInactive: inactiveDays,
    decayAmount,
    nextDecayAt: rep.lastActivity + DECAY_CONFIG.gracePeriod,
    skillLevels: Object.fromEntries(rep.skillLevels)
  });
});

// Add bonus/penalty
reputationRouter.post('/modifier', [
  body('agentId').isString(),
  body('type').isIn(['bonus', 'penalty']),
  body('name').isString(),
  body('value').isFloat({ min: -1, max: 1 }),
  validate
], (req: Request, res: Response) => {
  const { agentId, type, name, value } = req.body;
  const rep = getReputation(agentId);
  
  if (type === 'bonus') {
    rep.bonuses.set(name, Math.abs(value));
  } else {
    rep.penalties.set(name, Math.abs(value));
  }
  
  rep.effectiveReputation = calculateEffectiveReputation(rep);
  
  res.json({
    message: `${type} applied`,
    modifier: { name, value, type },
    effectiveReputation: rep.effectiveReputation
  });
});

// Get leaderboard
reputationRouter.get('/leaderboard', (req, res) => {
  const allReps = Array.from(reputations.values())
    .map(rep => ({
      ...rep,
      effectiveReputation: calculateEffectiveReputation(rep)
    }))
    .sort((a, b) => b.effectiveReputation - a.effectiveReputation)
    .slice(0, 100);
  
  res.json({
    leaderboard: allReps.map((rep, index) => ({
      rank: index + 1,
      agentId: rep.agentId,
      effectiveReputation: rep.effectiveReputation,
      baseReputation: rep.baseReputation,
      streakDays: rep.streakDays
    })),
    total: reputations.size
  });
});

// Run decay calculation for all agents (cron job endpoint)
reputationRouter.post('/process-decay', (req, res) => {
  const now = Date.now();
  let processed = 0;
  
  reputations.forEach((rep) => {
    rep.effectiveReputation = calculateEffectiveReputation(rep);
    processed++;
  });
  
  res.json({
    message: 'Decay processed',
    processed,
    timestamp: now
  });
});

export { reputations, calculateEffectiveReputation };
