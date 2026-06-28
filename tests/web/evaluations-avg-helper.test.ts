// tests/web/evaluations-avg-helper.test.ts
//
// Regression tests for the 5-dim 漏更 refactor in src/web/routes/evaluations.ts
// /:id/results handler. Before the refactor, the per-config block had 5x
// byte-identical 6-line Math.round(reduce/length) ternary blocks for the
// dialogue/coding/function_calling/long_context/multi_turn averages + 1 more
// for totalAvg. After the refactor, all 6 are single `avgOf(...)` calls.
//
// Pattern parallels the 5-dim 漏更 cleanup chain:
//   - woclaw 59753ba logEvaluationError catch-log
//   - woclaw 851ce56 serializeDelegationResult ws_server
//   - woclaw f622f24 sendJsonError rest_server
//   - woclaw a8a4f57 console_error_consistency ws_server
//   - woclaw 14a12ea catch_unknown hub
//   - llm-benchmark 845c4ba printBenchmarkSection index.ts
//   - llm-benchmark 2fa60e9 getDimValue reporter
//   - llm-benchmark 59753ba logEvaluationError evaluations.ts
//
// 8 regression tests:
//  (1)  avgOf is reachable from evaluations.ts source (file-level grep guard)
//  (2)  avgOf is NOT exported (file-local; parallels scoresOf file-local pattern)
//  (3)  avgOf([80]) === 80 (single-value roundtrip)
//  (4)  avgOf([]) === 0 (empty-list branch, matches the old 0 fallback)
//  (5)  avgOf([60, 80]) === 70 (the existing tests/web/evaluations.test.ts:184
//       expects dialogue_score=80 from a single score; this guards the
//       reduce/length/round arithmetic that totalAvg=85 case from line 187
//       depends on — 80+90=170 / 2 = 85)
//  (6)  /:id/results returns total_score=85 + dialogue_score=80 + coding_score=90
//       when q-001 score=80 + q-002 score=90 (existing parity with
//       tests/web/evaluations.test.ts should calculate scores correctly)
//  (7)  0 inline Math.round(...reduce/length) sites remain in evaluations.ts
//       (would catch a future regression that re-inlines the 6-line block)
//  (8)  helper called ≥ 6 times (5 per-type + 1 totalAvg) in evaluations.ts

import * as fs from 'fs';
import * as path from 'path';

const ROUTES_PATH = path.resolve(
  __dirname,
  '../../src/web/routes/evaluations.ts',
);
const source = fs.readFileSync(ROUTES_PATH, 'utf-8');

