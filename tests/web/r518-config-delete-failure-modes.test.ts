// tests/web/r518-config-delete-failure-modes.test.ts
//
// WHY THIS FILE EXISTS (2026-10-29 23:03 cron, llm-benchmark rotation).
//
// R474 pinned what PUT /api/configs/:id does to a row the CALLER OWNS.  The
// sibling route -- DELETE /api/configs/:id -- had no suite for its FAILURE
// modes, and it has three of them, all measured here against the real
// Express app and a real SQLite database.
//
// THE CLASS: **the same database constraint produces a JSON error in one route
// and an HTML stack trace in another.**  The repo already contains the
// correct pattern (src/web/routes/evaluations.ts:115-155 wraps its handler in
// try/catch and answers `res.status(400).json({error: errorMessage(err)})`),
// and the sibling route one file over (src/web/routes/configs.ts:58-63)
// does not.  The FK on evaluation_configs.config_id is the constraint both
// routes can hit.
//
// MEASURED (2026-10-29 23:1x, real app + real SQLite, not a mock):
//
//   D1  DELETE a config that is REFERENCED by evaluation_configs
//       -> 500, content-type `text/html; charset=utf-8`, body is Express's
//          default error page carrying the SQLite message AND a stack frame
//          naming `src/web/routes/configs.ts`.
//       -> the config row SURVIVES and the evaluation_configs link SURVIVES:
//          the statement failed atomically, so there is no partial write.
//   D2  DELETE a config id that names NO row
//       -> 200 `{success:true}`.
//       -> the SIBLING route answers 404 for the very same id:
//          PUT /api/configs/:id checks existence and answers
//          `{error:'Config not found'}`.  Two routes, one id, two answers.
//   D3  DELETE a config id that belongs to ANOTHER TENANT
//       -> 200 `{success:true}`, and nothing happened: the row is still
//          there, because the DELETE is scoped by `user_id` and matched no
//          row.
//       -> PUT answers 404 for the same id (its existence check is scoped
//          by `user_id` too), so the asymmetry is not "delete is
//          idempotent" -- it is that DELETE has no existence check at all.
//   D4  THE SAME SQLite error, one route over, is handled:
//       POST /api/evaluations with an unknown config_id -> 400
//       `{error:'FOREIGN KEY constraint failed'}`, content-type JSON.
//       Same error class, same database, same FK -- one route catches it,
//       the other lets it escape to Express's default handler.
//
// WHY D4 IS THE LOAD-BEARING ARM
//
// Without it, D1 could be read as "Express renders unhandled errors that
// way" -- a framework property, not a defect of this route.  D4 shows the
// repository already handles the identical error on a sibling route, so the
// unhandled 500 on the DELETE path is a MISSING try/catch, not a framework
// limitation.  (Measured separately: in `NODE_ENV=production` Express
// replaces the stack with `Internal Server Error`; in every other env the
// body carries the absolute source path and the full frame list.  The
// container in docker-compose.yml sets NODE_ENV=production, but `npm run
// start:web` does not, so the stack leaks in the default local run.)
//
// WHAT THIS FILE DELIBERATELY DOES NOT DO
//
// It asserts no correct behaviour.  Each repair is a product decision:
//
//   D1 -- 409 Conflict ("this config is referenced by an evaluation"), 400
//         (mirroring the sibling route verbatim), or CASCADE (delete the
//         evaluation_configs links, and decide what happens to the
//         evaluation's results).  Three defensible answers.
//   D2 -- 404 for an unknown id (mirroring PUT), or keep the idempotent 200.
//         Idempotent DELETE is a legitimate contract; the point of this
//         suite is that the repo currently answers PUT and DELETE
//         differently for the same id, and nobody wrote that down.
//   D3 -- 404 for another tenant's id (mirroring PUT) is the obvious
//         reading, but "200 because nothing was deleted" is also a
//         defensible non-disclosure choice.
//
// All three are recorded father-gated.  Pinning the CURRENT behaviour makes
// each decision visible and stops it drifting silently; when a policy lands,
// the matching arm below is the RED that has to be updated.
//
// HARNESS NOTES (all measured on this file)
//
// 1. NO API KEY VALUE IS EVER PRINTED OR ASSERTED.  Keys are opaque
//    placeholders and are never echoed.
// 2. THE ENGINE IS NEVER RUN.  The evaluations route is mounted with the
//    engine stubbed, exactly as tests/web/r475-cross-tenant-config-ids.test.ts
//    does, because run() would make real adapter network calls.
// 3. THE FK PRECONDITION IS ASSERTED, NOT ASSUMED.  better-sqlite3 turns
//    foreign keys ON by default, and the whole D1 finding rests on that;
//    arm (0) pins the pragma so the finding cannot silently become vacuous.
// 4. EVERY ARM IS A COMPARISON AGAINST A SIBLING ROUTE (PUT for D2/D3, POST
//    /api/evaluations for D4).  A bare "DELETE answers 500" would be a
//    statement about Express; the comparison is what makes it a statement
//    about this repository.

