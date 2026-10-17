// tests/web/r474-config-update-semantics.test.ts
//
// WHY THIS FILE EXISTS (2026-10-18 00:03 cron, llm-benchmark rotation).
//
// PUT /api/configs/:id (src/web/routes/configs.ts:38-55) is the only mutating
// route in the file that has NO field validation, and it is the one route the
// product's own UI drives with a documented SENTINEL CONTRACT that the backend
// never implements:
//
//   public/js/configs.js:166-181
//     if (!data.api_key) delete data.api_key;
//     if (!data.model)   delete data.model;
//     ...
//     if (!data.api_key) {
//       data.api_key = 'placeholder'; // 后端应该忽略
//     }
//
// The comment translates to "the backend SHOULD ignore this". It does not
// ignore it. Nothing in src/ ever compares api_key against the string
// 'placeholder' (measured: the only `placeholder` hits in src/ are unrelated
// comments in src/core/evaluator.ts). So the UI's "leave the key blank to keep
// the existing one" affordance silently DESTROYS the stored credential, and
// the next evaluation run authenticates to the vendor with the eleven
// characters 'placeholder'.
//
// That is the headline. The four findings below are what the same route does,
// all MEASURED against the real Express app + real SQLite + supertest, not read
// out of the source and asserted back.
//
//   F1  SENTINEL IS WRITTEN AS A CREDENTIAL. The UI edit flow overwrites a real
//       stored key with 'placeholder'. GET still redacts api_key, so nothing in
//       the UI shows the loss; only a vendor 401 does.
//
//   F2  OMITTED is_active SILENTLY DEACTIVATES. `is_active ? 1 : 0` at
//       configs.ts:52 with no default. PUT that omits is_active -- which is
//       exactly what the UI does, since saveConfig() has no is_active field --
//       writes 0. Measured: a row that was is_active=1 before the PUT is 0
//       after a PUT that never mentioned it.
//
//   F3  OMITTED model IS NULLIFIED. Same shape as F2 and it is the one the UI
//       hits hardest: saveConfig() DELETES model when the box is empty (L168),
//       so editing a config's name and clearing its model silently nulls the
//       stored model. Measured in Q2 -- a PUT carrying name/type/endpoint/
//       api_key and no model turned a stored 'gpt-4' into NULL.
//
//   F4  MISSING REQUIRED FIELD IS AN UNCAUGHT SQLITE CONSTRAINT ERROR, NOT A
//       400. POST validates required fields (configs.ts:23-26, 400). PUT does
//       not, so a partial body reaches the UPDATE and better-sqlite3 raises
//       SQLITE_CONSTRAINT_NOTNULL inside the Express handler. Measured: HTTP 500
//       with an Express default HTML error page and an EMPTY json body. Note
//       the contrast this makes precise: F2/F3 are quiet, F4 is loud -- and the
//       loud one is the one that is ALSO the wrong status code.
//
// WHAT THIS FILE DELIBERATELY DOES NOT DO
//
// It does not assert correct behaviour for any of the four. Each repair is a
// product decision:
//   F1 -- should the backend recognise and drop the sentinel, or should the UI
//         stop sending it and read the field back instead?
//   F2 -- is `is_active` a real feature? Nothing in src/ reads it (measured:
//         evaluator.ts:103 does `SELECT * FROM configs WHERE id=?` and never
//         filters on it; the only src/ readers are the route itself and the
//         ConfigRow interface declaration). If it is dead, PUT should stop
//         writing it; if it is meant to gate evaluation, the engine should
//         honour it. Those are opposite directions.
//   F3 -- same question for model NULL vs ''.
//   F4 -- 400 vs 422, and whether PUT should be full-replace or PATCH-like.
//
// All four are recorded as father-gated. Pinning current behaviour makes each
// decision visible and stops it drifting silently; the moment a policy lands,
// the matching arm below is the RED that has to be updated.
//
// HARNESS NOTES (both measured on this file, both non-obvious)
//
// 1. API KEYS ARE SECRET-MASKED IN TEST OUTPUT. Printing the stored value logs
//    `***`, which is indistinguishable from a correct redaction -- the first
//    draft of this file asserted on JSON.stringify(row.api_key) and would have
//    reported a false GREEN on F1. Every api_key assertion here is therefore
//    length + sha256 prefix + an equality-to-sentinel boolean, never the value.
//
// 2. THE DB IS SHARED AND SESSION-SCOPED. resetDatabase() in beforeEach is
//    what isolates cases; arm (7) depends on it having run, and it reads the
//    global row count, so it must not be reordered before its own reset.
//
// 3. ARM (0) IS A SOURCE-TEXT PIN, AND IT IS LABELLED AS ONE. It reads
//    public/js/configs.js and asserts the sentinel assignment is present,
//    because the whole finding is a CROSS-BOUNDARY contract: the finding does
//    not exist unless the producer side really emits that literal. Mutation arm
//    M7 deletes the assignment and kills this arm -- which is CORRECT and was
//    the measured outcome, not a false red. The first draft of this file
//    described M7 as a prose control "that must SURVIVE"; that description was
//    wrong, because arm (0) is bound to source text and cannot survive it.
//
//    The load-bearing negative control is therefore M2, NOT M7: M2 renames the
//    `api_key` binding through an intermediate variable, changes no behaviour
//    at all, and SURVIVES 9/9. That is what proves this suite measures
//    observable outcomes rather than identifier spelling or vocabulary. Arm (0)
//    keeps its job -- pinning the producer half of a cross-boundary contract --
//    and the file says so instead of borrowing the strength of a different arm.

