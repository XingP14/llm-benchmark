// tests/web/evaluations-post.test.ts - 评测 POST 路由测试

import express, { Express } from 'express';
import request from 'supertest';
import configsRoutes from '../../src/web/routes/configs';
import evaluationsRoutes from '../../src/web/routes/evaluations';
import authRoutes from '../../src/web/routes/auth';
import { resetDatabase, getDatabase, initAdminUser, resetSingleton } from '../../src/web/db/database';

// Mock the evaluator engine
jest.mock('../../src/web/engine/evaluator', () => {
  return {
    EvaluatorEngine: jest.fn().mockImplementation(() => ({
      run: jest.fn().mockResolvedValue(undefined),
    })),
  };
});

// Mock websocket
jest.mock('../../src/web/websocket', () => ({
  getWSSender: jest.fn().mockReturnValue(() => {}),
}));

describe('Evaluations POST Routes', () => {
  let app: Express;
  let adminToken: string;

  beforeAll(() => {
    resetSingleton();
    initAdminUser();

    app = express();
    app.use(express.json());
    app.use('/api/auth', authRoutes);
    app.use('/api/configs', configsRoutes);
    app.use('/api/evaluations', evaluationsRoutes);
  });

  beforeEach(async () => {
    resetDatabase();
    
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' });
    adminToken = loginRes.body.token;
  });

  describe('POST /api/evaluations', () => {
    it('should create a new evaluation', async () => {
      // 创建一个 config
      const configRes = await request(app)
        .post('/api/configs')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Test Model',
          type: 'openai',
          endpoint: 'https://api.openai.com/v1',
          api_key: 'sk-test'
        });
      const configId = configRes.body.id;

      const res = await request(app)
        .post('/api/evaluations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          config_ids: [configId],
          dialogue: true,
          coding: true
        });

      expect(res.status).toBe(200);
      expect(res.body.evaluation_id).toBeDefined();
      expect(res.body.status).toBe('PENDING');
    });

    it('should reject missing config_ids', async () => {
      const res = await request(app)
        .post('/api/evaluations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('config_ids');
    });

    it('should reject empty config_ids array', async () => {
      const res = await request(app)
        .post('/api/evaluations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          config_ids: []
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('config_ids');
    });

    it('should reject non-array config_ids', async () => {
      const res = await request(app)
        .post('/api/evaluations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          config_ids: 'not-an-array'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('config_ids');
    });

    it('should handle dialogue-only evaluation', async () => {
      const configRes = await request(app)
        .post('/api/configs')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Test Model',
          type: 'openai',
          endpoint: 'https://api.openai.com/v1',
          api_key: 'sk-test'
        });
      const configId = configRes.body.id;

      const res = await request(app)
        .post('/api/evaluations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          config_ids: [configId],
          dialogue: true,
          coding: false
        });

      expect(res.status).toBe(200);
    });

    it('should handle coding-only evaluation', async () => {
      const configRes = await request(app)
        .post('/api/configs')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Test Model',
          type: 'openai',
          endpoint: 'https://api.openai.com/v1',
          api_key: 'sk-test'
        });
      const configId = configRes.body.id;

      const res = await request(app)
        .post('/api/evaluations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          config_ids: [configId],
          dialogue: false,
          coding: true
        });

      expect(res.status).toBe(200);
    });

    it('should reject without auth', async () => {
      const res = await request(app)
        .post('/api/evaluations')
        .send({
          config_ids: [1]
        });

      expect(res.status).toBe(401);
    });
  });
});
