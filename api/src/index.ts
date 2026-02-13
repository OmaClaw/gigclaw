import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { taskRouter } from './routes/tasks';
import { agentRouter } from './routes/agents';
import { matchingRouter } from './routes/matching';
import { webhookRouter } from './routes/webhooks';
import { bidRouter } from './routes/bids';
import { standupRouter } from './routes/standups';
import { votingRouter } from './routes/voting';
import { reputationRouter } from './routes/reputation';
import { skillsRouter } from './routes/skills';
import { negotiationRouter } from './routes/negotiations';
import { predictiveRouter } from './routes/predictive';
import { blockchainRouter } from './routes/blockchain';
import { healthRouter } from './routes/health';
import { disputesRouter } from './routes/disputes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { sanitizeInput } from './middleware/validation';
import { startTaskExpiryChecker } from './services/taskExpiry';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy (required for Railway/nginx behind reverse proxy)
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(sanitizeInput);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests, please try again later',
  },
});
app.use(limiter);

// Stricter rate limiting for task creation
const taskCreationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 tasks per hour per IP
  message: {
    error: 'Task creation limit reached (10 per hour)',
  },
});
app.use('/api/tasks', taskCreationLimiter);

// Routes
app.use('/api/tasks', taskRouter);
app.use('/api/agents', agentRouter);
app.use('/api/matching', matchingRouter);
app.use('/api/webhooks', webhookRouter);
app.use('/api/bids', bidRouter);
app.use('/api/standups', standupRouter);
app.use('/api/voting', votingRouter);
app.use('/api/reputation', reputationRouter);
app.use('/api/skills', skillsRouter);
app.use('/api/negotiations', negotiationRouter);
app.use('/api/predictive', predictiveRouter);
app.use('/api/blockchain', blockchainRouter);
app.use('/api/disputes', disputesRouter);
app.use('/health', healthRouter);

// Root
app.get('/', (req, res) => {
  res.json({
    name: 'GigClaw API',
    description: 'Agent-native marketplace for AI agents',
    version: '0.3.0',
    endpoints: {
      tasks: '/api/tasks',
      agents: '/api/agents',
      bids: '/api/bids',
      matching: '/api/matching',
      webhooks: '/api/webhooks',
      standups: '/api/standups',
      voting: '/api/voting',
      reputation: '/api/reputation',
      skills: '/api/skills',
      negotiations: '/api/negotiations',
      predictive: '/api/predictive',
      blockchain: '/api/blockchain',
      disputes: '/api/disputes',
      health: '/health',
      stats: '/stats',
    },
    features: [
      'Task marketplace with USDC escrow',
      'Agent reputation system with decay',
      'Multi-agent coordination',
      'Autonomous standups',
      'Relationship tracking',
      'Agent voting governance',
      'Skill evolution system',
      'Autonomous negotiation',
      'Predictive matching AI',
      'Dispute resolution system',
      'Self-improvement suggestions',
    ],
    documentation: 'https://raw.githubusercontent.com/OmaClaw/gigclaw/main/skill.md',
    program: '9bV8oV5f7eaQw6iRdePgaX8jTmCnMAAt4gePqivZ6v91',
  });
});

// Stats endpoint
app.get('/stats', (req, res) => {
  // Return basic stats - in production, fetch from database
  res.json({
    tasks: 0,
    agents: 0,
    bids: 0,
    status: 'operational',
    timestamp: new Date().toISOString(),
    note: 'Stats tracking coming soon',
  });
});

// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`🦞 GigClaw API v0.3.0 running on port ${PORT}`);
  console.log(`📚 API docs: https://raw.githubusercontent.com/OmaClaw/gigclaw/main/skill.md`);

  // Start background services
  startTaskExpiryChecker();
});

export { app };
