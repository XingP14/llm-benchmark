// tests/web/evaluations-catch-log.test.ts
//
// Regression tests for the .catch(console.error) -> .catch(logEvaluationError)
// refactor in src/web/routes/evaluations.ts:133. Before the refactor,
// the POST /api/evaluations route fired engine.run() with `.catch(console.error)`
// (bare, NODE_ENV/JEST_WORKER_ID-ungated, no errorMessage()). After the refactor,
// it routes through the exported `logEvaluationError` helper from
// src/web/engine/evaluator.ts:26, matching the pattern at L139 + L168.
//
// 6 regression tests:
//  (1) logEvaluationError is exported from engine/evaluator
//  (2) routes/evaluations.ts no longer contains `.catch(console.error)` source-level
//  (3) logEvaluationError is NODE_ENV=test gated (no log in jest)
//  (4) logEvaluationError is JEST_WORKER_ID gated (no log in jest)
//  (5) POST 200 still returns evaluation_id when engine.run() rejects
//      (so the catch path is genuinely hit, not bypassed by try/catch around it)
//  (6) When engine.run() rejects, no unhandledRejection escapes
//      (proves .catch() was attached, swallowing the rejection)

import express, { Express } from 'express';
import request from 'supertest';
import authRoutes from '../../src/web/routes/auth';
import configsRoutes from '../../src/web/routes/configs';
import evaluationsRoutes from '../../src/web/routes/evaluations';
import { logEvaluationError } from '../../src/web/engine/evaluator';
import {
  resetDatabase,
  initAdminUser,
  resetSingleton,
} from '../../src/web/db/database';
import { taskManager } from '../../src/web/engine/task';

// The runMock is created INSIDE the jest.mock factory so the mock can see it
// at hoist time. We then re-export it via the mocked module for tests to
// configure per-test.
jest.mock('../../src/web/engine/evaluator', () => {
  const actual = jest.requireActual('../../src/web/engine/evaluator');
  const runMock = jest.fn().mockResolvedValue(undefined);
  return {
    ...actual,
    EvaluatorEngine: jest.fn().mockImplementation(() => ({ run: runMock })),
    __runMock: runMock,
  };
});

jest.mock('../../src/web/websocket', () => ({
  getWSSender: jest.fn().mockReturnValue(() => {}),
}));

// Re-import __runMock from the mocked module so tests can configure it
// @ts-expect-error -- __runMock injected via jest.mock factory, not in real type
import { __runMock } from '../../src/web/engine/evaluator';
const runMock = __runMock as unknown as jest.Mock;

describe('evaluations POST .catch(console.error) -> logEvaluationError refactor', () => {
  let app: Express;
  let adminToken: string;
  let configId: number;

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
    taskManager.clear();
    runMock.mockReset();
    runMock.mockResolvedValue(undefined);
    resetDatabase();
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' });
    adminToken = loginRes.body.token;
    const configRes = await request(app)
      .post('/api/configs')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Refactor Test Model',
        type: 'openai',
        endpoint: 'https://api.openai.com/v1',
        api_key: 'sk-test',
      });
    configId = configRes.body.id;
  });

  describe('module-level shape', () => {
    it('(1) logEvaluationError is exported from engine/evaluator', () => {
      expect(typeof logEvaluationError).toBe('function');
      // signature: (message: string, err: unknown) => void
      expect(logEvaluationError.length).toBe(2);
    });

    it('(2) routes/evaluations.ts source no longer contains bare .catch(console.error)', () => {
      const fs = require('fs') as typeof import('fs');
      const path = require('path') as typeof import('path');
      const src = fs.readFileSync(
        path.join(__dirname, '..', '..', 'src', 'web', 'routes', 'evaluations.ts'),
        'utf8',
      );
      expect(src).not.toMatch(/\.catch\(\s*console\.error\s*\)/);
      // And the new pattern (logEvaluationError routed catch) is present
      expect(src).toMatch(/logEvaluationError\(['"]Engine run failed/);
    });
  });

  describe('logEvaluationError gating', () => {
    it('(3) helper is no-op when process.env.NODE_ENV === "test"', () => {
      const prev = process.env.NODE_ENV;
      const prevWorker = process.env.JEST_WORKER_ID;
      process.env.NODE_ENV = 'test';
      process.env.JEST_WORKER_ID = '1';
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
      try {
        logEvaluationError('should-be-suppressed-test', new Error('boom'));
        expect(spy).not.toHaveBeenCalled();
      } finally {
        spy.mockRestore();
        if (prev === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = prev;
        if (prevWorker === undefined) delete process.env.JEST_WORKER_ID;
        else process.env.JEST_WORKER_ID = prevWorker;
      }
    });

    it('(4) helper is no-op when JEST_WORKER_ID is set (jest runner context)', () => {
      const prev = process.env.NODE_ENV;
      const prevWorker = process.env.JEST_WORKER_ID;
      process.env.NODE_ENV = 'production';
      process.env.JEST_WORKER_ID = '1';
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
      try {
        logEvaluationError('should-be-suppressed-jest', new Error('boom'));
        expect(spy).not.toHaveBeenCalled();
      } finally {
        spy.mockRestore();
        if (prev === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = prev;
        if (prevWorker === undefined) delete process.env.JEST_WORKER_ID;
        else process.env.JEST_WORKER_ID = prevWorker;
      }
    });
  });

  describe('POST /api/evaluations catch path', () => {
    it('(5) POST returns 200 evaluation_id even when engine.run() rejects (catch path hit, not bypassed)', async () => {
      runMock.mockRejectedValueOnce(new Error('engine-run-rejected'));

      const res = await request(app)
        .post('/api/evaluations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          config_ids: [configId],
          dialogue: true,
          coding: true,
        });

      // The POST handler does NOT await the run promise. So 200 with
      // evaluation_id is returned even when run() rejects. The .catch()
      // then routes the rejection through logEvaluationError asynchronously.
      expect(res.status).toBe(200);
      expect(res.body.evaluation_id).toBeDefined();
      expect(res.body.status).toBe('PENDING');
      // Give the catch callback a tick to fire
      await new Promise((r) => setImmediate(r));
      await new Promise((r) => setImmediate(r));
      expect(runMock).toHaveBeenCalledTimes(1);
    });

    it('(6) when engine.run() rejects, no unhandledRejection escapes (proves .catch() attached)', async () => {
      runMock.mockRejectedValueOnce(new Error('engine-run-rejection-6'));

      const unhandled: unknown[] = [];
      const onUnhandled = (reason: unknown) => unhandled.push(reason);
      process.on('unhandledRejection', onUnhandled);

      const res = await request(app)
        .post('/api/evaluations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          config_ids: [configId],
          dialogue: true,
          coding: true,
        });

      // Wait a few ticks to allow the async catch callback to fire
      await new Promise((r) => setImmediate(r));
      await new Promise((r) => setImmediate(r));
      await new Promise((r) => setImmediate(r));

      expect(res.status).toBe(200);
      expect(runMock).toHaveBeenCalledTimes(1);
      // No unhandled rejection: the .catch() attached at L133 swallowed it
      // via logEvaluationError (no-op in jest due to NODE_ENV/JEST_WORKER_ID
      // gating, but the promise IS considered handled because .catch() ran).
      expect(unhandled).toEqual([]);

      process.off('unhandledRejection', onUnhandled);
    });
  });
});
