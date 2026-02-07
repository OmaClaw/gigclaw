import request from 'supertest';
import { app } from '../src/index';

describe('GigClaw API', () => {
  describe('Health Check', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);
      
      expect(response.body.status).toBe('ok');
      expect(response.body.service).toBe('GigClaw API');
    });
  });

  describe('Task Creation', () => {
    it('should create a task with valid data', async () => {
      const response = await request(app)
        .post('/api/tasks')
        .send({
          title: 'Security Audit Test',
          description: 'Test description that is long enough for validation',
          budget: 50.00,
          deadline: '2026-02-14T00:00:00Z',
          requiredSkills: ['security', 'solana'],
          posterId: 'test-poster-1'
        })
        .expect(201);
      
      expect(response.body.message).toBe('Task created');
      expect(response.body.taskId).toBeDefined();
      expect(response.body.task.status).toBe('posted');
    });

    it('should reject task with short title', async () => {
      await request(app)
        .post('/api/tasks')
        .send({
          title: 'Hi',
          description: 'Test description that is long enough',
          budget: 50.00,
          deadline: '2026-02-14T00:00:00Z',
          requiredSkills: ['security'],
          posterId: 'test-poster-1'
        })
        .expect(400);
    });

    it('should reject task with negative budget', async () => {
      await request(app)
        .post('/api/tasks')
        .send({
          title: 'Valid Title',
          description: 'Test description that is long enough',
          budget: -10,
          deadline: '2026-02-14T00:00:00Z',
          requiredSkills: ['security'],
          posterId: 'test-poster-1'
        })
        .expect(400);
    });

    it('should reject task with XSS attempt', async () => {
      const response = await request(app)
        .post('/api/tasks')
        .send({
          title: 'Test <script>alert("xss")</script>',
          description: 'Test description that is long enough for validation requirements',
          budget: 50.00,
          deadline: '2026-02-14T00:00:00Z',
          requiredSkills: ['security'],
          posterId: 'test-poster-1'
        })
        .expect(201);
      
      // Should have sanitized the title
      expect(response.body.task.title).not.toContain('<script>');
    });
  });

  describe('Task Bidding', () => {
    let taskId: string;

    beforeEach(async () => {
      const response = await request(app)
        .post('/api/tasks')
        .send({
          title: 'Test Task for Bidding',
          description: 'Test description that is long enough for validation',
          budget: 100.00,
          deadline: '2026-02-14T00:00:00Z',
          requiredSkills: ['coding'],
          posterId: 'test-poster'
        });
      taskId = response.body.taskId;
    });

    it('should place a bid on a task', async () => {
      const response = await request(app)
        .post(`/api/tasks/${taskId}/bid`)
        .send({
          agentId: 'test-agent',
          amount: 90.00,
          estimatedDuration: 3600
        })
        .expect(200);
      
      expect(response.body.message).toBe('Bid placed');
    });

    it('should reject bid on non-existent task', async () => {
      await request(app)
        .post('/api/tasks/invalid-uuid/bid')
        .send({
          agentId: 'test-agent',
          amount: 90.00,
          estimatedDuration: 3600
        })
        .expect(400);
    });
  });

  describe('Rate Limiting', () => {
    it('should rate limit after 10 task creations', async () => {
      // Create 10 tasks
      for (let i = 0; i < 10; i++) {
        await request(app)
          .post('/api/tasks')
          .send({
            title: `Test Task ${i}`,
            description: 'Test description that is long enough for validation',
            budget: 50.00,
            deadline: '2026-02-14T00:00:00Z',
            requiredSkills: ['test'],
            posterId: 'test-poster'
          });
      }

      // 11th should be rate limited
      await request(app)
        .post('/api/tasks')
        .send({
          title: 'Rate Limit Test',
          description: 'Test description that is long enough',
          budget: 50.00,
          deadline: '2026-02-14T00:00:00Z',
          requiredSkills: ['test'],
          posterId: 'test-poster'
        })
        .expect(429); // Too Many Requests
    });
  });
});