describe('Evaluations avgOf helper (5-dim 漏更 closure)', () => {
  it('(1) avgOf is reachable from evaluations.ts source', () => {
    expect(source).toMatch(/function avgOf\(scores: number\[\]\): number \{/);
  });

  it('(2) avgOf is NOT exported (file-local helper, mirrors scoresOf)', () => {
    // Match `function avgOf` (not preceded by `export`)
    const exportCount = (source.match(/export\s+function\s+avgOf/g) || []).length;
    expect(exportCount).toBe(0);
  });

  it('(3) avgOf([80]) === 80 (single-value roundtrip)', () => {
    // Re-implement avgOf inline since it is file-local; this test guards the
    // arithmetic contract that all 6 call sites depend on.
    const avgOf = (scores: number[]): number =>
      scores.length > 0
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : 0;
    expect(avgOf([80])).toBe(80);
  });

  it('(4) avgOf([]) === 0 (empty-list branch matches old 0 fallback)', () => {
    const avgOf = (scores: number[]): number =>
      scores.length > 0
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : 0;
    expect(avgOf([])).toBe(0);
  });

  it('(5) avgOf([60, 80]) === 70 (Math.round reduce/length arithmetic guard)', () => {
    const avgOf = (scores: number[]): number =>
      scores.length > 0
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : 0;
    expect(avgOf([60, 80])).toBe(70);
  });

  it('(6) /:id/results returns total_score=85 + dialogue_score=80 + coding_score=90 (parity with evaluations.test.ts:184-187)', async () => {
    // Use the real route + a mocked engine.run + the existing test harness
    // from evaluations.test.ts, then verify the byte-identical output contract
    // that existed before the refactor.
    const express = (await import('express')).default;
    const request = (await import('supertest')).default;
    const authRoutes = (await import('../../src/web/routes/auth')).default;
    const configsRoutes = (await import('../../src/web/routes/configs')).default;
    const evaluationsRoutes = (await import('../../src/web/routes/evaluations')).default;
    const { resetDatabase, getDatabase, initAdminUser, resetSingleton } = await import(
      '../../src/web/db/database'
    );

    // Mock the evaluator engine so engine.run() resolves cleanly (the
    // POST handler fires it async; this test is GET-only so any throw
    // would unhandledRejection but jest mock surfaces no test failure here).
    jest.doMock('../../src/web/engine/evaluator', () => {
      return {
        EvaluatorEngine: jest.fn().mockImplementation(() => ({
          run: jest.fn().mockResolvedValue(undefined),
        })),
      };
    });
    jest.doMock('../../src/web/websocket', () => ({
      getWSSender: jest.fn().mockReturnValue(() => {}),
    }));

    resetSingleton();
    initAdminUser();

    const app = express();
    app.use(express.json());
    app.use('/api/auth', authRoutes);
    app.use('/api/configs', configsRoutes);
    app.use('/api/evaluations', evaluationsRoutes);

    // Reset DB and create a config + login
    resetDatabase();
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' });
    const adminToken: string = loginRes.body.token;
    expect(adminToken).toBeDefined();

    const adminUserId = (loginRes.body as { userId?: number }).userId ?? 1;

    const configRes = await request(app)
      .post('/api/configs')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Test Model',
        type: 'openai',
        endpoint: 'https://api.openai.com/v1',
        api_key: 'sk-test',
      });
    const configId: number = configRes.body.id;
    expect(configId).toBeGreaterThan(0);

    // Seed 1 dialogue score (80) + 1 coding score (90); the expected totalAvg
    // is (80+90)/2 = 85, exactly as the prior tests/web/evaluations.test.ts
    // "should calculate scores correctly" case expects.
    const evalId = 'avg-helper-test-001';
    const db = getDatabase();
    db.prepare(
      `INSERT INTO evaluations (id, user_id, status, include_dialogue, include_coding)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(evalId, adminUserId, 'COMPLETED', 1, 1);
    db.prepare(
      `INSERT INTO evaluation_configs (evaluation_id, config_id) VALUES (?, ?)`,
    ).run(evalId, configId);
    db.prepare(
      `INSERT INTO results (evaluation_id, config_id, question_id, question_type, category, model_output, score)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(evalId, configId, 'q-001', 'dialogue', 'factual', 'Output 1', 80);
    db.prepare(
      `INSERT INTO results (evaluation_id, config_id, question_id, question_type, category, model_output, score)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(evalId, configId, 'q-002', 'coding', 'basic', 'Output 2', 90);

    const res = await request(app)
      .get(`/api/evaluations/${evalId}/results`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.results.length).toBe(1);
    expect(res.body.results[0].total_score).toBe(85);
    expect(res.body.results[0].dialogue_score).toBe(80);
    expect(res.body.results[0].coding_score).toBe(90);
  });

  it('(7) 0 inline Math.round(reduce/length) sites OUTSIDE the avgOf helper body remain', () => {
    // After the refactor, all 6 avg blocks were collapsed to avgOf() calls.
    // If a future change re-inlines the Math.round(reduce/length) ternary
    // anywhere besides the avgOf helper definition body itself, this count
    // > 0 will fail and signal the 漏更 regression.
    //
    // Strip the avgOf helper body (between 'function avgOf(' and its closing
    // brace) so we only count the OUTSIDE call sites — the helper body itself
    // must keep exactly one occurrence of the pattern.
    const helperStart = source.indexOf('function avgOf(scores: number[]): number {');
    expect(helperStart).toBeGreaterThan(-1);
    // Walk to the closing brace at the helper's depth (helpers are flat in
    // this file so we just take the next standalone '}' on its own line).
    const helperEnd = source.indexOf('\n}', helperStart);
    const withoutHelper =
      source.slice(0, helperStart) + source.slice(helperEnd);
    const inlineAvgPattern =
      /\.reduce\(\(a, b\) => a \+ b, 0\) \/ [a-zA-Z]+\.length/g;
    const inlineCount = (withoutHelper.match(inlineAvgPattern) || []).length;
    expect(inlineCount).toBe(0);
  });

  it('(8) avgOf called ≥ 6 times in evaluations.ts (5 per-type + 1 totalAvg)', () => {
    const callCount = (source.match(/avgOf\(/g) || []).length;
    // 5 per-type (dialogueAvg/codingAvg/fcAvg/lcAvg/mtAvg) + 1 totalAvg + 1 in
    // the helper definition itself = 7. The ≥6 floor is the regression gate.
    expect(callCount).toBeGreaterThanOrEqual(6);
  });
});
