/**
 * R537 -- the EXTERNAL-BENCHMARK plane: a score that reaches the report's
 * own data array but moves NONE of the report's numbers.
 *
 * R519 / R522 / R524 / R526 / R528 / R531 / R532 / R533 / R535 audited the
 * per-dimension SCORERS. R535's F3 noticed that the declared per-question
 * `weight` is never read by any aggregation. R537 steps back one level and
 * asks a different question: when an EXTERNAL benchmark (one of the 12
 * `dispatchExternalCall` sites) returns a score, does that score reach the
 * PUBLISHED aggregates at all?
 *
 * WHAT WAS MEASURED (through the real production classes -- the real
 * `Evaluator`, the real `dispatchExternalCall` / `dispatchV050External`, the
 * real `Reporter`, a real local HTTP server answering the external payloads;
 * nothing re-implements the dispatch or the aggregation):
 *
 *   F1  THE EXTERNAL SCORE IS APPENDED AFTER THE AGGREGATES ARE COMPUTED.
 *       `Evaluator.evaluateModel()` computes `totalScore` and `dimensions`
 *       from the scores it collected, and RETURNS. Only afterwards does
 *       `run()` call `dispatchExternalCall(...)`, which does
 *       `result.scores.push(score)`. The pushed score is therefore in
 *       `scores[]` -- and in the JSON report -- but it was never an input to
 *       `calculateTotalScore` / `calculateDimensions`.
 *
 *       MEASURED, with a PERFECT external score (elo_score 1000,
 *       pass_rate 1 -> normalised 100):
 *
 *         scores[]                     = 15  (13 dialogue + webdev_arena + cyberseceval3)
 *         dimensions.dialogue.count    = 13  average 85
 *         dimensions.coding.count      =  0  average 0     <-- the webdev_arena
 *                                                                  score IS in
 *                                                                  scores[] with
 *                                                                  dimension='coding'
 *         published totalScore         = 85
 *         mean over the FINAL scores[] = 87   <-- a consumer of scores[]
 *                                                   computes a DIFFERENT number
 *                                                   than the report publishes
 *
 *       The sharpest form: TWO models, one scoring 100 on the external
 *       benchmark and one scoring 0, produce the SAME published totalScore
 *       and therefore the SAME published ranking. The external benchmark is
 *       decorative -- it can never change the answer the tool exists to give.
 *
 *   F2  THE `safety` DIMENSION HAS NOWHERE TO GO. `QuestionScore.dimension`
 *       admits `'safety'`, and the cyberseceval3 fetcher stamps it on every
 *       score it returns -- but `DimensionScore` has FIVE keys
 *       (dialogue / coding / function_calling / long_context / multi_turn)
 *       and `DIM_HEADERS` lists the same five. There is no `safety` key and
 *       no safety column. So even if the aggregates were recomputed after
 *       the dispatch, the safety score would STILL have no home: it would
 *       be silently dropped rather than reported.
 *
 *   F3  THE REPORTED QUESTION COUNT COUNTS BENCHMARKS, NOT QUESTIONS.
 *       `Reporter` publishes `stats.totalQuestions = results[0].scores.length`
 *       and the Markdown prints `总评测题数: <that>`, and the CSV's last
 *       column is `r.scores.length`. With two external benchmarks enabled
 *       the report claims 15 questions were asked when 13 were.
 *
 * WHY THIS IS A MIGRATION GAP, NOT GREENFIELD
 *
 * The mechanism -- "a score produced by a remote evaluator must reach the
 * aggregate" -- is not novel. It is the ordinary contract of every harness
 * that composes external evaluators:
 *   * OpenAI Evals (openai/evals) -- `Eval` results are merged into the
 *     run's aggregate view; a registered eval that does not appear in the
 *     results table is a wiring bug.
 *   * lm-evaluation-harness (EleutherAI/lm-evaluation-harness) -- a
 *     `task` contributes its metric to the run's `results` dict; the
 *     harness's own `make_table` renders the union.
 *   * HELM (stanford-crfm/helm) -- a `Scenario` produces a `Metric`; the
 *     run's `Run` object aggregates metrics across scenarios, and the
 *     leaderboard reads that aggregate.
 *   * promptfoo (promptfoo/promptfoo) -- providers and assertions are
 *     folded into one evaluation row set.
 * So the mechanism is solved in adjacent work; this harness implements the
 * pre-aggregation version, where the external score is appended to a
 * finished array. Reporting this as greenfield would be wrong.
 *
 * WHAT THIS SUITE DOES AND DOES NOT DO
 *
 * Ships: a test-only suite that PINS the observed (defective) behaviour, so
 * that when a repair is decided, each candidate arm turns RED and the
 * decision stays visible.
 *
 * Does NOT ship: any production change. Each repair is a product decision
 * (per docs/PROJECT-GOVERNANCE.md, cross-cutting changes that touch scoring
 * or benchmark dimensions need a design note before code):
 *   - should the aggregates be recomputed after the dispatch, or should the
 *     dispatch happen BEFORE `evaluateModel` returns (ordering)?
 *   - should `safety` become a sixth published dimension (schema change,
 *     new report column), or should cyberseceval3's score be stamped
 *     `dimension: 'coding'`/`'long_context'` like its eight siblings?
 *   - should the published question count exclude external benchmark
 *     scores, or should the external scores be reported in a separate
 *     "external benchmarks" section?
 *
 * All three are father-gated. This round delivers THE MEASUREMENT ONLY.
 */
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

