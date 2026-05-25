// tests/web/evaluations.test.ts - 评测路由测试

import express, { Express } from 'express';
import request from 'supertest';
import configsRoutes from '../../src/web/routes/configs';
import evaluationsRoutes from '../../src/web/routes/evaluations';
import authRoutes from '../../src/web/routes/auth';
import { resetDatabase, getDatabase, initAdminUser, resetSingleton } from '../../src/web/db/database';

describe('Evaluations Routes', () => {
  let app: Express;
  let adminToken: string;
  let configId: number;
  let adminUserId: number;

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
    
    // 获取 admin 用户 ID
    const db = getDatabase();
    const admin = db.prepare('SELECT id FROM users WHERE username=?').get('admin') as any;
    adminUserId = admin.id;
    
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' });
    adminToken = loginRes.body.token;

    const configRes = await request(app)
      .post('/api/configs')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Test Model',
        type: 'openai',
        endpoint: 'https://api.openai.com/v1',
        api_key: 'sk-test'
      });
    configId = configRes.body.id;
  });

  describe('GET /api/evaluations', () => {
    it('should return empty array when no evaluations', async () => {
      const res = await request(app)
        .get('/api/evaluations')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(0);
    });

    it('should return evaluations after creation', async () => {
      const db = getDatabase();
      const evalId = 'test-eval-001';
      db.prepare(`
        INSERT INTO evaluations (id, user_id, status, include_dialogue, include_coding)
        VALUES (?, ?, ?, ?, ?)
      `).run(evalId, adminUserId, 'PENDING', 1, 1);

      const res = await request(app)
        .get('/api/evaluations')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].id).toBe(evalId);
    });

    it('should reject without auth', async () => {
      const res = await request(app)
        .get('/api/evaluations');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/evaluations/:id', () => {
    it('should return evaluation by id', async () => {
      const db = getDatabase();
      const evalId = 'test-eval-002';
      db.prepare(`
        INSERT INTO evaluations (id, user_id, status, include_dialogue, include_coding)
        VALUES (?, ?, ?, ?, ?)
      `).run(evalId, adminUserId, 'PENDING', 1, 1);

      const res = await request(app)
        .get(`/api/evaluations/${evalId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(evalId);
      expect(res.body.status).toBeDefined();
    });

    it('should return 404 for non-existent evaluation', async () => {
      const res = await request(app)
        .get('/api/evaluations/non-existent-id')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });

    it('should reject without auth', async () => {
      const res = await request(app)
        .get('/api/evaluations/some-id');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/evaluations/:id/results', () => {
    it('should return results structure', async () => {
      const db = getDatabase();
      const evalId = 'test-eval-003';
      db.prepare(`
        INSERT INTO evaluations (id, user_id, status, include_dialogue, include_coding)
        VALUES (?, ?, ?, ?, ?)
      `).run(evalId, adminUserId, 'COMPLETED', 1, 1);

      db.prepare(`
        INSERT INTO results (evaluation_id, config_id, question_id, question_type, category, model_output, score, reference_answer)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(evalId, configId, 'q-001', 'dialogue', 'factual', 'Test output', 85, 'Expected');

      const res = await request(app)
        .get(`/api/evaluations/${evalId}/results`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.evaluation).toBeDefined();
      expect(res.body.results).toBeDefined();
      expect(Array.isArray(res.body.results)).toBe(true);
    });

    it('should return 404 for non-existent evaluation', async () => {
      const res = await request(app)
        .get('/api/evaluations/non-existent/results')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });

    it('should calculate scores correctly', async () => {
      const db = getDatabase();
      const evalId = 'test-eval-004';
      db.prepare(`
        INSERT INTO evaluations (id, user_id, status, include_dialogue, include_coding)
        VALUES (?, ?, ?, ?, ?)
      `).run(evalId, adminUserId, 'COMPLETED', 1, 1);

      // 需要先关联配置
      db.prepare(`
        INSERT INTO evaluation_configs (evaluation_id, config_id) VALUES (?, ?)
      `).run(evalId, configId);

      db.prepare(`
        INSERT INTO results (evaluation_id, config_id, question_id, question_type, category, model_output, score)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(evalId, configId, 'q-001', 'dialogue', 'factual', 'Output 1', 80);

      db.prepare(`
        INSERT INTO results (evaluation_id, config_id, question_id, question_type, category, model_output, score)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(evalId, configId, 'q-002', 'coding', 'basic', 'Output 2', 90);

      const res = await request(app)
        .get(`/api/evaluations/${evalId}/results`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.results.length).toBe(1);
      expect(res.body.results[0].total_score).toBe(85);
      expect(res.body.results[0].dialogue_score).toBe(80);
      expect(res.body.results[0].coding_score).toBe(90);
    });
  });
});
