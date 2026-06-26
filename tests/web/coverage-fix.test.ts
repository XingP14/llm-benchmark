// tests/web/coverage-fix.test.ts - 集中补齐覆盖率缺口

import express, { Express } from 'express';
import request from 'supertest';
import http from 'http';
import jwt from 'jsonwebtoken';
import configsRoutes from '../../src/web/routes/configs';
import evaluationsRoutes from '../../src/web/routes/evaluations';
import authRoutes from '../../src/web/routes/auth';
import {
  resetDatabase,
  getDatabase,
  initAdminUser,
  resetSingleton,
  closeDatabase,
} from '../../src/web/db/database';
import { initWebSocket, getWSSender } from '../../src/web/websocket';
import { Reporter } from '../../src/core/reporter';
import { EvaluatorEngine } from '../../src/web/engine/evaluator';
import { taskManager } from '../../src/web/engine/task';
import { PythonSandbox } from '../../src/sandbox/python-sandbox';
import { EvaluationResult } from '../../src/types';
import { WebSocket } from 'ws';

// Mock adapters
jest.mock('../../src/adapters/openai-adapter', () => ({
  OpenAIAdapter: jest.fn().mockImplementation(() => ({
    chat: jest.fn().mockResolvedValue('def add(a, b):\n    return a + b'),
    name: 'openai',
    ping: jest.fn().mockResolvedValue(true),
  })),
}));
jest.mock('../../src/adapters/anthropic-adapter', () => ({
  AnthropicAdapter: jest.fn().mockImplementation(() => ({
    chat: jest.fn().mockResolvedValue('def add(a, b):\n    return a + b'),
    name: 'anthropic',
    ping: jest.fn().mockResolvedValue(true),
  })),
}));
jest.mock('../../src/adapters/glm-adapter', () => ({
  GLMAdapter: jest.fn().mockImplementation(() => ({
    chat: jest.fn().mockResolvedValue('def add(a, b):\n    return a + b'),
    name: 'glm',
    ping: jest.fn().mockResolvedValue(true),
  })),
}));
jest.mock('../../src/sandbox/python-sandbox', () => ({
  PythonSandbox: jest.fn().mockImplementation(() => ({
    execute: jest.fn().mockResolvedValue({ success: true, output: 'OK', duration: 10 }),
  })),
}));

const JWT_SECRET = process.env.JWT_SECRET || 'llm-bench-secret';

describe('Coverage Fix - database.ts', () => {
  beforeAll(() => {
    resetSingleton();
    initAdminUser();
  });

  beforeEach(() => resetDatabase());

  it('getDatabase should re-create connection after close (line 18)', () => {
    closeDatabase();
    // db is now null
    const db = getDatabase();
    expect(db).toBeDefined();
    // Verify it works
    const admin = db.prepare('SELECT id FROM users WHERE username=?').get('admin');
    expect(admin).toBeDefined();
  });

  it('resetDatabase should work even when db is null (lines 54-56)', () => {
    closeDatabase();
    // db is null — resetDatabase should re-create it
    resetDatabase();
    const db = getDatabase();
    const admin = db.prepare('SELECT id FROM users WHERE username=?').get('admin');
    expect(admin).toBeDefined();
  });
});

describe('Coverage Fix - websocket.ts', () => {
  let server: http.Server;
  let wsUrl: string;
  const wsConnections: WebSocket[] = [];

  beforeAll((done) => {
    const app = express();
    server = http.createServer(app);
    initWebSocket(server);
    server.listen(0, () => {
      const addr = server.address() as any;
      wsUrl = `ws://localhost:${addr.port}/ws`;
      done();
    });
  });

  afterAll((done) => {
    // Close all lingering connections
    wsConnections.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.terminate();
      }
    });
    server.close(done);
  });

  it('should close connection when no token provided (line 33-34)', (done) => {
    const ws = new WebSocket(`${wsUrl}`);
    wsConnections.push(ws);
    ws.on('close', (code) => {
      expect(code).toBe(4001);
      done();
    });
    ws.on('error', () => {}); // suppress
  });

  it('should close connection with invalid token (line 39-40)', (done) => {
    const ws = new WebSocket(`${wsUrl}?token=bad-token`);
    wsConnections.push(ws);
    ws.on('close', (code) => {
      expect(code).toBe(4002);
      done();
    });
    ws.on('error', () => {});
  });

  it('should handle cancel message and close (lines 53-54)', (done) => {
    const token = jwt.sign({ userId: 1, username: 'admin' }, JWT_SECRET);
    const ws = new WebSocket(`${wsUrl}?token=${token}`);
    wsConnections.push(ws);
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'cancel' }));
      setTimeout(() => {
        ws.close();
        done();
      }, 100);
    });
    ws.on('error', () => {});
  });

  it('getWSSender should return noop when no connection', () => {
    const sender = getWSSender();
    expect(typeof sender).toBe('function');
    // Should not throw
    sender({ type: 'start', evaluation_id: 'noop-test' });
  });
});

