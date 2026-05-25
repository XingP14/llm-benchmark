// tests/web/evaluator-long-output.test.ts - 评测引擎长对话输出测试

import { EvaluatorEngine } from '../../src/web/engine/evaluator';
import { taskManager } from '../../src/web/engine/task';
import { resetDatabase, initAdminUser, resetSingleton, getDatabase } from '../../src/web/db/database';

// Mock adapters - return long output that doesn't match reference answer
jest.mock('../../src/adapters/openai-adapter', () => ({
  OpenAIAdapter: jest.fn().mockImplementation(() => ({
    chat: jest.fn().mockResolvedValue('This is a long response that does not contain the key part of the reference answer for the question about water boiling point'),
    name: 'openai',
  })),
}));

jest.mock('../../src/sandbox/python-sandbox', () => ({
  PythonSandbox: jest.fn().mockImplementation(() => ({
    execute: jest.fn().mockResolvedValue({ success: true, output: 'OK' }),
  })),
}));

describe('Evaluator Long Output Dialogue', () => {
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

  it('should score dialogue with output length > 10 and no reference match', async () => {
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
    // Long output (>10 chars) should get base 50 + 20 for length = 70
    expect(results[0].score).toBe(70);
  });
});
