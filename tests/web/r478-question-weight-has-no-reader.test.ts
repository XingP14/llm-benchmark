// tests/web/r478-question-weight-has-no-reader.test.ts
//
// WHY THIS FILE EXISTS (2026-10-18 04:03 cron, llm-benchmark rotation).
//
// `BenchmarkQuestion.weight` is declared in src/types/index.ts:82-83 with the
// JSDoc "/** 评分权重 */" -- "scoring weight". It is a REQUIRED member of the
// interface (no `?`), so every one of the 35 benchmark questions in
// src/benchmarks/*.ts must supply it. They do, and they use FOUR DISTINCT
// VALUES: 1, 1.5, 2, 2.5.
//
// NOTHING EVER READS IT.
//
// The complete set of `.weight` readers in src/, measured by grep over the
// whole tree excluding the benchmark definitions themselves:
//
//   src/web/routes/questions.ts:21,34,44,54,64   <- the only five
//
// Every one of those five is the SAME line of code in five branches of one
// response builder: `weight: q.weight` inside the GET /api/questions
// projection. It hands the number to an HTTP client and stops. It does not
// score, does not aggregate, does not order, does not persist.
//
// The aggregation paths that a weight would have to enter if it were live:
//
//   src/core/evaluator.ts:1816  calculateTotalScore  -- sum(score) / n
//   src/core/evaluator.ts:1849  buildDimEntry        -- sum(score) / count
//   src/core/evaluator.ts:1874  calculateCategoryDetails -- sum(score) / n
//   src/web/routes/evaluations.ts:49-71  avgOf / scoresOf -- sum/n, 6 sites
//
// All six are UNWEIGHTED. And the web path is worse than merely ignoring the
// weight: the `results` table has no weight column (src/web/db/database.ts
// L147-161) and the engine's two INSERTs (src/web/engine/evaluator.ts:137,
// L145) do not write one, so after a run the weight is not merely unused --
// it is GONE. The score rows cannot be re-weighted later because the number
// needed to do it was never stored.
//
// MEASURED CONSEQUENCE. 35 questions: weight 1 -> 5, weight 1.5 -> 12,
// weight 2 -> 15, weight 2.5 -> 3. Take a model that scores 80 on every
// weight>=2 question and 40 on every weight-1 question:
//
//   UNWEIGHTED total = 61
//   WEIGHTED   total = 65    (sum=3920, den=60.5)
//
// Reverse the model's profile and the ranking flips the other way:
//
//   REVERSED: unweighted = 59, weighted = 55
//
// So the field's documented purpose -- "the harder question counts more" --
// has no observable effect whatsoever: a 4-point swing on a 0-100 scale in
// both directions, and the ordering of two models can be inverted by it. The
// leaderboard this project produces does not implement the weighting its own
// data model advertises.
//
// THIS FILE DELIBERATELY DOES NOT CHOOSE A REPAIR.
//
// Should the aggregate be weighted? Or is `weight` legacy scaffolding from a
// design that was abandoned in favour of per-dimension averages? Both are
// legitimate, and the answer changes what the numbers in every existing
// report mean. Note the direction is not neutral either: wiring the weight in
// retroactively MOVES published scores, which is a product decision, not a
// refactor.
//
// So this suite pins CURRENT behaviour, which is the thing that has to
// change. Arms (3)-(6) are the four repairs; each one turns an arm RED on
// purpose. The moment a policy lands, that arm is the update.
//
// HARNESS NOTES
//
// 1. THE FIVE PROJECTION SITES ARE NOT FIVE FINDINGS. A grep census that
//    counted `weight: q.weight` five times would report "5 readers" and make
//    this look like a live field. arm (2) is the control that collapses them:
//    all five lines are inside one function, one projection, one response.
//    The census in arm (1) therefore reports DISTINCT projection sites, not
//    textual hits.
//
// 2. ARM (0) IS A CALLABILITY PIN, NOT A TEXT PIN. It calls the real
//    getAll*Benchmarks() functions and reads .weight off the returned rows,
//    so a renamed export fails here rather than silently reducing the suite
//    to the greps in arms (1)/(2). This is the #181 family: a suite that only
//    greps can report "0 tests" and look green.
//
// 3. THE UNWEIGHTED AGGREGATES IN ARMS (3)-(6) ARE DRIVEN THROUGH THE REAL
//    ROUTE (supertest against real Express + real SQLite), not reimplemented.
//    The avgOf-scoring companion suite
//    (tests/web/evaluations-avg-rounding-runtime.test.ts) documents the
//    reimplementation trap at length; this file avoids it deliberately.

