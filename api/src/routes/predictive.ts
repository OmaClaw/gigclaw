import { Router, Request, Response } from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validation';

export const predictiveRouter = Router();

// ML-based task-agent matching
interface AgentProfile {
  agentId: string;
  skills: Map<string, number>; // skill -> level
  successRate: number;
  avgCompletionTime: number;
  reliability: number; // on-time delivery rate
  collaborationScore: number;
  pastTasks: string[];
  relationships: Map<string, number>; // otherAgent -> sentiment
}

interface TaskProfile {
  taskId: string;
  requiredSkills: string[];
  complexity: number; // 1-10
  urgency: number; // 1-10
  budget: number;
  posterId: string;
}

interface MatchScore {
  agentId: string;
  score: number; // 0-100
  confidence: number; // 0-1
  reasons: string[];
  predictedSuccess: number;
  predictedTimeline: string;
  riskFactors: string[];
}

const agentProfiles = new Map<string, AgentProfile>();

// Get or create agent profile
function getAgentProfile(agentId: string): AgentProfile {
  if (!agentProfiles.has(agentId)) {
    agentProfiles.set(agentId, {
      agentId,
      skills: new Map(),
      successRate: 0.5,
      avgCompletionTime: 0,
      reliability: 0.5,
      collaborationScore: 0.5,
      pastTasks: [],
      relationships: new Map(),
    });
  }
  return agentProfiles.get(agentId)!;
}

// Predictive matching endpoint
predictiveRouter.post(
  '/match',
  [
    body('taskId').isString(),
    body('requiredSkills').isArray(),
    body('complexity').optional().isInt({ min: 1, max: 10 }),
    body('urgency').optional().isInt({ min: 1, max: 10 }),
    body('budget').optional().isNumeric(),
    body('posterId').isString(),
    validate,
  ],
  (req: Request, res: Response) => {
    const { taskId, requiredSkills, complexity = 5, urgency = 5, budget, posterId } = req.body;

    const task: TaskProfile = {
      taskId,
      requiredSkills,
      complexity,
      urgency,
      budget,
      posterId,
    };

    // Score all agents
    const matches: MatchScore[] = [];

    agentProfiles.forEach(profile => {
      const score = calculateMatchScore(profile, task);
      matches.push(score);
    });

    // Sort by score
    matches.sort((a, b) => b.score - a.score);

    res.json({
      task,
      matches: matches.slice(0, 10),
      totalCandidates: matches.length,
    });
  }
);

// Update agent profile from completed task
predictiveRouter.post(
  '/feedback',
  [
    body('agentId').isString(),
    body('taskId').isString(),
    body('success').isBoolean(),
    body('completionTime').optional().isInt(), // hours
    body('skillsUsed').isArray(),
    body('collaborators').optional().isArray(),
    validate,
  ],
  (req: Request, res: Response) => {
    const { agentId, taskId, success, completionTime, skillsUsed, collaborators = [] } = req.body;

    const profile = getAgentProfile(agentId);

    // Update success rate
    const totalTasks = profile.pastTasks.length + 1;
    const successes =
      profile.pastTasks.filter(t => t.includes('success')).length + (success ? 1 : 0);
    profile.successRate = successes / totalTasks;

    // Update completion time
    if (completionTime) {
      if (profile.avgCompletionTime === 0) {
        profile.avgCompletionTime = completionTime;
      } else {
        profile.avgCompletionTime =
          (profile.avgCompletionTime * (totalTasks - 1) + completionTime) / totalTasks;
      }
    }

    // Update skills
    skillsUsed.forEach((skill: string) => {
      const current = profile.skills.get(skill) || 0;
      profile.skills.set(skill, Math.min(100, current + (success ? 2 : 0.5)));
    });

    // Update collaboration score
    if (collaborators.length > 0) {
      profile.collaborationScore = Math.min(1, profile.collaborationScore + 0.05);
    }

    profile.pastTasks.push(`${taskId}-${success ? 'success' : 'failed'}`);

    res.json({
      message: 'Profile updated',
      profile: {
        agentId: profile.agentId,
        successRate: profile.successRate,
        avgCompletionTime: profile.avgCompletionTime,
        skills: Object.fromEntries(profile.skills),
      },
    });
  }
);

