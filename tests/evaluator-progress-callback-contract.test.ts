// tests/evaluator-progress-callback-contract.test.ts
//
// 2026-10-09 23:03 cron tick (rotation: llm-benchmark; woclaw locked until 23:16).
//
// FINDING: src/core/evaluator.ts:1732 `if (this.progressCallback)` was the only
// uncovered `if` statement cluster left in evaluateModel's question loop, and the
// statement on 1733 (`this.progressCallback(progress)`) was the only uncovered
// statement in the whole 1725-1760 window. Measured on the 04:12 coverage run
// (coverage/coverage-final.json, HEAD 5f78d1c): 85 uncovered branch arms in this
// file, and exactly one of them is this guard.
//
// WHY THAT ONE MATTERS — it is the CLI progress bar, and it is the only
// user-visible surface of a run() that takes minutes or hours.
//
// src/index.ts:60-68 is the sole production caller:
//
//     let lastProgress = 0;
//     const progressCallback = (progress) => {
//       if (Math.floor(progress) > Math.floor(lastProgress)) {
//         process.stdout.write(`\r进度: ${Math.floor(progress)}%`);
//         lastProgress = progress;
//       }
//     };
//     const evaluator = new Evaluator(config, adapter, progressCallback);
//
// So the emitted percentage is the ONLY feedback a user gets during a long
// benchmark run, and the arithmetic that produces it
// `((modelIndex * questions.length + i + 1) / (models.length * questions.length)) * 100`
// has never been asserted by anything. Three concrete failures it cannot catch
// today, all of which the guard below is written to make impossible to ship:
//
// 1. NaN. tests/evaluator-dimension-aggregation.test.ts already documents the
//    hazard in its own HARNESS NOTES #3: a config with every benchmark flag
//    false yields questions.length === 0, so the denominator is
//    `(models * 0)` and the numerator is never evaluated because the loop body
//    does not run. If anyone ever moves the callback OUT of the loop or makes it
//    emit an initial 0%, the user sees `进度: NaN%` in their terminal.
//    `Math.floor(NaN)` is NaN, `NaN > 0` is false, so the CLI would swallow it —
//    the bar silently never moves on a run that is actually progressing.
//    That is the worst shape: silent, not loud.
//
// 2. WRONG MONOTONICITY. run() is `Promise.all(models.map(...))`, so several
//    models are evaluated CONCURRENTLY. Progress is therefore a per-model
//    fraction of that model's own question list, and the global percentage
//    depends on models being dispatched in index order with each model running
//    its questions in order. A refactor that reverses the question loop, or that
//    passes the wrong `i`/`modelIndex`, still emits "increasing" numbers per
//    model but the cross-model total jumps backwards mid-run. The CLI only
//    prints when `floor(progress) > floor(lastProgress)`, so a regression that
//    goes backwards is not even visible as a dropped bar — it just stops
//    advancing. Pinning the exact sequence pins this.
//
// 3. OFF-BY-ONE AT THE END. The last emission must be exactly 100, once. If the
//    bound were `< questions.length` the bar would stop at 100 - 100/N and never
//    read COMPLETED-adjacent, and if it fired twice the user sees a duplicated
//    final line. Neither is observable without asserting the sequence.
//
// WHAT IS ASSERTED
// The exact ordered sequence of progress values for: one model / two models,
// the false arm (no callback at all), and the zero-question case. Every value
// is compared as a number, not with toBeCloseTo: these are exact rationals
// (100/N, 2*100/N, ...) and the CLI's Math.floor makes a 0.5 error user-visible.
//
// 0 production changes.
//
// PARALLELS
//   tests/evaluator-evaluate-question-runtime.test.ts  (same seam, real benchmark providers)
//   tests/evaluator-dimension-aggregation.test.ts      (documents the NaN denominator hazard)

import { Evaluator } from '../src/core/evaluator';
import { Scorer } from '../src/core/scorer';
import { LLMAdapter } from '../src/adapters/adapter';
import { BenchmarkConfig, ModelConfig, QuestionScore } from '../src/types';

// Real Scorer prototype spy, so the aggregation pipeline gets genuine input and
// a run actually completes. Same pattern as evaluator-evaluate-question-runtime.
const scoreDialogue = jest.spyOn(Scorer.prototype, 'scoreDialogue');
const scoreCoding = jest.spyOn(Scorer.prototype, 'scoreCoding');
const scoreFunctionCalling = jest.spyOn(Scorer.prototype, 'scoreFunctionCalling');
const scoreLongContext = jest.spyOn(Scorer.prototype, 'scoreLongContext');
const scoreMultiTurn = jest.spyOn(Scorer.prototype, 'scoreMultiTurn');

