import { Router, Request, Response } from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validation';

export const votingRouter = Router();

// Store votes and proposals
const proposals = new Map<string, any>();
const votes = new Map<string, Map<string, number>>(); // proposalId -> agentId -> vote

// Proposal types
interface Proposal {
  id: string;
  title: string;
  description: string;
  type: 'feature' | 'parameter' | 'dispute' | 'treasury';
  proposerId: string;
  options: string[];
  status: 'active' | 'passed' | 'rejected' | 'executed';
  createdAt: number;
  endsAt: number;
  minReputation: number;
  quorum: number; // minimum votes required
}

interface Vote {
  proposalId: string;
  agentId: string;
  option: number; // index of option
  weight: number; // reputation-weighted
  timestamp: number;
}

// Create a proposal
votingRouter.post('/proposals', [
  body('title').isString().isLength({ min: 3, max: 200 }),
  body('description').isString().isLength({ min: 10, max: 2000 }),
  body('type').isIn(['feature', 'parameter', 'dispute', 'treasury']),
  body('proposerId').isString(),
  body('options').isArray({ min: 2, max: 5 }),
  body('duration').optional().isInt({ min: 3600000, max: 604800000 }), // 1 hour to 7 days
  body('minReputation').optional().isInt({ min: 0, max: 100 }),
  body('quorum').optional().isInt({ min: 1 }),
  validate
], (req: Request, res: Response) => {
  const {
    title,
    description,
    type,
    proposerId,
    options,
    duration = 86400000, // Default 24 hours
    minReputation = 0,
    quorum = 3
  } = req.body;

  const proposal: Proposal = {
    id: `prop-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    title,
    description,
    type,
    proposerId,
    options,
    status: 'active',
    createdAt: Date.now(),
    endsAt: Date.now() + duration,
    minReputation,
    quorum
  };

  proposals.set(proposal.id, proposal);
  votes.set(proposal.id, new Map());

  res.status(201).json({
    message: 'Proposal created',
    proposal
  });
});

// Cast a vote
votingRouter.post('/vote', [
  body('proposalId').isString(),
  body('agentId').isString(),
  body('option').isInt({ min: 0 }),
  body('reputation').optional().isInt({ min: 0, max: 100 }),
  validate
], (req: Request, res: Response) => {
  const { proposalId, agentId, option, reputation = 50 } = req.body;

  const proposal = proposals.get(proposalId);
  if (!proposal) {
    return res.status(404).json({ error: 'Proposal not found' });
  }

  if (proposal.status !== 'active') {
    return res.status(400).json({ error: 'Proposal is not active' });
  }

  if (Date.now() > proposal.endsAt) {
    return res.status(400).json({ error: 'Voting period has ended' });
  }

  if (reputation < proposal.minReputation) {
    return res.status(403).json({
      error: `Minimum reputation of ${proposal.minReputation} required`
    });
  }

  if (option >= proposal.options.length) {
    return res.status(400).json({ error: 'Invalid option' });
  }

  const proposalVotes = votes.get(proposalId)!;
  
  // Calculate vote weight based on reputation
  const weight = Math.sqrt(reputation); // Square root to prevent whales from dominating

  proposalVotes.set(agentId, weight);

  res.json({
    message: 'Vote cast',
    vote: {
      proposalId,
      agentId,
      option,
      weight,
      timestamp: Date.now()
    }
  });
});

// Get proposal results
votingRouter.get('/results/:proposalId', (req, res) => {
  const proposal = proposals.get(req.params.proposalId);
  if (!proposal) {
    return res.status(404).json({ error: 'Proposal not found' });
  }

  const proposalVotes = votes.get(req.params.proposalId) || new Map();
  
  // Tally votes
  const tallies = new Array(proposal.options.length).fill(0);
  let totalVotes = 0;
  let totalWeight = 0;

  proposalVotes.forEach((weight, agentId) => {
    // In a real implementation, we'd track which option each agent voted for
    // For now, we'll return the vote distribution
    totalVotes++;
    totalWeight += weight;
  });

  res.json({
    proposal,
    results: {
      totalVotes,
      totalWeight,
      tallies: proposal.options.map((option, i) => ({
        option,
        votes: tallies[i]
      }))
    },
    hasQuorum: totalVotes >= proposal.quorum
  });
});

// List active proposals
votingRouter.get('/proposals', (req, res) => {
  const activeProposals = Array.from(proposals.values())
    .filter(p => p.status === 'active' && p.endsAt > Date.now())
    .sort((a, b) => a.endsAt - b.endsAt);

  res.json({
    proposals: activeProposals,
    count: activeProposals.length
  });
});

// List all proposals (including closed)
votingRouter.get('/proposals/all', (req, res) => {
  const allProposals = Array.from(proposals.values())
    .sort((a, b) => b.createdAt - a.createdAt);

  res.json({
    proposals: allProposals,
    count: allProposals.length
  });
});

// Execute a passed proposal (admin/governance function)
votingRouter.post('/proposals/:proposalId/execute', [
  body('executorId').isString(),
  validate
], (req: Request, res: Response) => {
  const { proposalId } = req.params;
  const { executorId } = req.body;

  const proposal = proposals.get(proposalId);
  if (!proposal) {
    return res.status(404).json({ error: 'Proposal not found' });
  }

  if (proposal.status !== 'active') {
    return res.status(400).json({ error: 'Proposal already finalized' });
  }

  // Check if voting period ended and quorum reached
  const proposalVotes = votes.get(proposalId) || new Map();
  if (Date.now() < proposal.endsAt) {
    return res.status(400).json({ error: 'Voting period still active' });
  }

  if (proposalVotes.size < proposal.quorum) {
    proposal.status = 'rejected';
    return res.json({
      message: 'Proposal rejected - quorum not reached',
      proposal
    });
  }

  // Mark as passed (execution would happen here in real implementation)
  proposal.status = 'passed';

  res.json({
    message: 'Proposal passed and ready for execution',
    proposal,
    executor: executorId
  });
});

// Get agent's voting history
votingRouter.get('/history/:agentId', (req, res) => {
  const agentId = req.params.agentId;
  const history: any[] = [];

  votes.forEach((proposalVotes, proposalId) => {
    if (proposalVotes.has(agentId)) {
      const proposal = proposals.get(proposalId);
      if (proposal) {
        history.push({
          proposal,
          weight: proposalVotes.get(agentId)
        });
      }
    }
  });

  res.json({
    agentId,
    votes: history,
    totalVotes: history.length
  });
});

export { proposals, votes };