// Get team recommendation (which agents work well together)
predictiveRouter.post(
  '/team',
  [
    body('taskId').isString(),
    body('requiredSkills').isArray(),
    body('teamSize').isInt({ min: 2, max: 5 }),
    validate,
  ],
  (req: Request, res: Response) => {
    const { taskId, requiredSkills, teamSize } = req.body;

    // Find agents that cover all skills
    const candidates: AgentProfile[] = [];
    agentProfiles.forEach(profile => {
      const skillScore = calculateSkillCoverage(profile, requiredSkills);
      if (skillScore > 0.3) {
        candidates.push(profile);
      }
    });

    // Find best team combination
    const team = findBestTeam(candidates, requiredSkills, teamSize);

    res.json({
      taskId,
      recommendedTeam: team.map(a => ({
        agentId: a.agentId,
        skills: Object.fromEntries(a.skills),
        role: determineRole(a, requiredSkills),
      })),
      teamCompatibility: calculateTeamCompatibility(team),
      predictedSuccess: predictTeamSuccess(team),
    });
  }
);

// Get agent analytics
predictiveRouter.get('/agent/:agentId/analytics', (req, res) => {
  const profile = getAgentProfile(req.params.agentId);

  // Calculate trends
  const recentTasks = profile.pastTasks.slice(-10);
  const recentSuccessRate =
    recentTasks.filter(t => t.includes('success')).length / recentTasks.length;

  // Predict specialization
  const topSkills = Array.from(profile.skills.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  // Calculate demand score
  const demandScore = calculateDemandScore(profile);

  res.json({
    agentId: profile.agentId,
    performance: {
      overallSuccessRate: profile.successRate,
      recentSuccessRate,
      avgCompletionTime: profile.avgCompletionTime,
      reliability: profile.reliability,
    },
    skills: {
      top: topSkills,
      total: profile.skills.size,
    },
    collaboration: {
      score: profile.collaborationScore,
      preferredPartners: Array.from(profile.relationships.entries())
        .filter(([, score]) => score > 0.7)
        .map(([id]) => id),
    },
    marketValue: {
      demandScore,
      suggestedRate: calculateSuggestedRate(profile, demandScore),
    },
    recommendations: generateAgentRecommendations(profile),
  });
});

// Calculate match score
function calculateMatchScore(agent: AgentProfile, task: TaskProfile): MatchScore {
  const reasons: string[] = [];
  const riskFactors: string[] = [];

  // Skill match (40%)
  let skillScore = 0;
  task.requiredSkills.forEach(skill => {
    const level = agent.skills.get(skill) || 0;
    skillScore += level / 100;
  });
  skillScore = (skillScore / task.requiredSkills.length) * 40;

  if (skillScore > 30) reasons.push('High skill match');
  if (skillScore < 20) riskFactors.push('Low skill match');

  // Success rate (25%)
  const successScore = agent.successRate * 25;
  if (agent.successRate > 0.8) reasons.push('Proven track record');
  if (agent.successRate < 0.5) riskFactors.push('Low success rate');

  // Reliability (20%)
  const reliabilityScore = agent.reliability * 20;
  if (agent.reliability > 0.9) reasons.push('Highly reliable');

  // Collaboration (15%)
  const collabScore = agent.collaborationScore * 15;

  // Calculate total
  const score = skillScore + successScore + reliabilityScore + collabScore;

  // Predict success
  const predictedSuccess = (skillScore + successScore) / 65;

  // Estimate timeline
  const predictedTimeline =
    agent.avgCompletionTime > 0
      ? `${Math.round(agent.avgCompletionTime * (1 + (10 - task.complexity) * 0.1))} hours`
      : 'Unknown';

  return {
    agentId: agent.agentId,
    score: Math.round(score),
    confidence: Math.min(0.95, agent.pastTasks.length / 10),
    reasons,
    predictedSuccess: Math.round(predictedSuccess * 100),
    predictedTimeline,
    riskFactors,
  };
}

function calculateSkillCoverage(agent: AgentProfile, requiredSkills: string[]): number {
  let coverage = 0;
  requiredSkills.forEach(skill => {
    coverage += agent.skills.get(skill) || 0;
  });
  return coverage / (requiredSkills.length * 100);
}

function findBestTeam(
  candidates: AgentProfile[],
  requiredSkills: string[],
  size: number
): AgentProfile[] {
  // Greedy algorithm for team selection
  const team: AgentProfile[] = [];
  const coveredSkills = new Set<string>();

  while (team.length < size && candidates.length > 0) {
    // Find agent that covers most uncovered skills
    let bestAgent = candidates[0];
    let bestCoverage = 0;

    candidates.forEach(agent => {
      let coverage = 0;
      requiredSkills.forEach(skill => {
        if (!coveredSkills.has(skill) && agent.skills.has(skill)) {
          coverage += agent.skills.get(skill)!;
        }
      });

      if (coverage > bestCoverage) {
        bestCoverage = coverage;
        bestAgent = agent;
      }
    });

    team.push(bestAgent);

    // Mark skills as covered
    requiredSkills.forEach(skill => {
      if (bestAgent.skills.has(skill)) {
        coveredSkills.add(skill);
      }
    });

    // Remove from candidates
    candidates = candidates.filter(a => a.agentId !== bestAgent.agentId);
  }

  return team;
}

function calculateTeamCompatibility(team: AgentProfile[]): number {
  if (team.length < 2) return 1;

  let totalScore = 0;
  let pairs = 0;

  for (let i = 0; i < team.length; i++) {
    for (let j = i + 1; j < team.length; j++) {
      const score = team[i].relationships.get(team[j].agentId) || 0.5;
      totalScore += score;
      pairs++;
    }
  }

  return pairs > 0 ? totalScore / pairs : 1;
}

function predictTeamSuccess(team: AgentProfile[]): number {
  const avgSuccess = team.reduce((sum, a) => sum + a.successRate, 0) / team.length;
  const compatibility = calculateTeamCompatibility(team);
  return Math.round(avgSuccess * compatibility * 100);
}

function determineRole(agent: AgentProfile, requiredSkills: string[]): string {
  const skillLevels = requiredSkills.map(s => ({
    skill: s,
    level: agent.skills.get(s) || 0,
  }));

  skillLevels.sort((a, b) => b.level - a.level);

  if (skillLevels[0].level > 80) return 'Lead';
  if (skillLevels[0].level > 60) return 'Specialist';
  return 'Contributor';
}

function calculateDemandScore(agent: AgentProfile): number {
  // Based on skill rarity and success rate
  const skillScore = agent.skills.size * 10;
  const successBonus = agent.successRate * 50;
  return Math.min(100, skillScore + successBonus);
}

function calculateSuggestedRate(agent: AgentProfile, demand: number): number {
  const baseRate = 50;
  const skillMultiplier = 1 + agent.skills.size * 0.1;
  const demandMultiplier = 1 + demand / 100;
  const successMultiplier = 0.5 + agent.successRate;

  return Math.round(baseRate * skillMultiplier * demandMultiplier * successMultiplier);
}

function generateAgentRecommendations(agent: AgentProfile): string[] {
  const recs: string[] = [];

  if (agent.successRate < 0.7) {
    recs.push('Focus on task quality to improve success rate');
  }

  if (agent.skills.size < 3) {
    recs.push('Learn additional skills to increase marketability');
  }

  if (agent.collaborationScore < 0.6) {
    recs.push('Participate in more team tasks to build collaboration skills');
  }

  if (agent.reliability < 0.8) {
    recs.push('Improve on-time delivery rate');
  }

  return recs;
}

export { agentProfiles };
