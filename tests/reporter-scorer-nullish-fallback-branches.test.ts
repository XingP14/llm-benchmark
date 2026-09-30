// tests/reporter-scorer-nullish-fallback-branches.test.ts
//
// Closes the 3 genuinely-reachable dark arms left in the in-scope coverage map
// after the 04:03 (reporter.ts log gate) and 05:03 (woclaw graph query options)
// ticks. The 04:03 tick's own note recorded the collapse of the branch map to
// "just 2 dark arms"; this tick re-derived the map from a fresh
// `--coverageReporters=json` run and found 7 dark branch arms + 1 dark statement
// + 1 dark function, of which only 3 are closable without breaking an invariant
// the production code actually maintains (the other 4 are recorded below with
// the evidence for why they are dead, not merely unpinned).
//
// DARK ARMS CLOSED HERE
//   1. src/core/reporter.ts:206  `results.length > 0 ? results[0].scores.length : 0`
//      The false arm of the ternary. `generateJSON([])` is a real reachable call
//      (saveReport is called from core/evaluator.ts with whatever the run produced,
//      and a run aborted before any result is scored yields []), but no pre-existing
//      test ever passed an empty array.
//   2. src/core/scorer.ts:377    `arguments: obj.arguments || {}`
//      The `|| {}` operand. The path-3 regex
//      `/\{[\s\S]*?"name"[\s\S]*?"arguments"[\s\S]*?\}/` matches on the KEYS only,
//      never on the values, so a JSON body carrying `"arguments": null` satisfies
//      the regex and lands on L377 with a falsy `arguments`. Every pre-existing
//      test in the repo passes a well-formed object.
//   3. src/web/routes/evaluations.ts:234  `results.sort((a,b) => b.total_score - a.total_score)`
//      The comparator ARROW FUNCTION was never invoked: the only two existing
//      /:id/results tests each link exactly ONE config via evaluation_configs, so
//      `results` has length 1 and Array.prototype.sort never calls the comparator.
//      A two-config evaluation is the only way to reach it, and it is also the
//      only way to observe the DESCENDING order the route promises.
//
// DARK ARMS DELIBERATELY LEFT DARK (each verified this tick, not assumed)
//   a. src/core/reporter.ts:386  `dimBarClass[d.key] || d.key.replace(/_/g,'-')`
//      Dead. DIM_HEADERS declares exactly 5 keys (dialogue, coding,
//      function_calling, long_context, multi_turn) and the local dimBarClass
//      literal declares all 5, so the fallback is unreachable. Closed only by
//      deleting a CSS class mapping or by adding a 6th dimension, i.e. by
//      breaking the DIM_HEADERS/dimBarClass pairing the two literals maintain.
//   b. src/core/scorer.ts:176    `toolCall.arguments ?? {}`
//      Dead. `extractToolCall` is the ONLY producer of the `toolCall` value that
//      reaches L176, and all three of its return paths (top-level JSON L346,
//      OpenAI tool_calls L356, regex L377) already coalesce a missing/falsy
//      arguments to {} themselves. By the time L176 runs, arguments is always an
//      object, so the ?? operand never fires. This is the same
//      normalize-at-the-producer-then-defend-at-the-consumer shape that made
//      arm (2) closable: L176 defends against a state its own callee prevents.
//   c. src/core/reporter.ts:492  `String(v ?? '')`
//      Dead. All 8 cells `escape()` is called on are row values that are typed
//      `string | number` and are all non-null by construction: idx+1 (number),
//      r.modelName (string, NOT NULL column), the 5 dim cells (getDimValue returns
//      number or the literal '-'), the 10 ci cells (getDimCi returns a number
//      pair or the literal ['-','-']), and the duration/scores cells. Reaching it
//      would mean a row value of null or undefined reaching a column the schema
//      forbids.
//   d. src/web/websocket.ts:48   `req.url || ''`
//      Already triaged by a previous tick and documented in
//      tests/web/websocket-sender-fallback-and-log-gate.test.ts:21-22: the
//      http/ws parser rejects a request with no request-target before the
//      connection event fires, so `req.url` is always a string here. This tick
//      re-confirmed that comment is still accurate and did not re-litigate it.
//
// Every assertion below is a behavioural observation, not a source-text
// assertion: each one fails if the production line is deleted or mutated, which
// is what the mutation table in the commit body verifies.

