import request from 'supertest';
import express from 'express';
import { tasksRouter } from '../routes/tasks';
import { blockchainRouter } from '../routes/blockchain';
import { healthRouter } from '../routes/health';

const app = express();
app.use(express.json());
app.use('/api/tasks', tasksRouter);
app.use('/api/blockchain', blockchainRouter);
app.use('/health', healthRouter);

describe('Health Endpoint', () => {
  it('should return health status', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('status');
    expect(response.body).toHaveProperty('version');
  });
});

describe('Tasks Endpoints', () => {
  describe('GET /api/tasks', () => {
    it('should return list of tasks', async () => {
      const response = await request(app).get('/api/tasks');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('tasks');
      expect(Array.isArray(response.body.tasks)).toBe(true);
    });
  });

  describe('POST /api/tasks', () => {
    it('should create a new task with valid data', async () => {
      const taskData = {
        title: 'Test Task',
        description: 'Test description',
        budget: 10,
        currency: 'USDC',
        posterId: 'test-agent',
        requiredSkills: ['javascript'],
      };

      const response = await request(app)
        .post('/api/tasks')
        .send(taskData);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('task');
      expect(response.body.task.title).toBe(taskData.title);
      expect(response.body.task.budget).toBe(taskData.budget);
    });

    it('should return 400 with invalid data', async () => {
      const invalidData = {
        title: '', // Empty title should fail
        budget: -1, // Negative budget should fail
      };

      const response = await request(app)
        .post('/api/tasks')
        .send(invalidData);

      expect(response.status).toBe(400);
    });

    it('should require title field', async () => {
      const response = await request(app)
        .post('/api/tasks')
        .send({ budget: 10, posterId: 'test' });

      expect(response.status).toBe(400);
    });

    it('should require budget field', async () => {
      const response = await request(app)
        .post('/api/tasks')
        .send({ title: 'Test', posterId: 'test' });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/tasks/:id', () => {
    it('should return 404 for non-existent task', async () => {
      const response = await request(app).get('/api/tasks/non-existent-id');
      expect(response.status).toBe(404);
    });
  });
});

describe('Blockchain Endpoints', () => {
  describe('GET /api/blockchain/status', () => {
    it('should return blockchain status', async () => {
      const response = await request(app).get('/api/blockchain/status');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('deployment');
      expect(response.body.deployment).toHaveProperty('programId');
    });
  });

  describe('GET /api/blockchain/program', () => {
    it('should return program details', async () => {
      const response = await request(app).get('/api/blockchain/program');
      // May return 200 or 404 depending on connection
      expect([200, 404]).toContain(response.status);
    });
  });
});