import { Evaluator } from '../src/core/evaluator';
import { Reporter, DIM_HEADERS } from '../src/core/reporter';
import type { LLMAdapter } from '../src/adapters/adapter';
import type { BenchmarkConfig, ModelConfig } from '../src/types';

const REPO_ROOT = path.join(__dirname, '..');
const EVALUATOR_PATH = path.join(REPO_ROOT, 'src', 'core', 'evaluator.ts');
const REPORTER_PATH = path.join(REPO_ROOT, 'src', 'core', 'reporter.ts');
const TYPES_PATH = path.join(REPO_ROOT, 'src', 'types', 'index.ts');

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const mkModel = (name: string): ModelConfig => ({
  name,
  type: 'openai',
  endpoint: 'http://localhost:1/v1',
  apiKey: 'test-key',
  model: name,
});

/**
 * A real HTTP server that answers the external-benchmark payloads.  The
 * server reads `model_id` out of the request body so it can give the GOOD
 * model a perfect score and the BAD model a zero score -- that is what
 * makes the ranking arm meaningful.
 */
function startExternalServer(): Promise<{ port: number; close: () => void }> {
  return new Promise((resolve) => {
    // Track the sockets: Node's `server.close()` only stops accepting new
    // connections, it does NOT tear down the keep-alive sockets the fetcher
    // opened.  Leaving them open keeps the event loop alive and jest then
    // hangs past the 10s timeout -- a HARNESS artefact that has nothing to
    // do with the product.  `closeAllConnections()` is the fix.
    const sockets = new Set<import('net').Socket>();
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        let modelId = '';
        try {
          modelId = String((JSON.parse(body) as { model_id?: string }).model_id ?? '');
        } catch {
          modelId = '';
        }
        res.setHeader('Content-Type', 'application/json');
        if (body.includes('risk_categories')) {
          // CyberSecEval3 payload: safety_score 0-100 + coverage_rate 0-1.
          res.end(
            JSON.stringify(
              modelId.includes('good')
                ? { safety_score: 100, coverage_rate: 1, eval_id: 'r537' }
                : { safety_score: 0, coverage_rate: 0, eval_id: 'r537' },
            ),
          );
        } else {
          // webdev_arena payload: elo_score 0-1000 + pass_rate 0-1.
          res.end(
            JSON.stringify(
              modelId.includes('good')
                ? { elo_score: 1000, pass_rate: 1, eval_id: 'r537' }
                : { elo_score: 0, pass_rate: 0, eval_id: 'r537' },
            ),
          );
        }
      });
    });
    server.on('connection', (s) => {
      sockets.add(s);
      s.on('close', () => sockets.delete(s));
    });
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port;
      resolve({
        port,
        close: () => {
          for (const s of sockets) s.destroy();
          sockets.clear();
          server.close();
        },
      });
    });
  });
}

/**
 * The judge answers "85" when it is asked to score; the subject answers
 * "ANSWER".  So the dialogue dimension has a real, non-zero, KNOWN score.
 */
function judgeAdapter(): LLMAdapter {
  return {
    chat: async (messages: Array<{ role: string; content: string }>) => {
      const content = String(messages?.[0]?.content ?? '');
      return content.includes('评分员') ? '85' : 'ANSWER';
    },
    ping: async () => true,
    getName: () => 'r537-judge',
  } as unknown as LLMAdapter;
}