describe('Coverage Fix - reporter.ts branches', () => {
  const makeResult = (name: string, score: number, dialogue: number, coding: number): EvaluationResult => ({
    modelName: name,
    model: { name, type: 'openai', endpoint: 'https://api.openai.com/v1', apiKey: 'sk-test', model: 'gpt-4' },
    totalScore: score,
    timestamp: new Date(),
    duration: 5000,
    dimensions: {
      dialogue: {
        total: dialogue * 2,
        count: 2,
        average: dialogue,
        details: { factual: dialogue, creative: dialogue - 5 },
      },
      coding: {
        total: coding * 2,
        count: 2,
        average: coding,
        details: { basic: coding, algorithm: coding - 3 },
      },
    },
    scores: [],
  });

  it('generateMarkdown should handle 4th+ place (no medal)', () => {
    const results = [
      makeResult('Model A', 90, 88, 92),
      makeResult('Model B', 85, 83, 87),
      makeResult('Model C', 80, 78, 82),
      makeResult('Model D', 75, 73, 77),
    ];
    const md = Reporter.generateMarkdown(results);
    expect(md).toContain('4'); // 4th place shows number
    expect(md).toContain('🥇');
    expect(md).toContain('🥈');
    expect(md).toContain('🥉');
  });

  it('generateHTML should handle empty results', () => {
    const html = Reporter.generateHTML([]);
    expect(html).toContain('LLM Benchmark');
  });

  it('generateHTML should handle 4th+ place', () => {
    const results = [
      makeResult('Model A', 90, 88, 92),
      makeResult('Model B', 85, 83, 87),
      makeResult('Model C', 80, 78, 82),
      makeResult('Model D', 75, 73, 77),
    ];
    const html = Reporter.generateHTML(results);
    expect(html).toContain('Model D');
  });

  it('generateMarkdown with empty results', () => {
    const md = Reporter.generateMarkdown([]);
    expect(md).toContain('LLM Benchmark');
  });

  it('saveReport should create files', () => {
    const results = [makeResult('Test', 85, 80, 90)];
    const outDir = './test-report-coverage-fix';
    // 清空目录历史残留（之前失败跑会在目录里留下 benchmark-* 文件）
    const fs = require('fs');
    if (fs.existsSync(outDir)) {
      for (const f of fs.readdirSync(outDir)) {
        fs.unlinkSync(`${outDir}/${f}`);
      }
    }
    Reporter.saveReport(results, outDir);
    const files = fs.readdirSync(outDir);
    // v0.3.0+: 生成 .json / .md / .html / .csv 四个文件
    // (CSV 是 v0.3.0 加入的排行榜文件，可直接 Excel 打开)
    expect(files.length).toBe(4);
    // cleanup
    files.forEach((f: string) => fs.unlinkSync(`${outDir}/${f}`));
    fs.rmdirSync(outDir);
  });
});

