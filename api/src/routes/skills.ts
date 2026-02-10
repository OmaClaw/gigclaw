import { Router, Request, Response } from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validation';

export const skillsRouter = Router();

// Skill tracking with evolution
interface AgentSkills {
  agentId: string;
  skills: Map<string, SkillLevel>;
  recentTasks: string[]; // Recent task types
  evolutionHistory: SkillEvolution[];
}

interface SkillLevel {
  name: string;
  level: number; // 1-100
  experience: number; // Total XP
  category: string;
  subskills: string[];
  lastUsed: number;
  tasksCompleted: number;
  successRate: number;
}

interface SkillEvolution {
  timestamp: number;
  skillName: string;
  oldLevel: number;
  newLevel: number;
  reason: string;
}

const agentSkills = new Map<string, AgentSkills>();

// XP required for each level
const XP_TABLE = [
  0,      // Level 1
  100,    // Level 2
  250,    // Level 3
  500,    // Level 4
  1000,   // Level 5
  2000,   // Level 6
  3500,   // Level 7
  5500,   // Level 8
  8000,   // Level 9
  11000,  // Level 10
  15000,  // Level 11
  20000,  // Level 12
  26000,  // Level 13
  33000,  // Level 14
  41000,  // Level 15
  50000,  // Level 16
  60000,  // Level 17
  72000,  // Level 18
  85000,  // Level 19
  100000  // Level 20 (max)
];

function getOrCreateSkills(agentId: string): AgentSkills {
  if (!agentSkills.has(agentId)) {
    agentSkills.set(agentId, {
      agentId,
      skills: new Map(),
      recentTasks: [],
      evolutionHistory: []
    });
  }
  return agentSkills.get(agentId)!;
}

function calculateLevel(experience: number): number {
  for (let i = XP_TABLE.length - 1; i >= 0; i--) {
    if (experience >= XP_TABLE[i]) {
      return i + 1;
    }
  }
  return 1;
}

function getXpForNextLevel(currentLevel: number): number {
  if (currentLevel >= 20) return 0;
  return XP_TABLE[currentLevel] || XP_TABLE[XP_TABLE.length - 1];
}

// Record skill usage from completed task
skillsRouter.post('/practice', [
  body('agentId').isString(),
  body('skillName').isString(),
  body('category').isString(),
  body('success').isBoolean(),
  body('difficulty').optional().isIn(['easy', 'medium', 'hard', 'expert']),
  body('duration').optional().isInt({ min: 1 }), // minutes
  validate
], (req: Request, res: Response) => {
  const {
    agentId,
    skillName,
    category,
    success,
    difficulty = 'medium',
    duration = 60
  } = req.body;

  const agent = getOrCreateSkills(agentId);
  
  // Get or create skill
  if (!agent.skills.has(skillName)) {
    agent.skills.set(skillName, {
      name: skillName,
      level: 1,
      experience: 0,
      category,
      subskills: [],
      lastUsed: Date.now(),
      tasksCompleted: 0,
      successRate: 0
    });
  }

  const skill = agent.skills.get(skillName)!;
  
  // Calculate XP gain
  const baseXp = {
    easy: 10,
    medium: 25,
    hard: 50,
    expert: 100
  }[difficulty];

  const successMultiplier = success ? 1 : 0.3; // Still get some XP for trying
  const timeBonus = Math.min(duration / 60, 2); // Up to 2x for longer tasks
  
  const xpGained = Math.floor(baseXp * successMultiplier * timeBonus);
  
  const oldLevel = skill.level;
  skill.experience += xpGained;
  skill.level = calculateLevel(skill.experience);
  skill.lastUsed = Date.now();
  skill.tasksCompleted += 1;
  
  // Update success rate
  const totalSuccess = skill.successRate * (skill.tasksCompleted - 1) + (success ? 100 : 0);
  skill.successRate = totalSuccess / skill.tasksCompleted;

  // Record evolution if leveled up
  if (skill.level > oldLevel) {
    agent.evolutionHistory.push({
      timestamp: Date.now(),
      skillName,
      oldLevel,
      newLevel: skill.level,
      reason: `Completed ${success ? 'successful' : 'attempted'} ${difficulty} task`
    });
  }

  // Track recent tasks for specialization detection
  agent.recentTasks.push(skillName);
  if (agent.recentTasks.length > 20) {
    agent.recentTasks.shift();
  }

  res.json({
    message: 'Skill practice recorded',
    skill: {
      name: skill.name,
      level: skill.level,
      experience: skill.experience,
      xpGained,
      xpToNextLevel: getXpForNextLevel(skill.level) - skill.experience,
      leveledUp: skill.level > oldLevel,
      successRate: Math.round(skill.successRate)
    }
  });
});

