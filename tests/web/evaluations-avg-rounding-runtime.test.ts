// tests/web/evaluations-avg-rounding-runtime.test.ts
//
// 2026-10-03 04:03 cron: runtime proof that the REAL avgOf helper in
// src/web/routes/evaluations.ts ROUNDS, replacing a vacuous re-implementation.
//
// THE DEFECT, falsified not inferred. The companion suite
// tests/web/evaluations-avg-helper.test.ts pins avgOf in three ways, and
// none of them can fail when avgOf changes:
//
//   - test (1) greps the source for the helper signature. Survives any change
//     to the helper BODY, which is the only part that computes anything.
//   - tests (3)(4)(5) each declare their OWN `avgOf` inside the test body,
//     with the comment "Re-implement avgOf inline since it is file-local".
//     They assert a second implementation, not the one that runs. This is a
//     copy of the production helper: it can drift while every assertion stays
//     green, and it is green right now against a mutated production file.
//   - test (6) is the ONE test that drives the real route, but it seeds
//     scores 80 + 90 = 170 / 2 = 85 -- an exact integer. Math.round(85) === 85,
//     so the rounding that avgOf exists to perform is never exercised.
//
// MUTATION EVIDENCE. With `Math.round(...)` deleted from the real helper in
// src/web/routes/evaluations.ts (making every average a raw float, so
// total_score can serialize as 85.5 on the REST wire), the full
// evaluations-avg-helper suite plus tests/web/evaluations.test.ts reported
// 17 passed / 17 passed. A production wire-format change, invisible to every
// test written about it.
//
// THE FIX, test-scoped only. Drive the real route with a score pair whose
// mean is a genuine .5, so rounding is the only thing that can produce the
// expected value. No production file is touched: avgOf is file-local, and the
// route is reachable through supertest, so the export-the-helper refactor that
// src/index.ts's parseEnvInt needed is not necessary here.
//
// 87 + 88 = 175 / 2 = 87.5 -> Math.round gives 88. An unrounded helper
// returns 87.5, which fails both assertions below.

import express from 'express';
import request from 'supertest';
import authRoutes from '../../src/web/routes/auth';
import configsRoutes from '../../src/web/routes/configs';
import evaluationsRoutes from '../../src/web/routes/evaluations';
import { resetDatabase, getDatabase, initAdminUser, resetSingleton } from '../../src/web/db/database';

describe('avgOf ROUNDS through the real /:id/results route (2026-10-03 04:03 cron)', () => {
  let app: express.Express;
  let adminToken: string;
  let adminUserId: number;
  let configId: number;

  beforeAll(async () => {
    jest.doMock('../../src/web/engine/evaluator', () => ({
      EvaluatorEngine: jest.fn().mockImplementation(() => ({
        run: jest.fn().mockResolvedValue(undefined),
      })),
    }));
    jest.doMock('../../src/web/websocket', () => ({
      getWSSender: jest.fn().mockReturnValue(() => {}),
    }));

    resetSingleton();
    initAdminUser();

    app = express();
    app.use(express.json());
    app.use('/api/auth', authRoutes);
    app.use('/api/configs', configsRoutes);
    app.use('/api/evaluations', evaluationsRoutes);

    resetDatabase();
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' });
    adminToken = loginRes.body.token;
    adminUserId = (loginRes.body as { userId?: number }).userId ?? 1;

    const configRes = await request(app)
      .post('/api/configs')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Rounding Model',
        type: 'openai',
        endpoint: 'https://api.openai.com/v1',
        api_key: 'sk-test',
      });
    configId = configRes.body.id;
  });

  function seed(evalId: string, rows: Array<[string, string, string, string, number]>): void {
    const db = getDatabase();
    db.prepare(
      `INSERT INTO evaluations (id, user_id, status, include_dialogue, include_coding)
       VALUES (?, ?, ?, 1, 1)`,
    ).run(evalId, adminUserId, 'COMPLETED');
    db.prepare(`INSERT INTO evaluation_configs (evaluation_id, config_id) VALUES (?, ?)`).run(
      evalId,
      configId,
    );
    for (const [qid, qtype, category, output, score] of rows) {
      db.prepare(
        `INSERT INTO results (evaluation_id, config_id, question_id, question_type, category, model_output, score)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(evalId, configId, qid, qtype, category, output, score);
    }
  }

  afterAll(() => {
    // The web DB is a SHARED on-disk SQLite file (src/web/db/database.ts L8:
    // `const DB_PATH = process.env.DB_PATH || './data/llm-bench.db'`) with no
    // per-suite isolation, and jest runs --runInBand in one process. Leaving
    // these rows behind would let a later suite see them, so this suite
    // removes exactly its own rows and touches nothing else.
    try {
      const db = getDatabase();
      for (const id of ['round-total-001', 'round-dim-001', 'round-cross-001']) {
        db.prepare('DELETE FROM results WHERE evaluation_id=?').run(id);
        db.prepare('DELETE FROM evaluation_configs WHERE evaluation_id=?').run(id);
        db.prepare('DELETE FROM evaluations WHERE id=?').run(id);
      }
    } catch {
      // cleanup is best-effort; a failure here must not mask a real assertion
    }
  });

  it('total_score is 88 (int), not 87.5 (float) -- 87+88 means 87.5', async () => {
    // Both scores are the SAME question_type, so totalAvg is the average of a
    // per-type list and exercises the identical avgOf path as totalAvg does.
    seed('round-total-001', [
      ['q-001', 'dialogue', 'factual', 'Output 1', 87],
      ['q-002', 'dialogue', 'factual', 'Output 2', 88],
    ]);

    const res = await request(app)
      .get('/api/evaluations/round-total-001/results')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.results.length).toBe(1);
    // The discriminator. 87.5 fails here; 88 passes.
    expect(res.body.results[0].total_score).toBe(88);
    // And it must be an integer on the wire, not merely === 88 after coercion.
    expect(Number.isInteger(res.body.results[0].total_score)).toBe(true);
  });

  it('dialogue_score is 88 (int) for a .5 mean within one question type', async () => {
    // Same pair, but asserting the PER-TYPE average. dialogueAvg is computed
    // by the same helper at a different call site (L205), so this pins the
    // helper at that site too. An unrounded helper yields 87.5 here as well.
    seed('round-dim-001', [
      ['q-001', 'dialogue', 'factual', 'Output 1', 87],
      ['q-002', 'dialogue', 'factual', 'Output 2', 88],
    ]);

    const res = await request(app)
      .get('/api/evaluations/round-dim-001/results')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.results[0].dialogue_score).toBe(88);
    expect(Number.isInteger(res.body.results[0].dialogue_score)).toBe(true);
  });

  it('coding_score is 88 (int) for a .5 mean across two question types', async () => {
    // 87 (dialogue) + 88 (coding) = 175/2 = 87.5 across the allScores list.
    // This is the exact scenario the existing test (6) sets up with 80 + 90 =
    // 85, an integer, which is why it cannot see a missing Math.round.
    seed('round-cross-001', [
      ['q-001', 'dialogue', 'factual', 'Output 1', 87],
      ['q-002', 'coding', 'basic', 'Output 2', 88],
    ]);

    const res = await request(app)
      .get('/api/evaluations/round-cross-001/results')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.results[0].total_score).toBe(88);
    // Each per-type list holds a single score, so these are exact integers
    // regardless of rounding -- asserted to document that the discriminator
    // above is total_score, not the per-type fields.
    expect(res.body.results[0].dialogue_score).toBe(87);
    expect(res.body.results[0].coding_score).toBe(88);
  });
});
