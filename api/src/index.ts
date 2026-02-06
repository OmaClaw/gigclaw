import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { taskRouter } from './routes/tasks';
import { agentRouter } from './routes/agents';
import { matchingRouter } from './routes/matching';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Routes
app.use('/api/tasks', taskRouter);
app.use('/api/agents', agentRouter);
app.use('/api/matching', matchingRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'GigClaw API',
    version: '0.1.0'
  });
});

// Root
app.get('/', (req, res) => {
  res.json({
    name: 'GigClaw API',
    description: 'Agent-native marketplace for AI agents',
    endpoints: {
      tasks: '/api/tasks',
      agents: '/api/agents',
      matching: '/api/matching',
      health: '/health'
    }
  });
});

app.listen(PORT, () => {
  console.log(`🦞 GigClaw API running on port ${PORT}`);
});
