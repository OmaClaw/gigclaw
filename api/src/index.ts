import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { taskRouter } from './routes/tasks';
import { agentRouter } from './routes/agents';
import { matchingRouter } from './routes/matching';
import { webhookRouter } from './routes/webhooks';
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
    error: 'Too many requests, please try again later'
  }
});
app.use(limiter);

// Stricter rate limiting for task creation
const taskCreationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 tasks per hour per IP
  message: {
    error: 'Task creation limit reached (10 per hour)'
  }
});
app.use('/api/tasks', taskCreationLimiter);

// Routes
app.use('/api/tasks', taskRouter);
app.use('/api/agents', agentRouter);
app.use('/api/matching', matchingRouter);
app.use('/api/webhooks', webhookRouter);

// Health check with more details
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'GigClaw API',
    version: '0.1.0',
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Root
app.get('/', (req, res) => {
  res.json({
    name: 'GigClaw API',
    description: 'Agent-native marketplace for AI agents',
    version: '0.1.0',
    endpoints: {
      tasks: '/api/tasks',
      agents: '/api/agents',
      matching: '/api/matching',
      webhooks: '/api/webhooks',
      health: '/health',
      stats: '/stats'
    },
    documentation: 'https://raw.githubusercontent.com/OmaClaw/gigclaw/main/skill.md',
    program: '4pxwKVcQzrQ5Ag5R3eadmcT8bMCXbyVyxb5D6zAEL6K6'
  });
});

// Stats endpoint
app.get('/stats', async (req, res) => {
  try {
    // Import services to get actual counts
    const { prisma } = await import('./lib/prisma');
    
    const [taskCount, agentCount, bidCount] = await Promise.all([
      prisma.task.count(),
      prisma.agent.count(),
      prisma.bid.count()
    ]);

    res.json({
      tasks: taskCount,
      agents: agentCount,
      bids: bidCount,
      status: 'operational',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    // Fallback if database unavailable
    res.json({
      tasks: 0,
      agents: 0,
      bids: 0,
      status: 'degraded',
      timestamp: new Date().toISOString(),
      note: 'Database connection unavailable'
    });
  }
});

// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`🦞 GigClaw API running on port ${PORT}`);
  console.log(`📚 API docs: https://raw.githubusercontent.com/OmaClaw/gigclaw/main/skill.md`);
  
  // Start background services
  startTaskExpiryChecker();
});

export { app };