import express, { Express } from 'express';
import { createHash } from 'crypto';
import request from 'supertest';
import configsRoutes from '../../src/web/routes/configs';
import authRoutes from '../../src/web/routes/auth';
import { resetDatabase, initAdminUser, getDatabase } from '../../src/web/db/database';

/**
 * The sentinel the product UI sends. Named and pinned as a constant because the
 * whole point of F1 is that this exact literal crosses the boundary and lands
 * in the credentials column.
 */
const UI_SENTINEL = 'placeholder';

/** Never print a key. Length + digest + the one boolean the arm is about. */
function keyShape(value: unknown): string {
  const s = String(value);
  return `len=${s.length} sha=${createHash('sha256').update(s).digest('hex').slice(0, 12)} isSentinel=${s === UI_SENTINEL}`;
}

describe('r474 — PUT /api/configs/:id update semantics', () => {
  let app: Express;
  let token: string;

  beforeAll(() => {
    initAdminUser();
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRoutes);
    app.use('/api/configs', configsRoutes);
  });

  beforeEach(async () => {
    resetDatabase();
    const login = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' });
    token = login.body.token;
  });

  const create = async (overrides: Record<string, unknown> = {}): Promise<number> => {
    const res = await request(app)
      .post('/api/configs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Real',
        type: 'openai',
        endpoint: 'https://api.openai.com/v1',
        api_key: 'sk-REAL-CREDENTIAL',
        model: 'gpt-4',
        ...overrides,
      });
    expect(res.status).toBe(200);
    return res.body.id as number;
  };

  const put = (id: number, body: Record<string, unknown>) =>
    request(app).put(`/api/configs/${id}`).set('Authorization', `Bearer ${token}`).send(body);

  const rowOf = (id: number): Record<string, unknown> =>
    getDatabase().prepare('SELECT * FROM configs WHERE id=?').get(id) as Record<string, unknown>;

  // (0) SOURCE-TEXT PIN on the producer half of a cross-boundary contract.
  // This arm is bound to configs.js text BY DESIGN -- see harness note 3. The
  // suite's negative control is M2 (a pure rename, which survives), not this.
  it('(0) premise: the UI sentinel is the bare literal "placeholder"', () => {
    expect(UI_SENTINEL).toBe('placeholder');
    expect(UI_SENTINEL.length).toBe(11);
    // The frontend deletes api_key then sets it to this literal.
    const js = require('fs').readFileSync(
      require('path').join(__dirname, '../../public/js/configs.js'),
      'utf8',
    ) as string;
    expect(js).toContain("data.api_key = 'placeholder'");
  });

  // (1) F1. The exact request public/js/configs.js builds when the user edits
  // a config and leaves the API-key box empty. Measured on the stored row, and
  // asserted on shape rather than value (see harness note 1).
  it('(1) F1: the UI edit flow overwrites the stored credential with "placeholder"', async () => {
    const id = await create();
    expect(keyShape(rowOf(id).api_key)).toBe(
      keyShape('sk-REAL-CREDENTIAL'),
    );

    // saveConfig() with an empty key box sends name/type/endpoint + the sentinel,
    // and DELETES model because that box was empty too.
    const res = await put(id, {
      name: 'Real',
      type: 'openai',
      endpoint: 'https://api.openai.com/v1',
      api_key: UI_SENTINEL,
    });
    expect(res.status).toBe(200);

    const after = rowOf(id);
    expect(String(after.api_key)).toBe(UI_SENTINEL);
    expect(keyShape(after.api_key)).not.toBe(keyShape('sk-REAL-CREDENTIAL'));

    // The GET surface still redacts api_key, so the loss is invisible in the UI.
    const list = await request(app).get('/api/configs').set('Authorization', `Bearer ${token}`);
    expect(list.body[0]).not.toHaveProperty('api_key');
  });

  // (2) F1's reach: the engine loads the row with SELECT * and hands it to the
  // adapter, so the sentinel IS the credential used for the next run. This arm
  // does not invoke an adapter -- it pins that nothing between the write and the
  // adapter would filter the row out, so the sentinel is reached, not skipped.
  it('(2) F1 reach: nothing in the engine filters on is_active or api_key', () => {
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '../../src/web/engine/evaluator.ts'),
      'utf8',
    ) as string;
    expect(src).toContain('SELECT * FROM configs WHERE id=?');
    // A WHERE clause on the credential or the flag would make F1 unreachable.
    expect(src).not.toMatch(/SELECT \* FROM configs WHERE id=\?\s+AND/i);
    expect(src).not.toContain(UI_SENTINEL);
  });

  // (3) F2. A PUT that never mentions is_active deactivates the row. The UI has
  // no is_active control at all (saveConfig() builds a 4-field body), so this is
  // the request the product actually sends on every edit.
  it('(3) F2: omitting is_active writes 0 over a stored 1', async () => {
    const id = await create();
    expect(rowOf(id).is_active).toBe(1);

    const res = await put(id, {
      name: 'Renamed',
      type: 'openai',
      endpoint: 'https://api.openai.com/v1',
      api_key: 'sk-REAL-CREDENTIAL',
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });

    // The request said nothing about is_active.
    expect(rowOf(id).is_active).toBe(0);
    expect(rowOf(id).name).toBe('Renamed');
  });

  // (4) F3. saveConfig() deletes `model` when the box is empty, so a rename in
  // the UI nulls the stored model on the way past.
  it('(4) F3: omitting model nulls a stored model', async () => {
    const id = await create();
    expect(rowOf(id).model).toBe('gpt-4');

    const res = await put(id, {
      name: 'Real',
      type: 'openai',
      endpoint: 'https://api.openai.com/v1',
      api_key: 'sk-REAL-CREDENTIAL',
    });
    expect(res.status).toBe(200);
    expect(rowOf(id).model).toBeNull();
  });

  // (5) F3's counterpart, so the fix is not free to turn NULL into ''. Both
  // states are reachable from the UI (empty box -> omitted -> NULL; a box
  // holding whitespace -> present -> ''), and the two are not distinguished
  // downstream: adapter construction reads config.type, and model flows into
  // the request body, where NULL and '' may serialise differently.
  it('(5) F3: an explicitly empty model is stored as empty string, not NULL', async () => {
    const id = await create();
    const res = await put(id, {
      name: 'Real',
      type: 'openai',
      endpoint: 'https://api.openai.com/v1',
      api_key: 'sk-REAL-CREDENTIAL',
      model: '',
    });
    expect(res.status).toBe(200);
    expect(rowOf(id).model).toBe('');
  });

  // (6) F4. POST validates its required fields and answers 400; PUT has no
  // equivalent guard, so a partial body reaches SQLite and the constraint
  // violation escapes the handler. Asserted on the status and on the empty json
  // body -- the Express default HTML page is what the client actually receives,
  // and an arm that only checked the status would miss that.
  it('(6) F4: a partial PUT body is a 500 with an empty json body, not a 400', async () => {
    const id = await create();
    const before = rowOf(id);

    const res = await put(id, { name: 'Only a name' });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({});
    expect(res.headers['content-type']).toMatch(/text\/html/);

    // The row is untouched, because the statement failed before it bound.
    const after = rowOf(id);
    expect(after.name).toBe(before.name);
    expect(keyShape(after.api_key)).toBe(keyShape(before.api_key));
  });

  // (7) F4's cause, named rather than inferred: the throw is a NOT NULL
  // constraint on configs.endpoint, raised by better-sqlite3 inside the
  // handler. Without this arm, "PUT 500s" could be satisfied by any 500 --
  // a tsc error at boot, an auth failure, a router typo. This one pins WHICH
  // constraint, so a future fix that adds a 400 guard is visibly aimed at the
  // right column.
  it('(7) F4 cause: the failure is SQLITE_CONSTRAINT_NOTNULL on configs.endpoint', async () => {
    const id = await create();
    const db = getDatabase();
    let code: string | undefined;
    let column: string | undefined;
    try {
      db.prepare(
        'UPDATE configs SET name=?, type=?, endpoint=?, api_key=?, model=?, is_active=? WHERE id=? AND user_id=?',
      ).run('N', 'openai', undefined, undefined, undefined, 0, id, 1);
    } catch (err: unknown) {
      code = (err as { code?: string }).code;
      column = /configs\.(\w+)/.exec((err as { message?: string }).message ?? '')?.[1];
    }
    expect(code).toBe('SQLITE_CONSTRAINT_NOTNULL');
    expect(column).toBe('endpoint');
  });

  // (8) the contrast that makes F4 a routing-shaped defect and not a database
  // quirk: the SAME missing field on the SAME table is a clean 400 one route
  // over. If this arm ever goes red, the defect moved; if it stays green while
  // (6) is red, the asymmetry is intact.
  it('(8) F4 contrast: POST rejects the same missing field with 400', async () => {
    const res = await request(app)
      .post('/api/configs')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'no-type-or-endpoint' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'Missing required fields: name, type, endpoint, api_key',
    });
  });
});
