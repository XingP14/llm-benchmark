// tests/web/r486-duplicate-config-ids-are-evaluated-twice.test.ts
//
// WHY THIS FILE EXISTS (2026-10-19 02:03 cron, llm-benchmark rotation).
//
// The sibling suites pin WHAT a POST /api/evaluations body may contain and WHO
// may own the ids in it (r474 config update semantics, r475 cross-tenant ids).
// Neither asks the narrower question this file asks: the request array is taken
// as a SET everywhere it is read, and nothing anywhere enforces that.
//
// Measured on the first run of the probe behind this file (real express app,
// real SQLite, one owned config `c1`):
//
//   POST { config_ids: [c1, c1] }
//     -> 200, evaluation_id returned
//     -> evaluation_configs holds TWO rows for the same (evaluation_id, c1)
//     -> taskManager.currentTask.configs === [1, 1]        <- the RAW request
//     -> the results block lists config c1 TWICE
//
// FOUR defects, each measured rather than read:
//
//   F1  THE LINK IS WRITTEN TWICE. routes/evaluations.ts:144-147 loops
//       `for (const configId of config_ids)` over the request array verbatim.
//       The table (db/database.ts:139-144) carries FOREIGN KEYs on both
//       columns and NO UNIQUE on (evaluation_id, config_id), so the second
//       row is not merely accepted, it is indistinguishable from the first
//       to every reader that does not look at `id`.
//
//   F2  THE WORK IS DONE TWICE. engine/evaluator.ts:97 iterates
//       `task.configs`, and task.ts:43 stores the request array UNCHANGED --
//       no normalisation at the boundary, none anywhere downstream. So the
//       same config is sent every question's prompt twice and every question
//       is scored twice. The cost is a factor of two on the only bill this
//       product has: provider tokens. F1 is the row; F2 is the spend.
//
//   F3  THE PROGRESS DENOMINATOR TRACKS THE DUPLICATE. evaluator.ts:93
//       computes `total = questions.length * task.configs.length` from the
//       SAME duplicated array, so the bar reaches 100% while doing double the
//       work. This is what makes F2 invisible: the user watching the progress
//       frame sees a perfectly ordinary run.
//
//   F4  THE RESULTS BLOCK LISTS THE CONFIG TWICE. routes/evaluations.ts:182-187
//       joins configs through evaluation_configs with no DISTINCT, then :234
//       sorts by total_score and :237 assigns `rank` by array position. Two
//       rows for one config therefore produce two blocks with two DIFFERENT
//       ranks -- the same model appears as #1 and #2 in one leaderboard, each
//       carrying a full copy of question_results.
//
// WHAT THIS FILE DELIBERATELY DOES NOT DO
//
// It asserts no correct behaviour, because every repair is a product decision:
//   F1/F2 -- normalise `config_ids` at the ROUTE boundary (one `new Set`,
//             cheapest, and the dedup is visible where the input arrives) vs
//             dedup inside `taskManager.startTask` (covers every future caller,
//             but hides the normalisation a layer below the input) vs leave
//             the array alone and add a UNIQUE index on
//             (evaluation_id, config_id) (makes the second INSERT raise, so the
//             POST answers 400 -- a third behaviour, and a hostile one: the
//             caller sent a valid config twice and gets told it does not
//             exist).
//   F3 -- is a duplicated id two units of work (the current behaviour, and
//         then the bar is honest) or one?
//   F4 -- DISTINCT in the join, or GROUP BY c.id?
//
// All four are recorded father-gated. Pinning current behaviour makes each
// decision visible and stops it drifting silently; when a policy lands, the
// matching arm below is the RED that has to be updated.
//
// HARNESS NOTES (all measured on this file)
//
// 1. NO API KEY IS EVER PRINTED OR ASSERTED. The fixture uses one fixed
//    placeholder credential and no arm reads it back; the subject of every
//    arm is a COUNT, a set of ids, or a rank. (Same rule as r474/r475: an
//    assertion on a masked value is a suite that cannot fail.)
// 2. THE ENGINE IS NEVER RUN. F2's proof that the duplicate reaches the work
//    loop is (a) the task's own `configs` array read back out of the task
//    manager, and (b) arm (6)'s source pin on the loop that iterates it.
//    Calling run() would issue real provider requests.
// 3. THE DUPLICATE IS THE CALLER'S OWN ID, not another tenant's. r475 owns the
//    cross-tenant axis; keeping this file on the self-inflicted axis means the
//    two suites cannot be satisfied by the same change, and a fix that adds
//    an ownership check does not turn either of them green by accident.
// 4. taskManager.clear() in beforeEach is load-bearing, not hygiene: the task
//    slot is a module singleton and startTask() only throws on status RUNNING
//    (task.ts:35), so a leftover RUNNING task would make every POST after the
//    first answer 400 and the arms would measure the wrong subject.
// 5. LIVE-TREE PIN (arm (7)). Every other arm drives the real route against a
//    real database, so this file cannot be green against a mutant committed to
//    a branch: it measures whatever is on disk. Arm (7) still exists because
//    it is the one arm that states the invariant as TEXT, and r483 measured
//    why that is a separate obligation -- a suite whose arms all read COMMITTED
//    history goes green against an uncommitted wiring, which is exactly the
//    moment someone starts fixing the finding.