import express, { Express } from 'express';
import request from 'supertest';
import configsRoutes from '../../src/web/routes/configs';
import evaluationsRoutes from '../../src/web/routes/evaluations';
import authRoutes from '../../src/web/routes/auth';
import { resetDatabase, initAdminUser, getDatabase } from '../../src/web/db/database';

// The engine is stubbed: this suite is about the ROUTE's response, and
// run() would make real adapter network calls (harness note 2).
jest.mock('../../src/web/engine/evaluator', () => ({
  EvaluatorEngine: jest.fn().mockImplementation(() => ({
    run: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../src/web/websocket', () => ({
  getWSSender: jest.fn().mockReturnValue(() => {}),
}));

const db = () => getDatabase();

/** A second tenant. src/ has no user-creation route, so it is inserted. */
function insertOtherTenant(): number {
  db().prepare("INSERT INTO users (id, username, password_hash) VALUES (77, 'other-tenant', 'x')").run();
  db()
    .prepare(
      "INSERT INTO configs (id, user_id, name, type, endpoint, api_key, model) " +
        "VALUES (55, 77, 'Other tenant config', 'openai', 'https://example.invalid/v1', 'sk-other', 'm')"
    )
    .run();
  return 55;
}

/** Create a config owned by the logged-in admin. */
async function createOwnConfig(app: Express, token: string, name = 'Owned'): Promise<number> {
  const res = await request(app)
    .post('/api/configs')
    .set('Authorization', `Bearer ${token}`)
    .send({ name, type: 'openai', endpoint: 'https://example.invalid/v1', api_key: 'sk-own', model: 'm' });
  return res.body.id;
}

/** Link a config to an evaluation -- this is what makes the FK fire. */
function linkToEvaluation(configId: number): void {
  db()
    .prepare(
      "INSERT INTO evaluations (id, user_id, status, include_dialogue, include_coding) " +
        "VALUES ('ev-r518', 1, 'PENDING', 1, 0)"
    )
    .run();
  db().prepare('INSERT INTO evaluation_configs (evaluation_id, config_id) VALUES (?, ?)').run('ev-r518', configId);
}

describe('r518 — DELETE /api/configs/:id failure modes', () => {
  let app: Express;
  let token: string;

  beforeAll(() => {
    initAdminUser();
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRoutes);
    app.use('/api/configs', configsRoutes);
    app.use('/api/evaluations', evaluationsRoutes);
  });

  beforeEach(async () => {
    resetDatabase();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' });
    token = res.body.token;
  });

  // (0) CONTROL.  Two things are pinned here, and both are load-bearing:
  //       the FK pragma is ON (the D1 finding rests on it), and the route
  //       answers 200 on the happy path (so a 500 later is the route's
  //       behaviour on a specific input, not a broken mount).
  it('(0) control: the FK pragma is ON and an UNREFERENCED own config deletes with 200', async () => {
    const pragma = db().pragma('foreign_keys') as Array<{ foreign_keys: number }>;
    expect(pragma[0].foreign_keys).toBe(1);

    const id = await createOwnConfig(app, token);
    const res = await request(app).delete(`/api/configs/${id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    const row = db().prepare('SELECT COUNT(*) AS n FROM configs WHERE id = ?').get(id) as { n: number };
    expect(row.n).toBe(0);
  });

  // (1) D1.  The referenced config.  The current behaviour is an UNHANDLED
  //     500 whose body is Express's HTML error page carrying the SQLite
  //     message and a stack frame naming this repository's source file.
  it('(1) D1: DELETE of a REFERENCED config escapes to Express as an HTML 500 with a stack frame', async () => {
    const id = await createOwnConfig(app, token, 'Referenced');
    linkToEvaluation(id);

    const res = await request(app).delete(`/api/configs/${id}`).set('Authorization', `Bearer ${token}`);

    // Current behaviour, PINNED (the repair is father-gated -- see header).
    expect(res.status).toBe(500);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    const body = String(res.text);
    expect(body).toContain('FOREIGN KEY constraint failed');
    // The stack frame names THIS repository's source file.  In a
    // non-production NODE_ENV the body carries the absolute path; the
    // frame's file name is env-independent.
    expect(body).toContain('src/web/routes/configs.ts');
    // A JSON body was NOT produced -- res.body is empty.
    expect(res.body).toEqual({});

    // The statement failed ATOMICALLY: neither the config nor the link is
    // half-deleted.  This part is the GOOD half of the current behaviour
    // and it is pinned so a repair cannot silently introduce a partial write.
    const cfg = db().prepare('SELECT COUNT(*) AS n FROM configs WHERE id = ?').get(id) as { n: number };
    expect(cfg.n).toBe(1);
    const link = db()
      .prepare('SELECT COUNT(*) AS n FROM evaluation_configs WHERE config_id = ?')
      .get(id) as { n: number };
    expect(link.n).toBe(1);
  });

  // (2) D2.  An id that names no row.  DELETE answers 200 `{success:true}`
  //     -- and the sibling route answers 404 for the SAME id.  Two routes,
  //     one id, two answers.
  it('(2) D2: DELETE of an UNKNOWN id answers 200 while PUT answers 404 for the same id', async () => {
    const missing = 424242;

    const del = await request(app).delete(`/api/configs/${missing}`).set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(200);
    expect(del.body).toEqual({ success: true });

    // The sibling route, same id, same caller, same token.
    const put = await request(app)
      .put(`/api/configs/${missing}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'x', type: 'openai', endpoint: 'https://example.invalid/v1', api_key: 'sk-x' });
    expect(put.status).toBe(404);
    expect(put.body).toEqual({ error: 'Config not found' });
  });

  // (3) D3.  Another tenant's config id.  DELETE answers 200 `{success:true}`
  //     and NOTHING HAPPENS -- the row is still there, because the DELETE is
  //     scoped by `user_id` and matched no row.  PUT answers 404 for the same
  //     id, so this is not "delete is idempotent": it is that DELETE has no
  //     existence check while PUT has one.
  it('(3) D3: DELETE of ANOTHER TENANT\'s id answers 200 and changes nothing, while PUT answers 404', async () => {
    const otherId = insertOtherTenant();

    const del = await request(app).delete(`/api/configs/${otherId}`).set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(200);
    expect(del.body).toEqual({ success: true });

    // Nothing happened -- the other tenant's config survives.
    const row = db().prepare('SELECT COUNT(*) AS n FROM configs WHERE id = ?').get(otherId) as { n: number };
    expect(row.n).toBe(1);

    // The sibling route, same id.
    const put = await request(app)
      .put(`/api/configs/${otherId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'x', type: 'openai', endpoint: 'https://example.invalid/v1', api_key: 'sk-x' });
    expect(put.status).toBe(404);
    expect(put.body).toEqual({ error: 'Config not found' });
  });

  // (4) D4.  THE COMPARISON THAT MAKES D1 A REPOSITORY DEFECT RATHER THAN A
  //     FRAMEWORK PROPERTY.  The identical SQLite error, on the sibling
  //     route, is caught and answered as JSON 400.
  it('(4) D4: the SAME FK error is answered as JSON 400 by POST /api/evaluations', async () => {
    const missing = 999999;
    const res = await request(app)
      .post('/api/evaluations')
      .set('Authorization', `Bearer ${token}`)
      .send({ config_ids: [missing], dialogue: true, coding: false });

    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({ error: 'FOREIGN KEY constraint failed' });

    // No evaluation row was left behind by the aborted write.
    const link = db()
      .prepare('SELECT COUNT(*) AS n FROM evaluation_configs WHERE config_id = ?')
      .get(missing) as { n: number };
    expect(link.n).toBe(0);
  });
});