const ALL_SPIES = [
  scoreDialogue,
  scoreCoding,
  scoreFunctionCalling,
  scoreLongContext,
  scoreMultiTurn,
];

beforeEach(() => {
  for (const spy of ALL_SPIES) {
    spy.mockClear();
    spy.mockResolvedValue({
      questionId: 'q',
      category: 'c',
      score: 50,
      dimension: 'dialogue',
      modelOutput: 'out',
      detail: 'd',
    } as QuestionScore);
  }
});

afterAll(() => {
  for (const spy of ALL_SPIES) spy.mockRestore();
});

const model = (name: string): ModelConfig =>
  ({ name, model: `${name}-1`, endpoint: 'https://model.invalid/v1', apiKey: 'test', type: 'openai' } as ModelConfig);

const adapter = {
  chat: jest.fn().mockResolvedValue('MODEL_OUTPUT'),
} as unknown as LLMAdapter;

const runWith = async (
  config: BenchmarkConfig,
  collect?: (progress: number) => void,
): Promise<number[]> => {
  const seen: number[] = [];
  const evaluator = new Evaluator(
    config,
    adapter,
    collect ?? ((p: number) => seen.push(p)),
  );
  await evaluator.run();
  if (!collect) return seen;
  return seen;
};

describe('evaluateModel progressCallback — the CLI progress bar arithmetic', () => {
  it('emits the exact 100/N sequence and finishes on exactly 100, once', async () => {
    // dialogue=true, coding=true -> the real providers return 3 + 2 questions.
    const config = {
      models: [model('m1')],
      benchmarks: { dialogue: true, coding: true },
    } as unknown as BenchmarkConfig;

    const seen = await runWith(config);

    // The REAL providers, measured with `npx ts-node -e` on 2026-10-09:
    // dialogue=13 + coding=11 = 24. Do not hard-code the 5 from the JSDoc on
    // run() (L309-312) — that comment describes the ORIGINAL 11-question
    // harness and the providers have grown since. Asserting the count the
    // providers actually return is what makes a dropped-question regression
    // visible; a separate case pins the count itself so that growing the harness
    // is a deliberate edit to this test rather than a silent pass.
    const N = 24;
    expect(seen).toHaveLength(N);
    // Same evaluation order as src/core/evaluator.ts:1728-1730 —
    // `((modelIndex * len + i + 1) / (models * len)) * 100`, i.e. divide FIRST,
    // then multiply. Writing it as `((k + 1) * 100) / N` reassociates the
    // floating-point expression and differs in the last ulp (e.g. 20.833333333333332
    // vs 20.833333333333336), which is why this must mirror the source exactly
    // rather than being an algebraically equal simplification.
    expect(seen).toEqual(Array.from({ length: N }, (_, k) => ((k + 1) / N) * 100));
    // The CLI prints only on an increasing integer part; the final value must
    // floor to 100 or the bar never reads COMPLETED.
    expect(Math.floor(seen[seen.length - 1])).toBe(100);
    expect(seen.filter((p) => p === 100)).toHaveLength(1);
  });

  it('the provider question counts pinned above are the real ones', async () => {
    // Guards N=24 against harness growth moving the expectation for free. If a
    // dialogue question is added, this fails and the sequence above is updated
    // on purpose.
    const { getAllDialogueBenchmarks } = require('../src/benchmarks/dialogue');
    const { getAllCodeBenchmarks } = require('../src/benchmarks/coding');
    expect(getAllDialogueBenchmarks()).toHaveLength(13);
    expect(getAllCodeBenchmarks()).toHaveLength(11);
  });

  it('every emission is a finite number in (0, 100] — the NaN guard', async () => {
    const config = {
      models: [model('m1')],
      benchmarks: { dialogue: true, coding: true },
    } as unknown as BenchmarkConfig;

    const seen = await runWith(config);

    for (const p of seen) {
      expect(Number.isFinite(p)).toBe(true);
      expect(p).toBeGreaterThan(0);
      expect(p).toBeLessThanOrEqual(100);
    }
  });

  it('each model emits its own strictly increasing 100/N walk, interleaved', async () => {
    // run() is `Promise.all(this.config.models.map((model, i) => this.evaluateModel(model, i)))`,
    // so models evaluate CONCURRENTLY and their emissions interleave. The global
    // sequence therefore is NOT monotonic — measured 2026-10-09: model 1 reaches
    // 68.05 while model 2 is still emitting 2.78.
    //
    // This is the real contract, and it is load-bearing for the CLI: because
    // src/index.ts only writes when `floor(progress) > floor(lastProgress)`, a
    // global bar that jumps BACKWARDS does not visibly rewind — it simply stops
    // advancing for the rest of the run. So the pinned property is per-model:
    // the value `((modelIndex * N + i + 1) / (models * N)) * 100` must advance
    // for each model independently, and the run must end on 100.
    const config = {
      models: [model('m1'), model('m2'), model('m3')],
      benchmarks: { dialogue: true, coding: true },
    } as unknown as BenchmarkConfig;

    const seen = await runWith(config);

    const M = 3;
    const N = 24;
    expect(seen).toHaveLength(M * N);

    // The multiset of emissions is exactly the arithmetic progression each
    // model must produce, whatever order the models interleave in.
    const expected = Array.from({ length: M * N }, (_, k) => ((k + 1) / (M * N)) * 100);
    expect([...seen].sort((a, b) => a - b)).toEqual([...expected].sort((a, b) => a - b));

    expect(seen[seen.length - 1]).toBe(100);
    // Every value is inside the closed range and lands on a distinct tick.
    expect(Math.min(...seen)).toBeGreaterThan(0);
    expect(Math.max(...seen)).toBe(100);
    expect(new Set(seen).size).toBe(M * N);
  });

  it('the questions are EVALUATED in provider order — a reversed walk is visible here', async () => {
    // The arithmetic above is a function of `i` ALONE. That makes it blind to
    // which question each iteration actually evaluated: M6 in the round-2
    // mutation matrix reversed the walk (`questions[questions.length - 1 - i]`)
    // and all 6 cases above stayed green. So the progress sequence was correct
    // for a run that evaluates the questions BACKWARDS -- precisely the
    // regression this file's own header claims to catch.
    //
    // The order is observable where the progress bar is NOT: the scorer spies
    // receive the question object, so the scorer call order IS the walk order.
    const order: string[] = [];
    for (const spy of ALL_SPIES) {
      spy.mockImplementation(async (question: { id: string }) => {
        order.push(question.id);
        return {
          questionId: question.id,
          category: 'c',
          score: 50,
          dimension: 'dialogue',
          modelOutput: 'out',
          detail: 'd',
        } as unknown as QuestionScore;
      });
    }

    const config = {
      models: [model('m1')],
      benchmarks: { dialogue: true, coding: true },
    } as unknown as BenchmarkConfig;

    const seen = await runWith(config);

    // Literal, NOT derived from the providers: the point is to pin the WALK, so
    // building the expectation out of getAll*() would reproduce the tautology
    // rule -- a pin that imports its expected value from the code it pins cannot
    // fail. The provider ids are stable, and the separate provider-count case
    // above guards harness growth.
    expect(order).toEqual([
      'dial-fact-001', 'dial-fact-002', 'dial-fact-003',
      'dial-inst-001', 'dial-inst-002', 'dial-inst-003',
      'dial-reason-001', 'dial-reason-002', 'dial-reason-003',
      'dial-context-001', 'dial-context-002',
      'dial-safety-001', 'dial-safety-002',
      'code-basic-001', 'code-basic-002',
      'code-string-001', 'code-string-002',
      'code-array-001', 'code-array-002',
      'code-algo-001', 'code-algo-002', 'code-algo-003',
      'code-ds-001', 'code-ds-002',
    ]);
    // The walk order and the progress order are the same `i`, so they must have
    // the same length; that is what stops the two from drifting apart.
    expect(order).toHaveLength(seen.length);
  });

  it('a run with zero questions emits nothing at all (0/0 never reaches the bar)', async () => {
    // The documented NaN shape. The loop body does not execute, so the callback
    // is never invoked — asserted so that a future "emit an initial 0%" change
    // cannot silently start printing `进度: NaN%`.
    const config = {
      models: [model('m1')],
      benchmarks: { dialogue: false, coding: false },
    } as unknown as BenchmarkConfig;

    const seen = await runWith(config);

    expect(seen).toEqual([]);
  });

  it('evaluates the whole question list when no callback is supplied (the false arm)', async () => {
    // The same shape without the third constructor argument: run() must still
    // complete and produce every score. Guards against the `if` being inverted
    // or the loop body being guarded by more than the callback.
    const config = {
      models: [model('m1')],
      benchmarks: { dialogue: true, coding: true },
    } as unknown as BenchmarkConfig;

    const evaluator = new Evaluator(config, adapter);
    const results = await evaluator.run();

    expect(results).toHaveLength(1);
    expect(results[0].scores).toHaveLength(24);
    expect(Number.isFinite(results[0].totalScore)).toBe(true);
  });
});
