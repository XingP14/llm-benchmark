// tests/web/configs.test.ts - 配置管理测试

import express, { Express } from 'express';
import request from 'supertest';
import configsRoutes from '../../src/web/routes/configs';
import authRoutes from '../../src/web/routes/auth';
import { resetDatabase, initAdminUser } from '../../src/web/db/database';

describe('Configs Routes', () => {
  let app: Express;
  let adminToken: string;

  beforeAll(() => {
    initAdminUser();

    app = express();
    app.use(express.json());
    app.use('/api/auth', authRoutes);
    app.use('/api/configs', configsRoutes);
  });

  beforeEach(async () => {
    resetDatabase();
    
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' });
    adminToken = loginRes.body.token;
  });

  describe('GET /api/configs', () => {
    it('should return empty array when no configs', async () => {
      const res = await request(app)
        .get('/api/configs')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(0);
    });

    it('should return configs for user', async () => {
      await request(app)
        .post('/api/configs')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'GPT-4',
          type: 'openai',
          endpoint: 'https://api.openai.com/v1',
          api_key: 'sk-test',
          model: 'gpt-4'
        });

      const res = await request(app)
        .get('/api/configs')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].name).toBe('GPT-4');
      expect(res.body[0].api_key).toBeUndefined();
    });

    it('should reject without auth', async () => {
      const res = await request(app)
        .get('/api/configs');

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/configs', () => {
    it('should create config', async () => {
      const res = await request(app)
        .post('/api/configs')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Claude-3',
          type: 'anthropic',
          endpoint: 'https://api.anthropic.com',
          api_key: 'sk-ant-test',
          model: 'claude-3-haiku-20240307'
        });

      expect(res.status).toBe(200);
      expect(res.body.id).toBeDefined();
      expect(res.body.name).toBe('Claude-3');
      expect(res.body.type).toBe('anthropic');
    });

    it('should reject missing required fields', async () => {
      const res = await request(app)
        .post('/api/configs')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Incomplete'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Missing required fields');
    });

    it('should support glm type', async () => {
      const res = await request(app)
        .post('/api/configs')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'GLM-4',
          type: 'glm',
          endpoint: 'https://open.bigmodel.cn/api/paas/v4',
          api_key: 'glm-key',
          model: 'glm-4'
        });

      expect(res.status).toBe(200);
      expect(res.body.type).toBe('glm');
    });
  });

  describe('PUT /api/configs/:id', () => {
    it('should update config', async () => {
      const createRes = await request(app)
        .post('/api/configs')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Original',
          type: 'openai',
          endpoint: 'https://api.openai.com/v1',
          api_key: 'sk-test'
        });

      const id = createRes.body.id;

      const updateRes = await request(app)
        .put(`/api/configs/${id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Updated',
          type: 'openai',
          endpoint: 'https://api.openai.com/v1',
          api_key: 'sk-new',
          model: 'gpt-3.5'
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.success).toBe(true);

      const getRes = await request(app)
        .get('/api/configs')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(getRes.body[0].name).toBe('Updated');
      expect(getRes.body[0].model).toBe('gpt-3.5');
    });

    it('should return 404 for non-existent config', async () => {
      const res = await request(app)
        .put('/api/configs/99999')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Test',
          type: 'openai',
          endpoint: 'https://api.openai.com/v1',
          api_key: 'sk-test'
        });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/configs/:id', () => {
    it('should delete config', async () => {
      const createRes = await request(app)
        .post('/api/configs')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'To Delete',
          type: 'openai',
          endpoint: 'https://api.openai.com/v1',
          api_key: 'sk-test'
        });

      const id = createRes.body.id;

      const deleteRes = await request(app)
        .delete(`/api/configs/${id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.success).toBe(true);

      const getRes = await request(app)
        .get('/api/configs')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(getRes.body.length).toBe(0);
    });
  });
});
