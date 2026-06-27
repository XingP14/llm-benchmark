// tests/web/evaluator-full.test.ts - 评测引擎完整测试

import { EvaluatorEngine } from '../../src/web/engine/evaluator';
import { taskManager } from '../../src/web/engine/task';
import { resetDatabase, initAdminUser, resetSingleton, getDatabase } from '../../src/web/db/database';

// Mock adapters
jest.mock('../../src/adapters/openai-adapter', () => ({
  OpenAIAdapter: jest.fn().mockImplementation(() => ({
    chat: jest.fn().mockResolvedValue('def add(a, b):\n    return a + b'),
    name: 'openai',
  })),
}));

jest.mock('../../src/adapters/anthropic-adapter', () => ({
  AnthropicAdapter: jest.fn().mockImplementation(() => ({
    chat: jest.fn().mockResolvedValue('def add(a, b):\n    return a + b'),
    name: 'anthropic',
  })),
}));

jest.mock('../../src/adapters/glm-adapter', () => ({
  GLMAdapter: jest.fn().mockImplementation(() => ({
    chat: jest.fn().mockResolvedValue('def add(a, b):\n    return a + b'),
    name: 'glm',
  })),
}));

// Mock sandbox
jest.mock('../../src/sandbox/python-sandbox', () => ({
  PythonSandbox: jest.fn().mockImplementation(() => ({
    execute: jest.fn().mockResolvedValue({ success: true, output: 'OK' }),
  })),
}));