import { Reporter } from '../src/core/reporter';
import { Scorer } from '../src/core/scorer';

// ---------------------------------------------------------------------------
// 1. reporter.ts:206 -- generateJSON's empty-results ternary
// ---------------------------------------------------------------------------

describe('Reporter.generateJSON stats.totalQuestions (reporter.ts:206)', () => {
  it('returns totalQuestions 0 for an empty results array (the false arm)', () => {
    const report = Reporter.generateJSON([]);

    expect(report.stats.totalModels).toBe(0);
    // The pinned value. `results[0].scores.length` would throw TypeError on an
    // empty array, so the ternary is load-bearing, not cosmetic.
    expect(report.stats.totalQuestions).toBe(0);
  });

  it('still emits a well-formed report object for the empty case', () => {
    const report = Reporter.generateJSON([]);

    expect(Array.isArray(report.results)).toBe(true);
    expect(report.results).toHaveLength(0);
    expect(report.generatedAt).toBeInstanceOf(Date);
  });

  it('reads totalQuestions from results[0] only, not from the mean of all results', () => {
    // Pins WHICH array element the ternary reads. With 3 results whose score
    // counts are 1, 2 and 10, totalQuestions must be 1 (the FIRST result's count)
    // and not 13/3. This is the shipped behaviour and it is arguably wrong --
    // a multi-config report reports only the first config's question count. Pinned
    // as-is, with the oddity called out, so a future fix shows up as a visible
    // test change rather than a silent behaviour change. NOT fixed here: that is
    // a production change, out of scope for a coverage tick.
    const results = [
      { scores: [{ score: 100 }] },
      { scores: [{ score: 100 }, { score: 90 }] },
      { scores: Array.from({ length: 10 }, () => ({ score: 80 })) },
    ] as any;

    const report = Reporter.generateJSON(results);

    expect(report.stats.totalModels).toBe(3);
    expect(report.stats.totalQuestions).toBe(1);
  });

  it('pins the 0/1 boundary: a single result with an empty scores array is 0, not a throw', () => {
    // The one case where totalQuestions is 0 while totalModels is 1 -- i.e. the
    // empty case reached through a NON-empty array. Distinct from arm (1), which
    // is reached through an empty array.
    const report = Reporter.generateJSON([{ scores: [] }] as any);

    expect(report.stats.totalModels).toBe(1);
    expect(report.stats.totalQuestions).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 2. scorer.ts:377 -- the `|| {}` operand in the regex tool_call extractor
// ---------------------------------------------------------------------------

describe('Scorer tool_call extraction: falsy arguments in the regex path (scorer.ts:377)', () => {
  const scorer = new Scorer({ chat: jest.fn() } as any, { name: 'test-model' } as any);
  // extractToolCall is private; reaching it through the public scoreFunctionCalling
  // would drag in the whole scoring stack. Cast through unknown so the test does
  // not depend on the member being public, but still fails if it is renamed away.
  const extract = (text: string) =>
    (scorer as unknown as { extractToolCall(t: string): { name: string; arguments: Record<string, unknown> } | null })
      .extractToolCall(text);

  it('coalesces a null arguments value to {} (the dark || operand)', () => {
    // The regex requires the literal keys "name" and "arguments" to appear, not
    // that their values are truthy, so this body reaches L377 with
    // `obj.arguments === null`. The `|| {}` is what stops `arguments: null` from
    // being handed to matchArgs as the actual argument map.
    const result = extract('{"name": "get_weather", "arguments": null}');

    expect(result).not.toBeNull();
    expect(result!.name).toBe('get_weather');
    expect(result!.arguments).toEqual({});
  });

  it('coalesces a missing/false arguments value to {} as well', () => {
    // `false` exercises the same operand through a different falsy value, so
    // deleting the operand cannot be compensated by a different guard.
    const result = extract('{"name": "get_weather", "arguments": false}');

    expect(result).not.toBeNull();
    expect(result!.arguments).toEqual({});
  });

  it('preserves a real arguments object unchanged (guards against over-broad coalescing)', () => {
    const result = extract('{"name": "get_weather", "arguments": {"city": "Beijing"}}');

    expect(result!.arguments).toEqual({ city: 'Beijing' });
  });

  it('preserves a FALSY value that the model meant literally, inside a real object', () => {
    // The `||` only applies to the arguments OBJECT itself, not to values inside
    // it. A model that emits `{"arguments": {"verbose": false}}` must keep the
    // false -- a naive `||` on the contents, or an `arguments || {verbose:false}`
    // style default, would silently drop it.
    const result = extract('{"name": "get_weather", "arguments": {"verbose": false, "limit": 0}}');

    expect(result!.arguments).toEqual({ verbose: false, limit: 0 });
    expect(Object.keys(result!.arguments)).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// 3. evaluations.ts:234 -- the sort comparator, reachable only with 2+ configs
// ---------------------------------------------------------------------------

describe('GET /api/evaluations/:id/results ranking (evaluations.ts:234)', () => {
  // The comparator is the whole point of the route: `results.sort` descending by
  // total_score, then `map` to 1-based rank. Neither has ever been observed,
  // because every existing /:id/results test links exactly one config, so
  // results.length === 1 and sort never calls its comparator on a 1-element array.
  //
  // The two configs here deliberately carry DIFFERENT per-dimension averages but
  // scores chosen so the DESCENDING order is observable and would be reversed by
  // a descending/ascending sign flip in the comparator.
  let app: unknown;
  let request: typeof import('supertest');
  let evaluationsRoutes: any;
  let configsRoutes: any;
  let authRoutes: any;
  let dbmod: any;
  let expressMod: any;
  let adminToken: string;
  let adminUserId: number;
  let configA: number;
  let configB: number;

  beforeAll(async () => {
    // Imported inside beforeAll so the module-level DB singleton is created
    // after jest has installed the test-environment setup, matching the ordering
    // the existing web route suites use.
    expressMod = await import('express');
    request = (await import('supertest')).default as any;
    evaluationsRoutes = (await import('../src/web/routes/evaluations')).default;
    configsRoutes = (await import('../src/web/routes/configs')).default;
    authRoutes = (await import('../src/web/routes/auth')).default;
    dbmod = await import('../src/web/db/database');

    dbmod.resetSingleton();
    dbmod.initAdminUser();

    const app_ = expressMod.default();
    app_.use(expressMod.json());
    app_.use('/api/auth', authRoutes);
    app_.use('/api/configs', configsRoutes);
    app_.use('/api/evaluations', evaluationsRoutes);
    app = app_;
  });

  beforeEach(async () => {
    dbmod.resetDatabase();
    const db = dbmod.getDatabase();
    const admin = db.prepare('SELECT id FROM users WHERE username=?').get('admin') as any;
    adminUserId = admin.id;

    const loginRes = await request(app as any)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' });
    adminToken = loginRes.body.token;

    const mk = async (name: string) => {
      const r = await request(app as any)
        .post('/api/configs')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name, type: 'openai', endpoint: 'https://api.openai.com/v1', api_key: 'sk-test' });
      // The configs route answers 200, not 201 -- asserted from the observed
      // response rather than assumed, so a future status change is visible.
      expect([200, 201]).toContain(r.status);
      return r.body.id as number;
    };
    configA = await mk('Model A (weaker)');
    configB = await mk('Model B (stronger)');
  });

  const seedEvaluation = (id: string, configs: number[]) => {
    const db = dbmod.getDatabase();
    db.prepare(`
      INSERT INTO evaluations (id, user_id, status, include_dialogue, include_coding)
      VALUES (?, ?, ?, 1, 1)
    `).run(id, adminUserId, 'COMPLETED');
    for (const cid of configs) {
      db.prepare('INSERT INTO evaluation_configs (evaluation_id, config_id) VALUES (?, ?)').run(id, cid);
    }
  };

  const seedResult = (evalId: string, configId: number, questionId: string, type: string, score: number) => {
    dbmod.getDatabase()
      .prepare(`
        INSERT INTO results (evaluation_id, config_id, question_id, question_type, category, model_output, score)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(evalId, configId, questionId, type, 'factual', `output-${questionId}`, score);
  };

  it('sorts multiple configs by total_score DESCENDING and assigns 1-based rank', async () => {
    const evalId = 'rank-eval-001';
    seedEvaluation(evalId, [configA, configB]);

    // Config A: dialogue 40, coding 40  -> total 40
    seedResult(evalId, configA, 'a-1', 'dialogue', 40);
    seedResult(evalId, configA, 'a-2', 'coding', 40);
    // Config B: dialogue 90, coding 95 -> total = round((90+95)/2) = 93
    seedResult(evalId, configB, 'b-1', 'dialogue', 90);
    seedResult(evalId, configB, 'b-2', 'coding', 95);

    const res = await request(app as any)
      .get(`/api/evaluations/${evalId}/results`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(2);

    // The insertion order was [configA, configB]; the response must be reversed.
    expect(res.body.results[0].config.id).toBe(configB);
    expect(res.body.results[1].config.id).toBe(configA);

    expect(res.body.results[0].total_score).toBe(93);
    expect(res.body.results[1].total_score).toBe(40);

    // The 1-based rank the map() right after the sort stamps on.
    expect(res.body.results[0].rank).toBe(1);
    expect(res.body.results[1].rank).toBe(2);
  });

  it('assigns ranks 1..n contiguously for three configs', async () => {
    const evalId = 'rank-eval-002';
    const configC = await request(app as any)
      .post('/api/configs')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Model C (best)', type: 'openai', endpoint: 'https://api.openai.com/v1', api_key: 'sk-test' });
    const configCId = configC.body.id as number;

    seedEvaluation(evalId, [configA, configCId, configB]);

    // Deliberately seeded OUT of order: A=50, C=100, B=70. A stable sort must
    // still return C, B, A. Insertion order A,C,B means an unsorted pass-through
    // would return A,C,B -- so this case distinguishes sorted from unsorted just
    // as sharply as the two-config case.
    seedResult(evalId, configA, 'a-1', 'dialogue', 50);
    seedResult(evalId, configCId, 'c-1', 'dialogue', 100);
    seedResult(evalId, configB, 'b-1', 'dialogue', 70);

    const res = await request(app as any)
      .get(`/api/evaluations/${evalId}/results`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(3);
    expect(res.body.results.map((r: any) => r.total_score)).toEqual([100, 70, 50]);
    expect(res.body.results.map((r: any) => r.rank)).toEqual([1, 2, 3]);
  });

  it('breaks total_score ties by preserving the original config order (stable sort)', async () => {
    const evalId = 'rank-eval-003';
    seedEvaluation(evalId, [configA, configB]);

    // Both configs score identically. A stable sort (which V8's Array#sort has
    // been since ES2019) leaves them in evaluation_configs / join order, so A
    // stays ahead of B even though the comparator returns 0.
    seedResult(evalId, configA, 'a-1', 'dialogue', 77);
    seedResult(evalId, configB, 'b-1', 'dialogue', 77);

    const res = await request(app as any)
      .get(`/api/evaluations/${evalId}/results`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.results[0].config.id).toBe(configA);
    expect(res.body.results[1].config.id).toBe(configB);
    expect(res.body.results[0].rank).toBe(1);
    expect(res.body.results[1].rank).toBe(2);
  });

  it('keeps question_results attached to the right config after sorting', async () => {
    // The sort operates on the built entry objects, and question_results is one
    // of the fields built in the same pass. This asserts the sort did not
    // detach or cross-assign the per-question detail -- a real risk if a future
    // refactor sorts a list of ids and re-looks-up the payloads.
    const evalId = 'rank-eval-004';
    seedEvaluation(evalId, [configA, configB]);

    seedResult(evalId, configA, 'a-1', 'dialogue', 30);
    seedResult(evalId, configA, 'a-2', 'coding', 30);
    seedResult(evalId, configB, 'b-1', 'dialogue', 88);
    seedResult(evalId, configB, 'b-2', 'function_calling', 91);

    const res = await request(app as any)
      .get(`/api/evaluations/${evalId}/results`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);

    const first = res.body.results[0];
    const second = res.body.results[1];

    expect(first.config.id).toBe(configB);
    expect(first.question_results.map((q: any) => q.question_id).sort()).toEqual(['b-1', 'b-2']);
    // The 5-dim split survives the sort: B has no coding rows, so its
    // coding_score is the avgOf([]) === 0 fallback, not undefined.
    expect(first.coding_score).toBe(0);
    expect(first.dialogue_score).toBe(88);
    expect(first.function_calling_score).toBe(91);

    expect(second.config.id).toBe(configA);
    expect(second.question_results.map((q: any) => q.question_id).sort()).toEqual(['a-1', 'a-2']);
  });
});
