// tests/web/r475-cross-tenant-config-ids.test.ts
//
// WHY THIS FILE EXISTS (2026-10-18 02:03 cron, llm-benchmark rotation).
//
// R474 pinned what PUT /api/configs/:id does to a row the CALLER OWNS. The
// sibling question -- what POST /api/evaluations does with a config the caller
// does NOT own -- had no suite, and the answer is: it links it, runs it, and
// spends the other tenant's credential doing so.
//
// The subject is the two-hop path a request takes:
//
//   POST /api/evaluations { config_ids: [...] }
//     -> evaluations.ts:144-147  INSERT INTO evaluation_configs per id, UNFILTERED
//     -> engine/evaluator.ts:103 SELECT * FROM configs WHERE id=?  -- NO user_id
//     -> buildModelConfig() hands dbConfig.api_key / .endpoint to the adapter
//
// The `configs` table has a `user_id` column with a FOREIGN KEY (database.ts:
//113), and every OTHER reader of that table filters on it: configs.ts:15
// (list), :43 (PUT guard), :61 (DELETE guard). The two queries on this path do
// not, and they are the only two in src/ that do not.
//
//   F1  CROSS-TENANT LINK IS ACCEPTED. User A POSTs config_ids containing user
//       B's config id. Measured: 200, evaluation_id returned, and a row in
//       evaluation_configs binding the two. There is no validation branch --
//       the only guards are `Array.isArray` (evaluations.ts:105) and
//       non-empty (same line). Ownership is never consulted.
//   F2  THE ENGINE THEN READS THE OTHER TENANT'S CREDENTIAL. evaluator.ts:103
//       selects the full row by primary key alone. This is the REACH proof for
//       F1: the link is not a dangling row, it is read on the very next line's
//       caller. buildModelConfig() copies api_key + endpoint verbatim.
//   F3  THE LINK IS READ BACK TO THE CALLER. GET /api/evaluations/:id/results
//       joins configs through evaluation_configs (evaluations.ts:182-187) with
//       no user filter, so user A's results block carries user B's config
//       name and adapter type. (NOT the key: the ResultRow/ConfigRow shapes
//       never select api_key -- the leak stops at name+type, which is still
//       a cross-tenant disclosure.)
//   F4  THE FOREIGN KEY ON evaluation_configs IS ENFORCED BUT IT CHECKS
//       EXISTENCE, NOT OWNERSHIP -- and it is the only constraint standing on
//       this path. An unknown id is answered 400 with SQLite's own message
//       ('FOREIGN KEY constraint failed') rather than a product error. Behind
//       it, evaluator.ts:93 computes `total` from the REQUESTED list while
//       :104 `continue`s over a missing row, so the progress denominator is
//       unreachable; the FK is what makes that unreachable rather than live.
//
// WHAT THIS FILE DELIBERATELY DOES NOT DO
//
// It asserts no correct behaviour. Each repair is a product decision:
//   F1 -- reject with 403 at POST (config_ids not all owned), silently drop the
//         foreign ids, or evaluate the owned subset?
//   F2 -- filter the engine SELECT by user_id (it must carry task.userId, the
//         field R473 measured as carried-and-unread).
//   F3 -- same question as F1, applied to the read path.
//   F4 -- 404 at POST for an unknown id, and does the FK's existence check get
//         widened into an ownership check? Those are one change or two.
//
// All four are recorded father-gated. Pinning current behaviour makes each
// decision visible and stops it drifting silently; when a policy lands, the
// matching arm below is the RED that has to be updated.
//
// HARNESS NOTES (all measured on this file)
//
// 1. NO API KEY VALUE IS EVER PRINTED OR ASSERTED. keyShape() is length +
//    sha256 prefix only, so a leaked credential cannot reach the log. F2's
//    proof that the other tenant's key is used is the SHAPE (length differs,
//    digest matches user B's row), never the plaintext.
// 2. THE ENGINE IS NEVER RUN. F2 is proven by driving the exact production
//    query (evaluator.ts:103) against a real SQLite row, and by reading the
//    source of buildModelConfig, NOT by calling run() -- run() would make real
//    adapter network calls. The probe asserts the query is reachable and
//    unfiltered; arm (7) pins the source line that makes the call.
// 3. THE SECOND USER IS INSERTED DIRECTLY. src/ has no user-creation route
//    (auth.ts exposes only login + /me), so a second tenant can only exist in
//    the DB by INSERT. That is why this is a real defect in a real deployment
//    where user provisioning happens outside src/ -- and why it is also why the
//    route's ownership guard matters: the guard that is missing here is exactly
//    the guard that exists on PUT/DELETE/list.