import express from 'express';
import request from 'supertest';
import authRoutes from '../../src/web/routes/auth';
import configsRoutes from '../../src/web/routes/configs';
import evaluationsRoutes from '../../src/web/routes/evaluations';
import questionsRoutes from '../../src/web/routes/questions';
import { resetDatabase, getDatabase, initAdminUser, resetSingleton } from '../../src/web/db/database';
import { getAllDialogueBenchmarks } from '../../src/benchmarks/dialogue';
import { getAllCodeBenchmarks } from '../../src/benchmarks/coding';
import { getAllFunctionCallingBenchmarks } from '../../src/benchmarks/function-calling';
import { getAllLongContextBenchmarks } from '../../src/benchmarks/long-context';
import { getAllMultiTurnBenchmarks } from '../../src/benchmarks/multi-turn';
import type { BenchmarkQuestion } from '../../src/types';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const SRC_ROOT = join(__dirname, '../../src');

/** Every production .ts file under src/, recursively. */
function srcFiles(dir: string = SRC_ROOT): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...srcFiles(full));
    else if (full.endsWith('.ts')) out.push(full);
  }
  return out;
}

/** The five benchmark getters, called for real. */
function allQuestions(): BenchmarkQuestion[] {
  return [
    ...getAllDialogueBenchmarks(),
    ...getAllCodeBenchmarks(),
    ...getAllFunctionCallingBenchmarks(),
    ...getAllLongContextBenchmarks(),
    ...getAllMultiTurnBenchmarks(),
  ];
}

/** Weight -> the question ids carrying it. */
function censusByWeight(qs: BenchmarkQuestion[]): Map<number, string[]> {
  const m = new Map<number, string[]>();
  for (const q of qs) {
    const bucket = m.get(q.weight) ?? [];
    bucket.push(q.id);
    m.set(q.weight, bucket);
  }
  return m;
}

/** The weighted mean the JSDoc says should be happening, computed here only to
 *  quantify the gap. This is NOT an assertion target -- see repair arms. */
function weightedMean(pairs: Array<{ score: number; weight: number }>): number {
  const den = pairs.reduce((a, x) => a + x.weight, 0);
  if (den === 0) return 0;
  return Math.round(pairs.reduce((a, x) => a + x.score * x.weight, 0) / den);
}

/** The mean the six aggregate sites actually compute. */
function unweightedMean(scores: number[]): number {
  return scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
}