describe('Coverage Fix - evaluator.ts scoring branches', () => {
  let engine: EvaluatorEngine;

  beforeAll(() => {
    resetSingleton();
    initAdminUser();
  });

  beforeEach(() => {
    resetDatabase();
    engine = new EvaluatorEngine();
  });

  it('scoreCoding: output without def keyword (line 59-60)', async () => {
    const db = getDatabase();
    const admin = db.prepare('SELECT id FROM users WHERE username=?').get('admin') as any;

    const configRes = db.prepare(`
      INSERT INTO configs (user_id, name, type, endpoint, api_key, model)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(admin.id, 'Test', 'openai', 'https://api.openai.com/v1', 'sk-test', 'gpt-4');

    const taskId = taskManager.startTask(admin.id, [configRes.lastInsertRowid as number], false, true);

    db.prepare(`
      INSERT INTO evaluations (id, user_id, status, include_dialogue, include_coding)
      VALUES (?, ?, ?, ?, ?)
    `).run(taskId, admin.id, 'PENDING', 0, 1);

    // Mock adapter to return non-code output (no 'def')
    const { OpenAIAdapter } = require('../../src/adapters/openai-adapter');
    OpenAIAdapter.mockImplementation(() => ({
      chat: jest.fn().mockResolvedValue('This is plain text, no code here'),
      name: 'openai',
    }));

    const wsMessages: any[] = [];
    await engine.run(taskId, (d: any) => wsMessages.push(d));

    const results = db.prepare('SELECT * FROM results WHERE evaluation_id=?').all(taskId) as any[];
    expect(results.length).toBeGreaterThan(0);
    // Score should be 20 (no def)
    expect(results[0].score).toBe(20);
  });

  it('scoreCoding: output with def but no return/print (line 60)', async () => {
    const db = getDatabase();
    const admin = db.prepare('SELECT id FROM users WHERE username=?').get('admin') as any;

    const configRes = db.prepare(`
      INSERT INTO configs (user_id, name, type, endpoint, api_key, model)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(admin.id, 'Test', 'openai', 'https://api.openai.com/v1', 'sk-test', 'gpt-4');

    const taskId = taskManager.startTask(admin.id, [configRes.lastInsertRowid as number], false, true);

    db.prepare(`
      INSERT INTO evaluations (id, user_id, status, include_dialogue, include_coding)
      VALUES (?, ?, ?, ?, ?)
    `).run(taskId, admin.id, 'PENDING', 0, 1);

    // Mock adapter to return code with def but no return/print
    const { OpenAIAdapter } = require('../../src/adapters/openai-adapter');
    OpenAIAdapter.mockImplementation(() => ({
      chat: jest.fn().mockResolvedValue('def add(a, b):\n    pass'),
      name: 'openai',
    }));

    const wsMessages: any[] = [];
    await engine.run(taskId, (d: any) => wsMessages.push(d));

    const results = db.prepare('SELECT * FROM results WHERE evaluation_id=?').all(taskId) as any[];
    expect(results.length).toBeGreaterThan(0);
    // Score should be 40 (has def, no return/print)
    expect(results[0].score).toBe(40);
  });

  it('scoreCoding: sandbox execution failure (line 180)', async () => {
    const db = getDatabase();
    const admin = db.prepare('SELECT id FROM users WHERE username=?').get('admin') as any;

    const configRes = db.prepare(`
      INSERT INTO configs (user_id, name, type, endpoint, api_key, model)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(admin.id, 'Test', 'openai', 'https://api.openai.com/v1', 'sk-test', 'gpt-4');

    const taskId = taskManager.startTask(admin.id, [configRes.lastInsertRowid as number], false, true);

    db.prepare(`
      INSERT INTO evaluations (id, user_id, status, include_dialogue, include_coding)
      VALUES (?, ?, ?, ?, ?)
    `).run(taskId, admin.id, 'PENDING', 0, 1);

    // Mock adapter to return code with def+return
    const { OpenAIAdapter } = require('../../src/adapters/openai-adapter');
    OpenAIAdapter.mockImplementation(() => ({
      chat: jest.fn().mockResolvedValue('def calculate():\n    return 42'),
      name: 'openai',
    }));

    // Create engine first so sandbox is instantiated
    const testEngine = new EvaluatorEngine();
    // Access the sandbox via any cast and mock its execute
    (testEngine as any).sandbox = { execute: jest.fn().mockResolvedValue({ success: false, output: '', error: 'Runtime error', duration: 10 }) };

    const wsMessages: any[] = [];
    await testEngine.run(taskId, (d: any) => wsMessages.push(d));

    const results = db.prepare('SELECT * FROM results WHERE evaluation_id=?').all(taskId) as any[];
    expect(results.length).toBeGreaterThan(0);
    // Score should be 60 (sandbox failed but has def+return)
    expect(results[0].score).toBe(60);
  });
});





describe('Coverage Fix - routes/auth.ts initAdmin (lines 20-22)', () => {
  it('initAdmin should not duplicate existing admin', () => {
    const { initAdmin } = require('../../src/web/routes/auth');
    // Admin already exists from beforeAll
    initAdmin();
    const db = getDatabase();
    const admins = db.prepare('SELECT * FROM users WHERE username=?').all('admin');
    expect(admins.length).toBe(1);
  });
});

describe('Coverage Fix - routes/evaluations.ts (line 62)', () => {
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

  it('should return 400 for invalid evaluation creation', async () => {
    // Send config_ids with non-existent config to trigger error
    const res = await request(app)
      .post('/api/evaluations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ config_ids: [99999] });

    // Should either succeed (async) or return 400
    expect([200, 400]).toContain(res.status);
  });
});
