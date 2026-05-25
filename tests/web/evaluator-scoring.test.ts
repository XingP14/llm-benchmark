// tests/web/evaluator-scoring.test.ts - 评测引擎评分分支覆盖测试

import { EvaluatorEngine } from '../../src/web/engine/evaluator';
import { taskManager } from '../../src/web/engine/task';
import { resetDatabase, initAdminUser, resetSingleton, getDatabase } from '../../src/web/db/database';

// Mock adapters to return specific outputs
jest.mock('../../src/adapters/openai-adapter', () => ({
  OpenAIAdapter: jest.fn().mockImplementation(() => ({
    chat: jest.fn().mockResolvedValue('OK'),  // short output for dialogue
    name: 'openai',
  })),
}));

jest.mock('../../src/adapters/anthropic-adapter', () => ({
  AnthropicAdapter: jest.fn().mockImplementation(() => ({
    chat: jest.fn().mockResolvedValue('OK'),
    name: 'anthropic',
  })),
}));

jest.mock('../../src/adapters/glm-adapter', () => ({
  GLMAdapter: jest.fn().mockImplementation(() => ({
    chat: jest.fn().mockResolvedValue('OK'),
    name: 'glm',
  })),
}));

// Mock sandbox to fail execution
jest.mock('../../src/sandbox/python-sandbox', () => ({
  PythonSandbox: jest.fn().mockImplementation(() => ({
    execute: jest.fn().mockResolvedValue({ success: false, output: '', error: 'Execution failed' }),
  })),
}));

describe('Evaluator Scoring Branches', () => {
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
  });

  const sendWS = (data: any) => {
    wsMessages.push(data);
  };

  describe('dialogue scoring with short output', () => {
    it('should handle output.length <= 10 for dialogue', async () => {
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

      await engine.run(taskId, sendWS);

      const evaluation = db.prepare('SELECT * FROM evaluations WHERE id=?').get(taskId) as any;
      expect(evaluation.status).toBe('COMPLETED');

      const results = db.prepare('SELECT * FROM results WHERE evaluation_id=?').all(taskId) as any[];
      expect(results.length).toBeGreaterThan(0);
      // Short output 'OK' should get base score of 50 (no reference match, length <= 10)
      expect(results[0].score).toBe(50);
    });
  });

  describe('coding scoring with sandbox failure', () => {
    it('should handle sandbox failure for coding', async () => {
      // Mock adapter to return code with def and return
      const { OpenAIAdapter } = require('../../src/adapters/openai-adapter');
      OpenAIAdapter.mockImplementation(() => ({
        chat: jest.fn().mockResolvedValue('def add(a, b):\n    return a + b'),
        name: 'openai',
      }));

      const db = getDatabase();

      const configRes = db.prepare(`
        INSERT INTO configs (user_id, name, type, endpoint, api_key, model)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(adminUserId, 'Test Model', 'openai', 'https://api.openai.com/v1', 'sk-test', 'gpt-4');

      const configId = configRes.lastInsertRowid;
      const taskId = taskManager.startTask(adminUserId, [configId as number], false, true);

      db.prepare(`
        INSERT INTO evaluations (id, user_id, status, include_dialogue, include_coding)
        VALUES (?, ?, ?, ?, ?)
      `).run(taskId, adminUserId, 'PENDING', 0, 1);

      await engine.run(taskId, sendWS);

      const evaluation = db.prepare('SELECT * FROM evaluations WHERE id=?').get(taskId) as any;
      expect(evaluation.status).toBe('COMPLETED');

      const results = db.prepare('SELECT * FROM results WHERE evaluation_id=?').all(taskId) as any[];
      expect(results.length).toBeGreaterThan(0);
      // Sandbox fails, so should get score of 60 (has def and return but sandbox fails)
      expect(results[0].score).toBe(60);
    });
  });

  describe('coding scoring with no return', () => {
    it('should handle code without return', async () => {
      // Mock adapter to return code without return
      const { OpenAIAdapter } = require('../../src/adapters/openai-adapter');
      OpenAIAdapter.mockImplementation(() => ({
        chat: jest.fn().mockResolvedValue('def foo():\n    x = 1'),  // no return
        name: 'openai',
      }));

      const db = getDatabase();

      const configRes = db.prepare(`
        INSERT INTO configs (user_id, name, type, endpoint, api_key, model)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(adminUserId, 'Test Model', 'openai', 'https://api.openai.com/v1', 'sk-test', 'gpt-4');

      const configId = configRes.lastInsertRowid;
      const taskId = taskManager.startTask(adminUserId, [configId as number], false, true);

      db.prepare(`
        INSERT INTO evaluations (id, user_id, status, include_dialogue, include_coding)
        VALUES (?, ?, ?, ?, ?)
      `).run(taskId, adminUserId, 'PENDING', 0, 1);

      await engine.run(taskId, sendWS);

      const results = db.prepare('SELECT * FROM results WHERE evaluation_id=?').all(taskId) as any[];
      expect(results.length).toBeGreaterThan(0);
      // No return statement, so score should be 40
      expect(results[0].score).toBe(40);
    });
  });

  describe('coding scoring with no def', () => {
    it('should handle code without def', async () => {
      // Mock adapter to return code without def
      const { OpenAIAdapter } = require('../../src/adapters/openai-adapter');
      OpenAIAdapter.mockImplementation(() => ({
        chat: jest.fn().mockResolvedValue('x = 1\nprint(x)'),  // no def
        name: 'openai',
      }));

      const db = getDatabase();

      const configRes = db.prepare(`
        INSERT INTO configs (user_id, name, type, endpoint, api_key, model)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(adminUserId, 'Test Model', 'openai', 'https://api.openai.com/v1', 'sk-test', 'gpt-4');

      const configId = configRes.lastInsertRowid;
      const taskId = taskManager.startTask(adminUserId, [configId as number], false, true);

      db.prepare(`
        INSERT INTO evaluations (id, user_id, status, include_dialogue, include_coding)
        VALUES (?, ?, ?, ?, ?)
      `).run(taskId, adminUserId, 'PENDING', 0, 1);

      await engine.run(taskId, sendWS);

      const results = db.prepare('SELECT * FROM results WHERE evaluation_id=?').all(taskId) as any[];
      expect(results.length).toBeGreaterThan(0);
      // No def statement, so score should be 20
      expect(results[0].score).toBe(20);
    });
  });
});