// Get agent's skills
skillsRouter.get('/:agentId', (req, res) => {
  const agent = getOrCreateSkills(req.params.agentId);
  
  const skills = Array.from(agent.skills.values())
    .sort((a, b) => b.level - a.level);

  // Calculate specialization
  const categoryCount = new Map<string, number>();
  agent.recentTasks.forEach(task => {
    const skill = agent.skills.get(task);
    if (skill) {
      categoryCount.set(skill.category, (categoryCount.get(skill.category) || 0) + 1);
    }
  });

  const specialization = Array.from(categoryCount.entries())
    .sort((a, b) => b[1] - a[1])[0]?.[0] || 'generalist';

  res.json({
    agentId: agent.agentId,
    skills,
    totalSkills: skills.length,
    averageLevel: skills.length > 0 
      ? Math.round(skills.reduce((sum, s) => sum + s.level, 0) / skills.length)
      : 0,
    specialization,
    recentEvolutions: agent.evolutionHistory.slice(-5)
  });
});

// Get skill details
skillsRouter.get('/:agentId/:skillName', (req, res) => {
  const agent = getOrCreateSkills(req.params.agentId);
  const skill = agent.skills.get(req.params.skillName);
  
  if (!skill) {
    return res.status(404).json({ error: 'Skill not found' });
  }

  const evolutions = agent.evolutionHistory
    .filter(e => e.skillName === skill.name);

  res.json({
    skill: {
      ...skill,
      xpToNextLevel: getXpForNextLevel(skill.level) - skill.experience,
      progress: skill.level >= 20 ? 100 : 
        Math.round((skill.experience - XP_TABLE[skill.level - 1]) / 
        (XP_TABLE[skill.level] - XP_TABLE[skill.level - 1]) * 100)
    },
    evolutions
  });
});

// Compare skills between agents
skillsRouter.post('/compare', [
  body('agentIds').isArray({ min: 2, max: 5 }),
  validate
], (req: Request, res: Response) => {
  const { agentIds } = req.body;
  
  const comparison = agentIds.map(id => {
    const agent = getOrCreateSkills(id);
    const skills = Array.from(agent.skills.values());
    
    return {
      agentId: id,
      skillCount: skills.length,
      averageLevel: skills.length > 0
        ? Math.round(skills.reduce((sum, s) => sum + s.level, 0) / skills.length)
        : 0,
      topSkill: skills.length > 0
        ? skills.sort((a, b) => b.level - a.level)[0].name
        : null,
      totalExperience: skills.reduce((sum, s) => sum + s.experience, 0)
    };
  });

  res.json({ comparison });
});

// Get skill leaderboard
skillsRouter.get('/leaderboard/:skillName', (req, res) => {
  const { skillName } = req.params;
  
  const leaderboard: Array<{ agentId: string; level: number; experience: number }> = [];
  
  agentSkills.forEach((agent, agentId) => {
    const skill = agent.skills.get(skillName);
    if (skill) {
      leaderboard.push({
        agentId,
        level: skill.level,
        experience: skill.experience
      });
    }
  });

  leaderboard.sort((a, b) => b.experience - a.experience);

  res.json({
    skill: skillName,
    leaderboard: leaderboard.slice(0, 50),
    totalPractitioners: leaderboard.length
  });
});

// Get skill categories
skillsRouter.get('/categories/list', (req, res) => {
  const categories = new Set<string>();
  
  agentSkills.forEach(agent => {
    agent.skills.forEach(skill => {
      categories.add(skill.category);
    });
  });

  res.json({
    categories: Array.from(categories)
  });
});

// Recommend skills to learn
skillsRouter.get('/recommend/:agentId', (req, res) => {
  const agent = getOrCreateSkills(req.params.agentId);
  
  // Find high-demand skills the agent doesn't have
  const allSkills = new Map<string, { count: number; avgLevel: number }>();
  
  agentSkills.forEach(otherAgent => {
    otherAgent.skills.forEach((skill, name) => {
      if (!agent.skills.has(name)) {
        const existing = allSkills.get(name);
        if (existing) {
          existing.count++;
          existing.avgLevel = (existing.avgLevel + skill.level) / 2;
        } else {
          allSkills.set(name, { count: 1, avgLevel: skill.level });
        }
      }
    });
  });

  const recommendations = Array.from(allSkills.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(([name, stats]) => ({
      skill: name,
      demand: stats.count,
      averageLevel: Math.round(stats.avgLevel),
      reason: `High demand (${stats.count} agents have this skill)`
    }));

  res.json({
    agentId: req.params.agentId,
    currentSkills: agent.skills.size,
    recommendations
  });
});

export { agentSkills, calculateLevel };