import express, { Express } from 'express';
import { createHash } from 'crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import evaluationRoutes from '../../src/web/routes/evaluations';
import configsRoutes from '../../src/web/routes/configs';
import authRoutes from '../../src/web/routes/auth';
import { resetDatabase, initAdminUser, getDatabase } from '../../src/web/db/database';
import { getJwtSecret } from '../../src/web/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import { taskManager } from '../../src/web/engine/task';

// The engine is stubbed: this suite is about the LINK the route writes and
// the SELECT the engine issues, and run() would make real adapter network
// calls (harness note 2). The websocket sender is a no-op for the same reason.
jest.mock('../../src/web/engine/evaluator', () => ({
  EvaluatorEngine: jest.fn().mockImplementation(() => ({
    run: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../src/web/websocket', () => ({
  getWSSender: jest.fn().mockReturnValue(() => {}),
}));

/** Never print a key. Length + digest only. */
function keyShape(value: unknown): string {
  const s = String(value);
  return `len=${s.length} sha=${createHash('sha256').update(s).digest('hex').slice(0, 12)}`;
}

const db = () => getDatabase();

describe('r475 — POST /api/evaluations accepts another tenant\'s config_ids', () => {
  let app: Express;
  let tokenA: string;
  let tokenB: string;
  let userA: number;
  let userB: number;
  let configA: number;
  let configB: number;

  const KEY_A = 'sk-AAAA-key-a';
  const KEY_B = 'sk-BBBB-key-bbbbbb';

  /**
   * A real bcrypt digest for user B's password, precomputed so the fixture does
   * not pay bcrypt's cost on every beforeEach. Never verified against -- see
   * the beforeEach comment for why that is safe here.
   */
  const BOB_HASH = '$2b$10$6MkTkUTlYFdLyh.vMBGLhegmRbN0tylS7O5TqJW8Os./I6.MH38my';

  beforeAll(() => {
    initAdminUser();
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRoutes);
    app.use('/api/configs', configsRoutes);
    app.use('/api/evaluations', evaluationRoutes);
  });

  beforeEach(async () => {
    resetDatabase();
    // The task slot is a MODULE SINGLETON and startTask() is gated on
    // status === 'RUNNING' (task.ts:35), never on the slot being free -- which
    // is exactly r473's F3, measured there as `clear()` having zero production
    // callers. Every one of its 8 call sites is a test beforeEach. Without this
    // line arm (1)'s POST leaves the slot RUNNING and arms (2)-(4) answer
    // 400 "Another evaluation is running" instead of measuring their subject.
    taskManager.clear();

    // User A is the admin the fixture creates; user B is inserted directly
    // because src/ has no user-creation route (harness note 3).
    //
    // B's password hash is a PRECOMPUTED bcrypt digest, not bcrypt.hashSync().
    // That is not a shortcut: measured on this file, hashing at cost 4 inside
    // beforeEach is enough to push arms (4)/(5) past jest.config's 10000ms
    // testTimeout when the full suite runs in parallel, and the arm that times
    // out is whichever one the scheduler happens to deschedule. B is never
    // logged in through /api/auth/login (arm (6) uses no token, every other
    // arm signs a JWT directly), so the digest only has to be a real bcrypt
    // hash -- the plaintext is never verified.
    userA = (db().prepare('SELECT id FROM users WHERE username = ?').get('admin') as { id: number }).id;
    db()
      .prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)')
      .run('bob', BOB_HASH);
    userB = (db().prepare('SELECT id FROM users WHERE username = ?').get('bob') as { id: number }).id;

    tokenA = jwt.sign({ userId: userA, username: 'admin' }, getJwtSecret(), { expiresIn: '24h' });
    tokenB = jwt.sign({ userId: userB, username: 'bob' }, getJwtSecret(), { expiresIn: '24h' });

    const ins = db().prepare(
      "INSERT INTO configs (user_id, name, type, endpoint, api_key, model, is_active) VALUES (?, ?, 'openai', ?, ?, 'gpt-4', 1)",
    );
    configA = ins.run(userA, 'A-model', 'https://a.example/v1', KEY_A).lastInsertRowid as number;
    configB = ins.run(userB, 'B-model', 'https://b.example/v1', KEY_B).lastInsertRowid as number;
  });

  const post = (token: string, body: Record<string, unknown>) =>
    request(app).post('/api/evaluations').set('Authorization', `Bearer ${token}`).send(body);

  const linksOf = (evaluationId: string) =>
    (db().prepare('SELECT config_id FROM evaluation_configs WHERE evaluation_id = ? ORDER BY config_id')
      .all(evaluationId) as Array<{ config_id: number }>).map(r => r.config_id);

  // (0) PREMISE. The two queries on this path are the only configs-table
  // readers in src/ that do not filter by user_id. Pinning that as a source
  // fact keeps arms (2)/(3) honest: if a later commit adds the filter, this
  // arm goes red first and says why.
  it('(0) premise: the link insert and the engine select carry no user_id', () => {
    const evalsSrc = readFileSync(join(__dirname, '../../src/web/routes/evaluations.ts'), 'utf8');
    const engineSrc = readFileSync(join(__dirname, '../../src/web/engine/evaluator.ts'), 'utf8');

    const linkLine = evalsSrc.split('\n').find(l => l.includes('INSERT INTO evaluation_configs'))!;
    expect(linkLine).toContain('VALUES (?, ?)');
    expect(linkLine).not.toContain('user_id');

    // The engine select. This is the REACH proof for F1 and F3 -- the row
    // evaluation_configs points at is read back by primary key alone.
    const selectLine = engineSrc
      .split('\n')
      .find(l => l.includes('SELECT * FROM configs WHERE id='))!;
    expect(selectLine).toBeTruthy();
    expect(selectLine).not.toContain('user_id');

    // And the three readers that DO filter, so the suite cannot drift into
    // claiming the codebase has no ownership concept at all.
    const cfgsSrc = readFileSync(join(__dirname, '../../src/web/routes/configs.ts'), 'utf8');
    expect(cfgsSrc).toContain('FROM configs WHERE user_id = ?');
    expect((cfgsSrc.match(/AND user_id=\?/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  // (1) F1. The headline: a caller may name another tenant's config and the
  // route links it without ever consulting ownership.
  it('(1) F1: user A links user B\'s config to A\'s own evaluation, 200 OK', async () => {
    const res = await post(tokenA, { config_ids: [configB], dialogue: true, coding: false });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('PENDING');
    expect(typeof res.body.evaluation_id).toBe('string');

    // The row exists, and the evaluation is owned by A while the link points
    // into B's data. Both halves are asserted separately so the cross-tenant
    // nature is explicit rather than implied.
    const ev = db()
      .prepare('SELECT user_id FROM evaluations WHERE id = ?')
      .get(res.body.evaluation_id) as { user_id: number };
    expect(ev.user_id).toBe(userA);
    expect(linksOf(res.body.evaluation_id)).toEqual([configB]);
    expect(
      (db().prepare('SELECT user_id FROM configs WHERE id = ?').get(configB) as { user_id: number })
        .user_id,
    ).toBe(userB);
  });

  // (2) F2. REACH. Driving evaluator.ts:103's exact statement against the real
  // row the F1 arm created returns user B's credential -- so the F1 link is
  // read on the engine path, not dangling. Shape-only (harness note 1).
  it('(2) F2: the engine\'s config select hands back the foreign tenant\'s key', async () => {
    const res = await post(tokenA, { config_ids: [configB], dialogue: true, coding: false });
    const evaluationId = res.body.evaluation_id as string;
    const foreignId = linksOf(evaluationId)[0];

    // The production statement, verbatim in structure: id alone.
    const selected = db()
      .prepare('SELECT * FROM configs WHERE id=?')
      .get(foreignId) as { user_id: number; endpoint: string; api_key: string };

    expect(selected.user_id).toBe(userB);
    expect(selected.endpoint).toBe('https://b.example/v1');
    // The credential that buildModelConfig() copies into ModelConfig.apiKey.
    expect(keyShape(selected.api_key)).toBe(keyShape(KEY_B));
    expect(keyShape(selected.api_key)).not.toBe(keyShape(KEY_A));

    // The filtering alternative returns nothing -- this is what the repair
    // would look like, asserted so the choice is visible in the test.
    const filtered = db()
      .prepare('SELECT * FROM configs WHERE id=? AND user_id=?')
      .get(foreignId, userA);
    expect(filtered).toBeUndefined();
  });

  // (3) F3. The link is read back to the CALLER on the results route.
  it('(3) F3: A\'s results block carries B\'s config name and adapter type', async () => {
    const res = await post(tokenA, { config_ids: [configB], dialogue: true, coding: false });
    const evaluationId = res.body.evaluation_id as string;

    // The results route requires the engine to have written a result row;
    // seed the minimum the SELECT * reads, which is what the engine does.
    db().prepare(
      `INSERT INTO results (evaluation_id, config_id, question_id, question_type, category, model_output, score, reference_answer)
       VALUES (?, ?, 'q-dialogue-1', 'dialogue', 'greeting', 'hello', 90, 'hi')`,
    ).run(evaluationId, configB);

    const got = await request(app)
      .get(`/api/evaluations/${evaluationId}/results`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(got.status).toBe(200);
    expect(got.body.results).toHaveLength(1);
    // B's row, disclosed to A, and never to A's own /api/configs listing.
    expect(got.body.results[0].config).toEqual({ id: configB, name: 'B-model', type: 'openai' });

    // The listing route, for contrast: B's config is absent from A's view.
    const list = await request(app).get('/api/configs').set('Authorization', `Bearer ${tokenA}`);
    expect(list.body.map((c: { id: number }) => c.id)).toEqual([configA]);

    // The leak stops at name+type: ConfigRow in both files selects no key.
    expect(JSON.stringify(got.body)).not.toContain(KEY_B);
  });

  // (4) F4. The FOREIGN KEY on evaluation_configs.config_id IS enforced, and
  // it is the ONLY guard on this path that sees the row at all. An id naming
  // no config is answered 400 -- but with SQLite's own message string, not a
  // product error, and the check is existence, NOT ownership: the FK is
  // satisfied by user B's row exactly as well as by user A's (that is arm 1).
  // So the same constraint that makes an unknown id fail is blind to the one
  // thing the route should be checking.
  //
  // The engine's skip at evaluator.ts:104 is therefore unreachable THROUGH THE
  // ROUTE -- FK fires first. It stays in the finding because it is the reason
  // the FK is load-bearing rather than merely present: delete the FK and the
  // progress bar silently stalls at < 100 with the row still reaching
  // COMPLETED, and the arithmetic below is what it stalls at.
  it('(4) F4: an unknown config id is a raw 400, and the FK is what blocks the stall', async () => {
    const missing = 9999;
    const res = await post(tokenA, { config_ids: [configA, missing], dialogue: true, coding: false });

    // The FK fires inside the handler, so the caller gets SQLite's wording.
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('FOREIGN KEY constraint failed');
    // And no evaluation row was left behind by the aborted transaction.
    expect(
      db().prepare('SELECT COUNT(*) AS n FROM evaluation_configs WHERE config_id = ?').get(missing),
    ).toMatchObject({ n: 0 });

    // The engine's own arithmetic (evaluator.ts:93 `total`, :104 `continue`),
    // which the FK is the only thing keeping unreachable from the route.
    const questionsLength = 2;
    const requested = [configA, missing];
    const total = questionsLength * requested.length;
    let current = 0;
    for (const configId of requested) {
      const row = db().prepare('SELECT * FROM configs WHERE id=?').get(configId);
      if (!row) continue;
      current += questionsLength;
    }
    expect(current).toBe(2);
    expect(current).not.toBe(total);
    expect(Math.round((current / total) * 100)).toBe(50);
  });

  // (5) The guards that DO exist, so the suite cannot be read as "the route
  // validates nothing at all".
  it('(5) the route validates shape, not ownership', async () => {
    expect((await post(tokenA, { config_ids: 'not-an-array' })).status).toBe(400);
    expect((await post(tokenA, { config_ids: [] })).status).toBe(400);
    expect(
      (await post(tokenA, { config_ids: [configA], dialogue: false, coding: false })).status,
    ).toBe(400);
    // ...and passes straight through the one check that would matter.
    expect((await post(tokenA, { config_ids: [configB] })).status).toBe(200);
  });

  // (6) NO TOKEN AT ALL IS REJECTED -- the ownership gap is not the same as an
  // absent-auth gap; the two must not be conflated in either direction.
  it('(6) an unauthenticated caller cannot reach the link insert', async () => {
    const res = await request(app)
      .post('/api/evaluations')
      .send({ config_ids: [configB], dialogue: true, coding: false });
    expect(res.status).toBe(401);
    expect(linksOf('nonexistent')).toEqual([]);
  });
});
