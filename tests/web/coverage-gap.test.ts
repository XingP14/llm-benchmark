// tests/web/coverage-gap.test.ts - 针对覆盖缺口的专项测试

import express, { Express } from 'express';
import request from 'supertest';
import authRoutes from '../../src/web/routes/auth';
import { resetDatabase, getDatabase, initAdminUser, resetSingleton, closeDatabase } from '../../src/web/db/database';

describe('Coverage Gap Tests', () => {
  describe('database.ts', () => {
    beforeAll(() => {
      resetSingleton();
      initAdminUser();
    });

    beforeEach(() => {
      resetDatabase();
    });

    it('should close database connection', () => {
      // Ensure database is open
      getDatabase();
      
      // Close it
      closeDatabase();
      
      // Re-open should work
      const db = getDatabase();
      expect(db).toBeDefined();
    });

    it('should not fail close when already closed', () => {
      closeDatabase();
      closeDatabase(); // Should not throw
      const db = getDatabase();
      expect(db).toBeDefined();
    });

    it('should initAdminUser when admin already exists', () => {
      // Admin already exists, should not insert again
      initAdminUser();
      const db = getDatabase();
      const admins = db.prepare('SELECT * FROM users WHERE username=?').all('admin');
      expect(admins.length).toBe(1);
    });
  });

  describe('auth middleware branches', () => {
    let app: Express;

    beforeAll(() => {
      resetSingleton();
      initAdminUser();

      app = express();
      app.use(express.json());
      app.use('/api/auth', authRoutes);
    });

    beforeEach(() => {
      resetDatabase();
    });

    it('should return 401 for invalid token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token');

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid token');
    });
  });

  describe('evaluator scoring branches', () => {
    // We need to test dialogue scoring with short output
    // and coding scoring with sandbox failure

    it('should score dialogue with short output', async () => {
      const { EvaluatorEngine } = require('../../src/web/engine/evaluator');
      const { taskManager } = require('../../src/web/engine/task');
      const { resetDatabase, initAdminUser, resetSingleton, getDatabase } = require('../../src/web/db/database');

      resetSingleton();
      initAdminUser();
      resetDatabase();

      const engine = new EvaluatorEngine();
      const db = getDatabase();
      const admin = db.prepare('SELECT id FROM users WHERE username=?').get('admin');
      const adminUserId = admin.id;

      // Create config
      const configRes = db.prepare(`
        INSERT INTO configs (user_id, name, type, endpoint, api_key, model)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(adminUserId, 'Test Model', 'openai', 'https://api.openai.com/v1', 'sk-test', 'gpt-4');
      const configId = configRes.lastInsertRowid;

      // Mock adapter to return short output (no reference answer match)
      jest.mock('../../src/adapters/openai-adapter', () => ({
        OpenAIAdapter: jest.fn().mockImplementation(() => ({
          chat: jest.fn().mockResolvedValue('OK'),  // short output
          name: 'openai',
        })),
      }));

      const wsMessages: any[] = [];
      const taskId = taskManager.startTask(adminUserId, [configId], true, false);

      db.prepare(`
        INSERT INTO evaluations (id, user_id, status, include_dialogue, include_coding)
        VALUES (?, ?, ?, ?, ?)
      `).run(taskId, adminUserId, 'PENDING', 1, 0);

      await engine.run(taskId, (data: any) => wsMessages.push(data));

      const evaluation = db.prepare('SELECT * FROM evaluations WHERE id=?').get(taskId);
      expect(evaluation.status).toBe('COMPLETED');
    });
  });
});