describe('EvaluatorEngine Full Tests', () => {
  let engine: EvaluatorEngine;
  let wsMessages: any[];
  let adminUserId: number;

  beforeAll(() => {
    resetSingleton();
    initAdminUser();
  });

  beforeEach(() => {
    resetDatabase();
    engine = new EvaluatorEngine();
    wsMessages = [];

    const db = getDatabase();
    const admin = db.prepare('SELECT id FROM users WHERE username=?').get('admin') as any;
    adminUserId = admin.id;

    // Reset mock implementations
    const { OpenAIAdapter } = require('../../src/adapters/openai-adapter');
    OpenAIAdapter.mockImplementation(() => ({
      chat: jest.fn().mockResolvedValue('def add(a, b):\n    return a + b'),
      name: 'openai',
    }));
  });

  const sendWS = (data: any) => {
    wsMessages.push(data);
  };

  describe('run', () => {
    it('should return early if no current task', async () => {
      await engine.run('eval-001', sendWS);
      expect(wsMessages).toHaveLength(0);
    });

    it('should run evaluation with dialogue questions', async () => {
      const db = getDatabase();

      const configRes = db.prepare(`
        INSERT INTO configs (user_id, name, type, endpoint, api_key, model)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(adminUserId, 'Test OpenAI', 'openai', 'https://api.openai.com/v1', 'sk-test', 'gpt-4');

      const configId = configRes.lastInsertRowid;
      const taskId = taskManager.startTask(adminUserId, [configId as number], true, false);

      db.prepare(`
        INSERT INTO evaluations (id, user_id, status, include_dialogue, include_coding)
        VALUES (?, ?, ?, ?, ?)
      `).run(taskId, adminUserId, 'PENDING', 1, 0);

      await engine.run(taskId, sendWS);

      const evaluation = db.prepare('SELECT * FROM evaluations WHERE id=?').get(taskId) as any;
      expect(evaluation.status).toBe('COMPLETED');

      const results = db.prepare('SELECT * FROM results WHERE evaluation_id=?').all(taskId);
      expect(results.length).toBeGreaterThan(0);

      expect(wsMessages.some((m: any) => m.type === 'start')).toBe(true);
      expect(wsMessages.some((m: any) => m.type === 'progress')).toBe(true);
      expect(wsMessages.some((m: any) => m.type === 'completed')).toBe(true);
    });

    it('should run evaluation with coding questions', async () => {
      const db = getDatabase();

      const configRes = db.prepare(`
        INSERT INTO configs (user_id, name, type, endpoint, api_key, model)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(adminUserId, 'Test Anthropic', 'anthropic', 'https://api.anthropic.com', 'sk-ant', 'claude-3');

      const configId = configRes.lastInsertRowid;
      const taskId = taskManager.startTask(adminUserId, [configId as number], false, true);

      db.prepare(`
        INSERT INTO evaluations (id, user_id, status, include_dialogue, include_coding)
        VALUES (?, ?, ?, ?, ?)
      `).run(taskId, adminUserId, 'PENDING', 0, 1);

      await engine.run(taskId, sendWS);

      const evaluation = db.prepare('SELECT * FROM evaluations WHERE id=?').get(taskId) as any;
      expect(evaluation.status).toBe('COMPLETED');
    });

    it('should handle individual question error gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error');
      const db = getDatabase();

      const configRes = db.prepare(`
        INSERT INTO configs (user_id, name, type, endpoint, api_key, model)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(adminUserId, 'Test Model', 'openai', 'https://api.openai.com/v1', 'sk-test', 'gpt-4');

      const configId = configRes.lastInsertRowid;
      const taskId = taskManager.startTask(adminUserId, [configId as number], true, false);

      db.prepare(`
        INSERT INTO evaluations (id, user_id, status, include_dialogue, include_coding)
        VALUES (?, ?, ?, ?, ?)
      `).run(taskId, adminUserId, 'PENDING', 1, 0);

      // Mock adapter to throw error
      const { OpenAIAdapter } = require('../../src/adapters/openai-adapter');
      OpenAIAdapter.mockImplementation(() => ({
        chat: jest.fn().mockRejectedValue(new Error('API Error')),
        name: 'openai',
      }));

      await engine.run(taskId, sendWS);

      // Evaluation completes with error results stored (score 0)
      const evaluation = db.prepare('SELECT * FROM evaluations WHERE id=?').get(taskId) as any;
      expect(evaluation.status).toBe('COMPLETED');

      const results = db.prepare('SELECT * FROM results WHERE evaluation_id=?').all(taskId) as any[];
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].model_output).toContain('Error:');
      expect(results[0].score).toBe(0);
      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should handle cancellation during evaluation', async () => {
      const db = getDatabase();

      const configRes = db.prepare(`
        INSERT INTO configs (user_id, name, type, endpoint, api_key, model)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(adminUserId, 'Test Model', 'openai', 'https://api.openai.com/v1', 'sk-test', 'gpt-4');

      const configId = configRes.lastInsertRowid;
      const taskId = taskManager.startTask(adminUserId, [configId as number], true, false);

      db.prepare(`
        INSERT INTO evaluations (id, user_id, status, include_dialogue, include_coding)
        VALUES (?, ?, ?, ?, ?)
      `).run(taskId, adminUserId, 'PENDING', 1, 0);

      taskManager.requestCancel();

      await engine.run(taskId, sendWS);

      const evaluation = db.prepare('SELECT * FROM evaluations WHERE id=?').get(taskId) as any;
      expect(evaluation.status).toBe('CANCELLED');
      expect(wsMessages.some((m: any) => m.type === 'cancelled')).toBe(true);
    });

    it('should run with glm adapter type', async () => {
      const db = getDatabase();

      const configRes = db.prepare(`
        INSERT INTO configs (user_id, name, type, endpoint, api_key, model)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(adminUserId, 'Test GLM', 'glm', 'https://api.zhipuai.com', 'sk-glm', 'glm-4');

      const configId = configRes.lastInsertRowid;
      const taskId = taskManager.startTask(adminUserId, [configId as number], true, false);

      db.prepare(`
        INSERT INTO evaluations (id, user_id, status, include_dialogue, include_coding)
        VALUES (?, ?, ?, ?, ?)
      `).run(taskId, adminUserId, 'PENDING', 1, 0);

      await engine.run(taskId, sendWS);

      const evaluation = db.prepare('SELECT * FROM evaluations WHERE id=?').get(taskId) as any;
      expect(evaluation.status).toBe('COMPLETED');
    });

    it('should skip config not found in database', async () => {
      const db = getDatabase();

      // Use a non-existent config ID
      const taskId = taskManager.startTask(adminUserId, [99999], true, false);

      db.prepare(`
        INSERT INTO evaluations (id, user_id, status, include_dialogue, include_coding)
        VALUES (?, ?, ?, ?, ?)
      `).run(taskId, adminUserId, 'PENDING', 1, 0);

      await engine.run(taskId, sendWS);

      const evaluation = db.prepare('SELECT * FROM evaluations WHERE id=?').get(taskId) as any;
      expect(evaluation.status).toBe('COMPLETED');

      const results = db.prepare('SELECT * FROM results WHERE evaluation_id=?').all(taskId) as any[];
      expect(results.length).toBe(0);
    });

    it('should handle outer try-catch error', async () => {
      const consoleSpy = jest.spyOn(console, 'error');
      const db = getDatabase();

      const configRes = db.prepare(`
        INSERT INTO configs (user_id, name, type, endpoint, api_key, model)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(adminUserId, 'Test Model', 'openai', 'https://api.openai.com/v1', 'sk-test', 'gpt-4');

      const configId = configRes.lastInsertRowid;
      const taskId = taskManager.startTask(adminUserId, [configId as number], true, false);

      db.prepare(`
        INSERT INTO evaluations (id, user_id, status, include_dialogue, include_coding)
        VALUES (?, ?, ?, ?, ?)
      `).run(taskId, adminUserId, 'PENDING', 1, 0);

      // Mock taskManager.setRunning to throw - this triggers outer catch
      const originalSetRunning = taskManager.setRunning.bind(taskManager);
      taskManager.setRunning = () => { throw new Error('Task setup error'); };

      await engine.run(taskId, sendWS);

      const evaluation = db.prepare('SELECT * FROM evaluations WHERE id=?').get(taskId) as any;
      expect(evaluation.status).toBe('FAILED');
      expect(wsMessages.some((m: any) => m.type === 'error')).toBe(true);
      expect(consoleSpy).not.toHaveBeenCalled();

      // Restore
      taskManager.setRunning = originalSetRunning;
      consoleSpy.mockRestore();
    });
  });
});