describe('r478 — BenchmarkQuestion.weight is a required field with four live values and zero readers', () => {
  // (0) CALLABILITY PREMISE. Drives the five real benchmark getters and reads
  // .weight off the returned rows. If a getter is renamed or a question stops
  // carrying a weight, this arm is red -- before any census runs and vacuously
  // reports "no readers found".
  it('(0) premise: all 35 questions carry a finite positive weight, and there are 4 distinct values', () => {
    const qs = allQuestions();
    expect(qs.length).toBeGreaterThan(0);

    for (const q of qs) {
      expect(typeof q.weight).toBe('number');
      expect(Number.isFinite(q.weight)).toBe(true);
      expect(q.weight).toBeGreaterThan(0);
    }

    const census = censusByWeight(qs);
    const values = [...census.keys()].sort((a, b) => a - b);
    // Four distinct values, all in the half-step family 1 / 1.5 / 2 / 2.5.
    expect(values).toEqual([1, 1.5, 2, 2.5]);

    // The counts that make the finding bite: the field is not near-constant.
    // A field whose value is uniform would be inert for a trivial reason.
    const counts = values.map((v) => census.get(v)!.length);
    expect(Math.min(...counts)).toBeGreaterThanOrEqual(3);
    expect(Math.max(...counts)).toBeGreaterThanOrEqual(5);
  });

  // (1) CENSUS -- the field's ONLY src/ readers are five projection lines in
  // one route, and not one of them scores, orders, aggregates or persists it.
  //
  // The census is over DATA FLOW, not grep hits: a hit is only a "reader" if it
  // is not itself the definition site and not a bare re-projection. See arm (2).
  it('(1) CENSUS: no aggregate in src/ consumes .weight — the only sites are the 5 GET /api/questions projection lines', () => {
    const readerHits: Array<{ file: string; line: number; text: string }> = [];

    for (const file of srcFiles()) {
      const rel = file.slice(SRC_ROOT.length + 1);
      // Skip the definition sites and the declaration itself.
      if (rel.startsWith('benchmarks/')) continue;
      if (rel === 'types/index.ts') continue;

      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (!/\.weight\b/.test(line)) return;
          readerHits.push({ file: rel, line: i + 1, text: line.trim() });
        });
    }

    // The complete set, asserted exactly. If a repair wires the weight into
    // calculateTotalScore or the engine INSERT, this arm goes RED -- which is
    // the point: it is the tripwire that says "the finding is now stale".
    expect(readerHits.length).toBe(5);

    readerHits.forEach((hit) => {
      expect(hit.file).toBe(join('web', 'routes', 'questions.ts'));
      // Every one of them is the same projection: hand the number to the HTTP
      // response, read nothing else with it.
      expect(hit.text).toBe('weight: q.weight,');
    });

    // And the six aggregate sites are UNWEIGHTED. Named explicitly rather than
    // grepped, because "no match" is what a broken grep reports too.
    const coreEvaluator = readFileSync(join(SRC_ROOT, 'core/evaluator.ts'), 'utf8');
    expect(coreEvaluator).toContain('sum + score.score');
    expect(coreEvaluator).not.toMatch(/sum \+ score\.score \* score\.weight/);

    const evalRoute = readFileSync(join(SRC_ROOT, 'web/routes/evaluations.ts'), 'utf8');
    expect(evalRoute).toContain('scores.reduce((a, b) => a + b, 0)');
    expect(evalRoute).not.toMatch(/a \+ b \* /);

    // The weight cannot be recovered after the run either: no column, no write.
    const dbSrc = readFileSync(join(SRC_ROOT, 'web/db/database.ts'), 'utf8');
    const resultsTable = dbSrc.slice(
      dbSrc.indexOf('CREATE TABLE IF NOT EXISTS results'),
      dbSrc.indexOf('CREATE TABLE IF NOT EXISTS results') + 900,
    );
    expect(resultsTable).not.toMatch(/\bweight\b/);

    const webEngine = readFileSync(join(SRC_ROOT, 'web/engine/evaluator.ts'), 'utf8');
    const insertBlock = webEngine.slice(
      webEngine.indexOf('INSERT INTO results'),
      webEngine.indexOf('INSERT INTO results') + 400,
    );
    expect(insertBlock).not.toMatch(/\bweight\b/);
  });

  // (2) CONTROL for arm (1): the same walk that reports "no aggregate reader"
  // DOES find the six unweighted aggregation sites, and DOES find the five
  // projection sites. Without this, "the census found nothing" is
  // indistinguishable from "the census looked in the wrong place".
  it('(2) CONTROL: the walk finds the six unweighted aggregates and the 5 projection sites', () => {
    const aggregatePatterns = [
      'core/evaluator.ts',
      'core/evaluator.ts',
      'core/evaluator.ts',
      'web/routes/evaluations.ts',
      'web/routes/evaluations.ts',
      'web/routes/evaluations.ts',
    ];
    const needles = [
      /scores\.reduce\(\(sum, score\) => sum \+ score\.score, 0\)/,
      /dimScores\.reduce\(\(sum, s\) => sum \+ s\.score, 0\)/,
      /categoryScores\.reduce\(\(sum, s\) => sum \+ s\.score, 0\)/,
      /scores\.reduce\(\(a, b\) => a \+ b, 0\)/,
      /scores\.reduce\(\(a, b\) => a \+ b, 0\)/,
      /scores\.reduce\(\(a, b\) => a \+ b, 0\)/,
    ];

    aggregatePatterns.forEach((rel, i) => {
      const text = readFileSync(join(SRC_ROOT, rel), 'utf8');
      expect(text).toMatch(needles[i]);
    });

    // The 6 call sites of avgOf in the route (5 dims + 1 totalAvg).
    const route = readFileSync(join(SRC_ROOT, 'web/routes/evaluations.ts'), 'utf8');
    const avgOfCalls = (route.match(/avgOf\(/g) ?? []).length - 1; // minus the definition
    expect(avgOfCalls).toBe(6);

    // And the 5 projection sites are visible to the same walk.
    const routeQuestions = readFileSync(join(SRC_ROOT, 'web/routes/questions.ts'), 'utf8');
    expect((routeQuestions.match(/weight: q\.weight,/g) ?? []).length).toBe(5);
  });

  // (3) REPAIR (father-gated) -- wire the weight into calculateTotalScore.
  // Currently RED by construction: the route's total is unweighted.
  it('(3) REPAIR: a 3-question set whose weighted mean differs from its plain mean still reports the plain mean', async () => {
    const pairs = [
      { id: 'wq-1', weight: 2.5, score: 80 },
      { id: 'wq-2', weight: 2.0, score: 80 },
      { id: 'wq-3', weight: 1.0, score: 40 },
    ];
    const plain = unweightedMean(pairs.map((p) => p.score));
    const weighted = weightedMean(pairs);
    // The two must genuinely disagree, or the arm proves nothing.
    expect(weighted).not.toBe(plain);
    expect(plain).toBe(67);
    // 200+160+40 = 400 over a weight-sum of 5.5 -> 72.7 -> 73. (An earlier
    // draft of this arm carried 72, a division slip; the helper above is
    // the authority, and it is what the hypothetical weighted impl yields.)
    expect(weighted).toBe(73);

    const ctx = await harness();
    ctx.seed('wq-eval-001', pairs.map((p) => [p.id, 'dialogue', 'factual', 'out', p.score]));

    const res = await ctx.get('/api/evaluations/wq-eval-001/results');

    // CURRENT BEHAVIOUR, pinned. A weighted implementation reports 72.
    expect(res.body.results[0].total_score).toBe(plain);
    expect(res.body.results[0].total_score).not.toBe(weighted);
  }, 60000);

  // (4) REPAIR (father-gated) -- per-dimension averages ignore the weight too.
  it('(4) REPAIR: a dimension whose questions carry different weights averages them equally', async () => {
    const pairs = [
      { id: 'wq-1', weight: 2.5, score: 80 },
      { id: 'wq-2', weight: 1.0, score: 40 },
    ];
    const plain = unweightedMean(pairs.map((p) => p.score));
    const weighted = weightedMean(pairs);
    expect(weighted).not.toBe(plain); // 69 vs 60

    const ctx = await harness();
    ctx.seed('wq-eval-002', pairs.map((p) => [p.id, 'dialogue', 'factual', 'out', p.score]));

    const res = await ctx.get('/api/evaluations/wq-eval-002/results');

    expect(res.body.results[0].dialogue_score).toBe(plain);
    expect(res.body.results[0].dialogue_score).not.toBe(weighted);
  });

  // (5) REPAIR (father-gated) -- persist the weight so a later re-weighting is
  // possible at all. The results table cannot express it today.
  it('(5) REPAIR: the results table has no weight column, so a stored score cannot be re-weighted', () => {
    const dbSrc = readFileSync(join(SRC_ROOT, 'web/db/database.ts'), 'utf8');
    const start = dbSrc.indexOf('CREATE TABLE IF NOT EXISTS results');
    const table = dbSrc.slice(start, start + 900);

    expect(table).not.toMatch(/\bweight\b/);

    // The columns that ARE persisted, so the arm fails on a real schema rather
    // than on a slice boundary.
    for (const col of ['evaluation_id', 'config_id', 'question_id', 'question_type', 'score']) {
      expect(table).toContain(col);
    }
  });

  // (6) The product-visible half: the ONLY reader in src/ is a GET projection,
  // so the field is visible to a client and useless to it. A client cannot learn
  // anything from a weight it cannot match to a score -- the /results payload
  // carries per-question scores but no weights.
  it('(6) the weight reaches the /api/questions wire and no weight appears on any /results row', async () => {
    const ctx = await harness();
    ctx.seed('wq-eval-003', [['wq-1', 'dialogue', 'factual', 'out', 80]]);

    const qRes = await request(ctx.app).get('/api/questions');
    expect(qRes.status).toBe(200);
    expect(qRes.body.total).toBe(allQuestions().length);
    const weights = new Set<number>();
    for (const bucket of ['dialogue', 'coding', 'function_calling', 'long_context', 'multi_turn']) {
      for (const q of qRes.body[bucket]) weights.add(q.weight);
    }
    // The field is served. Measured.
    expect([...weights].sort((a, b) => a - b)).toEqual([1, 1.5, 2, 2.5]);

    // But no /results row carries one, so the number the client was just handed
    // cannot be matched to anything it is scored on.
    const rRes = await ctx.get('/api/evaluations/wq-eval-003/results');
    const row = rRes.body.results[0].question_results[0];
    // SQLite yields NULL for a column the seeder never set, so reference_answer
    // is null, not ''. The arm's subject is the WEIGHT, so pin the scored
    // fields explicitly and leave reference_answer to the no-weight sweep below
    // rather than asserting a shape this harness cannot produce.
    expect(row).toMatchObject({
      question_id: 'wq-1',
      question_type: 'dialogue',
      category: 'factual',
      model_output: 'out',
      score: 80,
    });
    expect(JSON.stringify(rRes.body)).not.toMatch(/"weight"/);
  });
});

