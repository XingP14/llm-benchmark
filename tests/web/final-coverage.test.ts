// tests/web/final-coverage.test.ts - 最终覆盖率补齐测试

import express, { Express } from 'express';
import request from 'supertest';
import configsRoutes from '../../src/web/routes/configs';
import evaluationsRoutes from '../../src/web/routes/evaluations';
import authRoutes from '../../src/web/routes/auth';
import { resetDatabase, getDatabase, initAdminUser, resetSingleton, closeDatabase } from '../../src/web/db/database';
import { initAdmin } from '../../src/web/routes/auth';

// Mock evaluator engine
jest.mock('../../src/web/engine/evaluator', () => ({
  EvaluatorEngine: jest.fn().mockImplementation(() => ({
    run: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../src/web/websocket', () => ({
  getWSSender: jest.fn().mockReturnValue(() => {}),
}));

describe('Final Coverage Tests', () => {
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

  describe('database.ts coverage', () => {
    it('should handle closeDatabase when db is null', () => {
      closeDatabase();
      closeDatabase(); // Second call should not throw
      const db = getDatabase();
      expect(db).toBeDefined();
    });
  });

  describe('initAdmin function', () => {
    it('should call initAdmin and not duplicate admin', () => {
      // Admin already exists, should not throw
      initAdmin();
      const db = getDatabase();
      const admins = db.prepare('SELECT * FROM users WHERE username=?').all('admin');
      expect(admins.length).toBe(1);
    });
  });

  describe('configs PUT and DELETE', () => {
    let configId: number;

    beforeEach(async () => {
      const createRes = await request(app)
        .post('/api/configs')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Test Model',
          type: 'openai',
          endpoint: 'https://api.openai.com/v1',
          api_key: 'sk-test',
        });
      configId = createRes.body.id;
    });

    it('should update config with is_active: true', async () => {
      const res = await request(app)
        .put(`/api/configs/${configId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Updated Model',
          type: 'anthropic',
          endpoint: 'https://api.anthropic.com',
          api_key: 'sk-ant',
          is_active: true,
        });

      expect(res.status).toBe(200);
    });

    it('should update config with is_active: false', async () => {
      const res = await request(app)
        .put(`/api/configs/${configId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Updated Model',
          type: 'anthropic',
          endpoint: 'https://api.anthropic.com',
          api_key: 'sk-ant',
          is_active: false,
        });

      expect(res.status).toBe(200);
    });

    it('should update config without is_active (undefined)', async () => {
      const res = await request(app)
        .put(`/api/configs/${configId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Updated Model',
          type: 'openai',
          endpoint: 'https://api.openai.com/v1',
          api_key: 'sk-test',
        });

      expect(res.status).toBe(200);
    });

    it('should return 404 for PUT non-existent config', async () => {
      const res = await request(app)
        .put('/api/configs/99999')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Test',
          type: 'openai',
          endpoint: 'https://api.openai.com/v1',
          api_key: 'sk-test',
        });

      expect(res.status).toBe(404);
    });

    it('should delete config', async () => {
      const res = await request(app)
        .delete(`/api/configs/${configId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('evaluations POST validation', () => {
    it('should reject with invalid config_ids type', async () => {
      const res = await request(app)
        .post('/api/evaluations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ config_ids: 'not-array' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('config_ids');
    });
  });
});