function configWith(
  models: ModelConfig[],
  port: number,
  benchmarks: Partial<BenchmarkConfig['benchmarks']> = {},
): BenchmarkConfig {
  return {
    models,
    benchmarks: {
      dialogue: true,
      coding: false,
      function_calling: false,
      long_context: false,
      multi_turn: false,
      ...benchmarks,
    },
    _external_benchmarks_roadmap: {
      webdev_arena: { enabled: true, api_base: `http://127.0.0.1:${port}/eval` },
      cyberseceval3: { enabled: true, api_base: `http://127.0.0.1:${port}/cse3` },
    },
  } as unknown as BenchmarkConfig;
}

const isExternal = (questionId: string): boolean =>
  /^(webdev_arena|cyberseceval3)_/.test(questionId);

const meanOf = (xs: number[]): number =>
  xs.length === 0 ? 0 : Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);

// ---------------------------------------------------------------------------

describe('R537 -- the external-benchmark plane', () => {
  describe('F1 -- the external score is appended AFTER the aggregates are computed', () => {
    it('arm A: a PERFECT external score is in scores[] but the coding dimension does not see it', async () => {
      const { port, close } = await startExternalServer();
      try {
        const ev = new Evaluator(configWith([mkModel('good-model')], port), judgeAdapter());
        const results = await ev.run();
        const r = results[0];

        const external = r.scores.filter((s) => isExternal(s.questionId));
        expect(external.length).toBe(2);
        // Both are PERFECT scores.
        for (const s of external) expect(s.score).toBe(100);

        // The webdev_arena score is stamped dimension='coding'.
        const coding = external.find((s) => s.dimension === 'coding');
        expect(coding).toBeDefined();
        expect(coding!.score).toBe(100);

        // ...and the published coding dimension has NOT seen it.
        expect(r.dimensions.coding.count).toBe(0);
        expect(r.dimensions.coding.average).toBe(0);
      } finally {
        close();
      }
    });

    it('arm A2: the safety score has no home in DimensionScore at all', async () => {
      const { port, close } = await startExternalServer();
      try {
        const ev = new Evaluator(configWith([mkModel('good-model')], port), judgeAdapter());
        const results = await ev.run();
        const r = results[0];

        const safety = r.scores.find((s) => s.dimension === 'safety');
        expect(safety).toBeDefined();
        expect(safety!.score).toBe(100);

        // The published dimension set has no `safety` key ...
        const dimKeys = Object.keys(r.dimensions);
        expect(dimKeys).not.toContain('safety');
        expect(dimKeys.sort()).toEqual(
          ['coding', 'dialogue', 'function_calling', 'long_context', 'multi_turn'].sort(),
        );
        // ... and the report has no safety column.
        expect(DIM_HEADERS.map((h) => h.key)).not.toContain('safety' as never);
        // The safety score is therefore invisible in the published report.
        //
        // SCOPED, not a blanket string search: `safety` IS also a CATEGORY
        // name (dial-safety-001 / dial-safety-002 carry category='safety'),
        // so `details.safety` exists and holds the dialogue-category average
        // of 85.  That is a different thing from the cyberseceval3 score, and
        // the sharp contrast is exactly the finding: the CATEGORY average is
        // published (85), while the external safety SCORE (100) appears
        // nowhere in the published dimensions.
        const details = r.dimensions.dialogue.details as Record<string, number>;
        expect(details.safety).toBe(85);
        const published = JSON.stringify(r.dimensions);
        expect(published).toContain('"safety":85');
        // The cyberseceval3 score of 100 is nowhere in the published
        // numbers.  Asserted STRUCTURALLY, not by a bare "100" substring:
        // `nResamples: 1000` contains "100", so a string search would be
        // measuring the bootstrap parameter, not the score.
        const dimTotals = Object.values(r.dimensions).map((d) => (d as { total: number }).total);
        // 13 dialogue scores at 85 = 1105, and NOTHING else.
        expect(dimTotals.reduce((a, b) => a + b, 0)).toBe(1105);
        expect(r.totalScore).toBe(85);
        // Every published dimension count is a COUNT OF IN-LOOP QUESTIONS.
        expect(Object.values(r.dimensions).map((d) => (d as { count: number }).count)).toEqual([13, 0, 0, 0, 0]);
      } finally {
        close();
      }
    });

    it('arm B: the report contradicts ITSELF -- scores[] averages to a different number than it publishes', async () => {
      const { port, close } = await startExternalServer();
      try {
        const ev = new Evaluator(configWith([mkModel('good-model')], port), judgeAdapter());
        const results = await ev.run();
        const r = results[0];

        // The dialogue dimension is computed correctly: 13 dialogue scores
        // at 85 -> average 85.  So the aggregator is NOT broken.
        const dialogue = r.scores.filter((s) => s.dimension === 'dialogue');
        expect(dialogue.length).toBe(13);
        expect(r.dimensions.dialogue.count).toBe(13);
        expect(r.dimensions.dialogue.average).toBe(85);
        expect(r.totalScore).toBe(85);

        // But the FINAL scores[] -- the array the JSON report publishes --
        // has 15 entries, two of them perfect.  A consumer of scores[]
        // computes 87, not the 85 the report publishes.
        expect(r.scores.length).toBe(15);
        expect(meanOf(r.scores.map((s) => s.score))).toBe(87);
        expect(r.totalScore).toBe(85);

        // The coding dimension is the sharpest case: its mean over the
        // scores[] that carry dimension='coding' is 100, and the published
        // average is 0.
        const codingScores = r.scores.filter((s) => s.dimension === 'coding');
        expect(meanOf(codingScores.map((s) => s.score))).toBe(100);
        expect(r.dimensions.coding.average).toBe(0);
      } finally {
        close();
      }
    });

    it('arm C: the external benchmark can NEVER change the published ranking', async () => {
      // The headline.  good-model scores 100 on the external benchmark and
      // bad-model scores 0 -- a maximal, 100-point difference -- and the
      // published ranking is IDENTICAL.
      const { port, close } = await startExternalServer();
      try {
        const models = [mkModel('good-model'), mkModel('bad-model')];
        const ev = new Evaluator(configWith(models, port), judgeAdapter());
        const results = await ev.run();

        const good = results.find((r) => r.modelName === 'good-model')!;
        const bad = results.find((r) => r.modelName === 'bad-model')!;

        const goodExternal = good.scores.find((s) => isExternal(s.questionId))!;
        const badExternal = bad.scores.find((s) => isExternal(s.questionId))!;
        expect(goodExternal.score).toBe(100);
        expect(badExternal.score).toBe(0);
        expect(Math.abs(goodExternal.score - badExternal.score)).toBe(100);

        // ...and the published numbers are identical.
        expect(good.totalScore).toBe(bad.totalScore);
        expect(good.dimensions.coding.average).toBe(bad.dimensions.coding.average);
        expect(good.dimensions.coding.count).toBe(bad.dimensions.coding.count);

        // The ranking table shows them tied.  Scope the filter to the
        // TABLE ROWS only -- a blanket `includes('good-model')` also catches
        // the `### good-model` DETAIL heading, which carries no total.
        const md = Reporter.generateMarkdown(results);
        const rankLines = md
          .split('\n')
          .filter((l: string) => l.startsWith('|') && (l.includes('good-model') || l.includes('bad-model')));
        expect(rankLines.length).toBe(2);
        for (const line of rankLines) {
          expect(line).toContain(String(good.totalScore));
        }
        // Both rows carry the SAME total -- the tie.
        const totalsInRows = rankLines.map((l) => l.split('|')[3]?.trim());
        expect(new Set(totalsInRows).size).toBe(1);

        // The external score does not even appear in the report text.
        expect(md).not.toContain('webdev_arena');
      } finally {
        close();
      }
    });

    it('arm C2: the external score is not published in ANY report format', async () => {
      const { port, close } = await startExternalServer();
      try {
        const ev = new Evaluator(configWith([mkModel('good-model')], port), judgeAdapter());
        const results = await ev.run();

        // Markdown: no mention of the benchmark, no mention of its score.
        const md = Reporter.generateMarkdown(results);
        expect(md).not.toContain('webdev_arena');
        expect(md).not.toContain('cyberseceval3');

        // CSV: the coding column is 0 even though a coding score of 100 is
        // in scores[].
        const csv = Reporter.generateCSV(results);
        const header = csv.split('\n')[0];
        const row = csv.split('\n')[1];
        expect(header.split(',')).toContain('coding');
        const codingCol = header.split(',').indexOf('coding');
        expect(row.split(',')[codingCol]).toBe('0');

        // JSON: the score IS there (scores[] is the whole result object),
        // which is exactly why the report is self-contradictory.
        const json = Reporter.generateJSON(results);
        expect(json.results[0].scores.length).toBe(15);
        expect(json.results[0].totalScore).toBe(85);
        expect(json.stats.totalQuestions).toBe(15);
      } finally {
        close();
      }
    });

    it('arm D: the published question count counts BENCHMARKS, not questions', async () => {
      const { port, close } = await startExternalServer();
      try {
        const ev = new Evaluator(configWith([mkModel('good-model')], port), judgeAdapter());
        const results = await ev.run();
        const r = results[0];

        const actuallyAsked = r.scores.filter((s) => !isExternal(s.questionId)).length;
        expect(actuallyAsked).toBe(13);

        // The report says 15.
        const md = Reporter.generateMarkdown(results);
        const reported = Number((md.match(/总评测题数\*\*: (\d+)/) || [])[1]);
        expect(reported).toBe(15);
        expect(reported).not.toBe(actuallyAsked);

        // The CSV's last column and the JSON stats carry the same inflated
        // number.
        const csv = Reporter.generateCSV(results);
        const row = csv.split('\n')[1];
        expect(row.split(',').pop()).toBe('15');
        expect(Reporter.generateJSON(results).stats.totalQuestions).toBe(15);
      } finally {
        close();
      }
    });

    it('arm E (negative control): the aggregation is NOT broken for in-loop scores', async () => {
      // The control for F1: the defect is ORDERING, not a broken aggregator.
      // With NO external benchmark enabled, the dialogue dimension is
      // correct and the external-score arms have nothing to say.
      const { port, close } = await startExternalServer();
      try {
        const config = {
          models: [mkModel('good-model')],
          benchmarks: {
            dialogue: true, coding: false, function_calling: false,
            long_context: false, multi_turn: false,
          },
        } as unknown as BenchmarkConfig;
        const ev = new Evaluator(config, judgeAdapter());
        const results = await ev.run();
        const r = results[0];

        expect(r.scores.length).toBe(13);
        expect(r.dimensions.dialogue.count).toBe(13);
        expect(r.dimensions.dialogue.average).toBe(85);
        expect(r.totalScore).toBe(85);
        // scores[] and the published total AGREE here -- because there is
        // nothing appended after the aggregate was computed.
        expect(meanOf(r.scores.map((s) => s.score))).toBe(r.totalScore);
      } finally {
        close();
      }
    });

    it('arm F: the source shape -- the aggregates are computed before the dispatch runs', () => {
      // The source-level shape of F1, pinned so the behaviour above and the
      // code that produces it cannot drift apart silently.
      const src = fs.readFileSync(EVALUATOR_PATH, 'utf8');

      // `evaluateModel` computes the aggregates and returns; `run()` calls
      // the dispatch AFTER `evaluateModel` has resolved.
      const evalModel = src.split('private async evaluateModel')[1]?.split('private')[0] ?? '';
      expect(evalModel).toContain('calculateTotalScore(scores)');
      expect(evalModel).toContain('calculateDimensions(scores)');

      const runBody = src.split('async run(')[1] ?? '';
      const resultsIdx = runBody.indexOf('this.evaluateModel(model, i)');
      const dispatchIdx = runBody.indexOf('this.dispatchExternalCall(');
      expect(resultsIdx).toBeGreaterThan(-1);
      expect(dispatchIdx).toBeGreaterThan(-1);
      // The dispatch comes after the models have been evaluated.
      expect(dispatchIdx).toBeGreaterThan(resultsIdx);

      // And the dispatch helper is the one that pushes onto scores[].
      expect(src).toContain('result.scores.push(score)');
    });

    it('arm G: the `safety` dimension is declared on QuestionScore but has no published home', () => {
      // The source-level shape of F2, pinned over a NON-VACUOUS subject set
      // (R421-1): both files must exist, or the negative assertions below
      // could go vacuously true by a rename.
      expect(fs.existsSync(TYPES_PATH)).toBe(true);
      expect(fs.existsSync(REPORTER_PATH)).toBe(true);

      const types = fs.readFileSync(TYPES_PATH, 'utf8');
      // QuestionScore.dimension admits 'safety'.
      const dimensionUnion = types.split('export interface QuestionScore')[1]?.split('}')[0] ?? '';
      expect(dimensionUnion).toContain("'safety'");

      // DimensionScore has no safety key.
      const dimScore = types.split('export interface DimensionScore')[1]?.split('export interface')[0] ?? '';
      expect(dimScore).not.toMatch(/^\s*safety\??:/m);

      // The reporter's column set has no safety column.
      const reporter = fs.readFileSync(REPORTER_PATH, 'utf8');
      const headers = reporter.split('DIM_HEADERS')[1]?.split(']')[0] ?? '';
      expect(headers).not.toContain("'safety'");
    });
  });
});