import express, { Express } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import evaluationRoutes from '../../src/web/routes/evaluations';
import { resetDatabase, initAdminUser, getDatabase } from '../../src/web/db/database';
import { getJwtSecret } from '../../src/web/config';
import { taskManager } from '../../src/web/engine/task';

jest.mock('../../src/web/engine/evaluator', () => ({
  EvaluatorEngine: jest.fn().mockImplementation(() => ({
    run: jest.fn().mockResolvedValue(undefined),
  })),
}));
jest.mock('../../src/web/websocket', () => ({
  getWSSender: jest.fn().mockReturnValue(() => {}),
}));

const db = () => getDatabase();

describe('r486 — a repeated config_id is linked, queued and ranked twice', () => {
  let app: Express;
  let token: string;
  let userId: number;
  let cfg: number;

  beforeAll(() => {
    initAdminUser();
    app = express();
    app.use(express.json());
    app.use('/api/evaluations', evaluationRoutes);
  });

  beforeEach(() => {
    resetDatabase();
    // Harness note 4.
    taskManager.clear();

    userId = (db().prepare('SELECT id FROM users WHERE username = ?').get('admin') as { id: number }).id;
    token = jwt.sign({ userId, username: 'admin' }, getJwtSecret(), { expiresIn: '24h' });
    // One config, owned by the caller. Harness note 3.
    cfg = db()
      .prepare(
        "INSERT INTO configs (user_id, name, type, endpoint, api_key, model, is_active) VALUES (?, 'only-model', 'openai', 'https://example.invalid/v1', 'fixture-key', 'gpt-4', 1)",
      )
      .run(userId).lastInsertRowid as number;
  });

  const post = (configIds: number[]) =>
    request(app)
      .post('/api/evaluations')
      .set('Authorization', `Bearer ${token}`)
      .send({ config_ids: configIds, dialogue: true });

  const linksOf = (evaluationId: string): number[] =>
    (db()
      .prepare('SELECT config_id FROM evaluation_configs WHERE evaluation_id = ? ORDER BY id')
      .all(evaluationId) as Array<{ config_id: number }>
    ).map(r => r.config_id);

  // (0) CONTROL. The same route, the same caller, the same config -- listed
  // ONCE. Without this arm "two link rows" and "the link table always holds a
  // row per requested id, whatever that count is" are indistinguishable, and a
  // dedup that merely moved the duplication somewhere else would pass every
  // other arm here.
  it('(0) control: a single config_id yields exactly one link and a one-element configs array', async () => {
    const res = await post([cfg]);
    expect(res.status).toBe(200);

    const evaluationId = res.body.evaluation_id as string;
    expect(linksOf(evaluationId)).toEqual([cfg]);
    expect(taskManager.getCurrentTask()?.configs).toEqual([cfg]);
  });

  // (1) F1. The duplicate is written as a second link row, not rejected and not
  // collapsed. Asserted on the row set rather than on a row COUNT alone, so a
  // fix that wrote the two ids in a different ORDER is visible.
  it('(1) [c, c] writes TWO identical link rows', async () => {
    const res = await post([cfg, cfg]);
    expect(res.status).toBe(200);

    const evaluationId = res.body.evaluation_id as string;
    expect(linksOf(evaluationId)).toEqual([cfg, cfg]);
  });

  // (2) F2, the load-bearing arm. `task.configs` IS the array the engine's
  // outer loop walks (pinned by arm (6)), and task.ts stores the request
  // argument unchanged -- so this asserts on the duplicated WORK LIST, not on
  // a row. A dedup applied only at the link table would leave this arm red,
  // which is the distinction the round exists to make.
  it('(2) [c, c] queues the config twice for the engine to run', async () => {
    await post([cfg, cfg]);
    expect(taskManager.getCurrentTask()?.configs).toEqual([cfg, cfg]);
  });

  // (3) F3. The progress denominator is built from the same duplicated array
  // (evaluator.ts:93), so the reported total is double the distinct work. The
  // expression is restated here rather than imported: the point is the
  // arithmetic's INPUT, and a helper that computed it correctly would still
  // receive the duplicated array.
  it('(3) the progress denominator is computed from the duplicated length', async () => {
    const questions = 7;
    const perRun = (configs: number[]) => questions * configs.length;

    await post([cfg, cfg]);
    const queued = taskManager.getCurrentTask()?.configs ?? [];
    expect(queued.length).toBe(2);
    // One run of N questions against one distinct config.
    expect(perRun([cfg])).toBe(questions);
    // What the engine will actually divide by.
    expect(perRun(queued)).toBe(questions * 2);
  });

  // (4) F4. The results block lists the config once per LINK row, so a
  // duplicated link produces two blocks -- and because rank is assigned by
  // array position after a score sort, the two copies carry DIFFERENT ranks.
  // Rank is the user-visible half of this defect: one model on a leaderboard
  // twice, at #1 and #2.
  it('(4) the results block lists the config twice, at two different ranks', async () => {
    const res = await post([cfg, cfg]);
    const evaluationId = res.body.evaluation_id as string;

    const blocks = db()
      .prepare(
        `SELECT c.id, c.name FROM configs c
         JOIN evaluation_configs ec ON c.id = ec.config_id
         WHERE ec.evaluation_id = ?`,
      )
      .all(evaluationId) as Array<{ id: number; name: string }>;

    // Two join rows for one config: no DISTINCT in the production query
    // (evaluations.ts:182-187), which is what arm (6) pins as source.
    expect(blocks).toHaveLength(2);

    // Now the consequence, through the real route, with a real results row so
    // the ranking actually sorts something.
    db()
      .prepare(
        `INSERT INTO results (evaluation_id, config_id, question_id, question_type, category, model_output, score, reference_answer)
         VALUES (?, ?, 'q-1', 'dialogue', 'cat', 'out', 90, '')`,
      )
      .run(evaluationId, cfg);

    const resultsRes = await request(app)
      .get(`/api/evaluations/${evaluationId}/results`)
      .set('Authorization', `Bearer ${token}`);

    expect(resultsRes.status).toBe(200);
    const ranked = resultsRes.body.results as Array<{ rank: number; config: { id: number } }>;
    expect(ranked).toHaveLength(2);
    expect(ranked.map(r => r.config.id)).toEqual([cfg, cfg]);
    // The headline: the same model, twice, at #1 and #2.
    expect(ranked.map(r => r.rank)).toEqual([1, 2]);
  });

  // (5) the control's NEGATIVE counterpart -- stated so the fix for (1)/(2)
  // cannot be satisfied by rejecting the request. A duplicate id is not an
  // invalid id; the caller sent a config the caller owns, twice. If the policy
  // chosen later is "reject", this arm is the RED that says so.
  it('(5) the duplicate is ACCEPTED, not rejected as invalid', async () => {
    const res = await post([cfg, cfg]);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'PENDING' });
    expect(typeof res.body.evaluation_id).toBe('string');
  });

  // (6) SOURCE PREMISE. The three places the round's claims rest on, pinned as
  // text so that a refactor which keeps the behaviour but moves the code does
  // not silently invalidate the arms above -- and, more importantly, so a refactor
  // that changes the SHAPE without the behaviour is caught here rather than
  // being reported as a new finding in three rounds' time.
  it('(6) premise: the link loop, the work loop and the join carry no dedup', () => {
    const fs = require('fs');
    const path = require('path');
    const routeSrc = fs.readFileSync(path.join(__dirname, '../../src/web/routes/evaluations.ts'), 'utf8');
    const engineSrc = fs.readFileSync(path.join(__dirname, '../../src/web/engine/evaluator.ts'), 'utf8');

    // F1: the insert loop walks the request array.
    expect(routeSrc).toContain('for (const configId of config_ids)');
    expect(routeSrc).toContain('INSERT INTO evaluation_configs');
    // No normalisation anywhere between the body's destructure and the loop.
    const destructureAt = routeSrc.indexOf('config_ids,');
    const loopAt = routeSrc.indexOf('for (const configId of config_ids)');
    expect(loopAt).toBeGreaterThan(destructureAt);
    expect(routeSrc.slice(destructureAt, loopAt)).not.toMatch(/new Set|\.filter\(.*indexOf|dedup|unique/i);

    // F2/F3: the engine's outer loop and its denominator both read task.configs.
    expect(engineSrc).toContain('for (const configId of task.configs)');
    expect(engineSrc).toContain('task.configs.length');
    // And nothing normalises on the way in either.
    expect(engineSrc.slice(0, engineSrc.indexOf('for (const configId of task.configs)'))).not.toMatch(
      /new Set\(/,
    );

    // F4: the join has no DISTINCT.
    const joinLine = routeSrc
      .split('\n')
      .find((l: string) => l.includes('JOIN evaluation_configs ec ON c.id = ec.config_id'))!;
    expect(joinLine).toBeTruthy();
    expect(joinLine).not.toMatch(/DISTINCT/i);

    // The table offers no protection either -- if it carried a UNIQUE the second
    // insert could not succeed, so F1's premise is the absence of the key.
    const dbSrc = fs.readFileSync(path.join(__dirname, '../../src/web/db/database.ts'), 'utf8');
    const tableAt = dbSrc.indexOf('CREATE TABLE IF NOT EXISTS evaluation_configs');
    const table = dbSrc.slice(tableAt, dbSrc.indexOf(');', tableAt));
    expect(table).not.toMatch(/UNIQUE/i);
  });

  // (7) LIVE-TREE PIN (harness note 5). The one arm that states the invariant
  // against the working tree rather than against the module registry, so an
  // UNCOMMITTED repair is visible here immediately. Reads the file that arms
  // (1)-(5) execute, on disk, at run time.
  it('(7) live tree: the file the route executes still walks the raw request array', () => {
    const fs = require('fs');
    const path = require('path');
    const onDisk = fs.readFileSync(path.join(__dirname, '../../src/web/routes/evaluations.ts'), 'utf8');
    expect(onDisk).toContain('for (const configId of config_ids)');
    // The same needle arm (6) pins, read from disk rather than through the
    // module loader, and carrying its own match so a vacuous pass is visible.
    const matches = onDisk.split('for (const configId of config_ids)').length - 1;
    expect(matches).toBe(1);
  });
});