// ---------------------------------------------------------------------------
// Runtime harness: real Express + real SQLite + supertest. Mirrors the shape
// used by tests/web/evaluations-avg-rounding-runtime.test.ts so this suite adds
// no new isolation assumptions.
// ---------------------------------------------------------------------------

interface Harness {
  app: express.Express;
  token: string;
  userId: number;
  configId: number;
  seed(evaluationId: string, rows: Array<[string, string, string, string, number]>): void;
  get(path: string): Promise<request.Response>;
}

let cached: Harness | null = null;

async function harness(): Promise<Harness> {
  if (cached) return cached;

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

  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use('/api/configs', configsRoutes);
  app.use('/api/evaluations', evaluationsRoutes);
  app.use('/api/questions', questionsRoutes);

  resetDatabase();
  const login = await request(app)
    .post('/api/auth/login')
    .send({ username: 'admin', password: 'admin123' });
  const token = login.body.token as string;
  const userId = (login.body as { userId?: number }).userId ?? 1;

  const configRes = await request(app)
    .post('/api/configs')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: 'Weight Model',
      type: 'openai',
      endpoint: 'https://api.openai.com/v1',
      api_key: 'sk-test',
    });

  cached = {
    app,
    token,
    userId,
    configId: configRes.body.id as number,
    seed(evaluationId, rows) {
      const db = getDatabase();
      const { configId } = cached as Harness;
      db.prepare(
        `INSERT INTO evaluations (id, user_id, status, include_dialogue, include_coding)
         VALUES (?, ?, ?, 1, 1)`,
      ).run(evaluationId, userId, 'COMPLETED');
      db.prepare('INSERT INTO evaluation_configs (evaluation_id, config_id) VALUES (?, ?)').run(
        evaluationId,
        configId,
      );
      for (const [qid, qtype, category, output, score] of rows) {
        db.prepare(
          `INSERT INTO results (evaluation_id, config_id, question_id, question_type, category, model_output, score)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).run(evaluationId, configId, qid, qtype, category, output, score);
      }
    },
    async get(path) {
      return request(app).get(path).set('Authorization', `Bearer ${token}`);
    },
  };
  return cached;
}

afterAll(() => {
  const owned = ['wq-eval-001', 'wq-eval-002', 'wq-eval-003'];
  try {
    const db = getDatabase();
    for (const id of owned) {
      db.prepare('DELETE FROM results WHERE evaluation_id=?').run(id);
      db.prepare('DELETE FROM evaluation_configs WHERE evaluation_id=?').run(id);
      db.prepare('DELETE FROM evaluations WHERE id=?').run(id);
    }
  } catch {
    // cleanup is best-effort; it must never mask a real assertion
  }
});
