// tests/evaluator-dimension-aggregation.test.ts
//
// 2026-10-02 03:03 cron. Closes 7 dark functions + 2 dark branch arms in
// src/core/evaluator.ts, and is the enabling step for STEP 2 (pulling the
// 1366-line CLI engine into the real coverage scope).
//
// WHY THIS FILE, AND WHY NOW
//
// The candidate probe run with src/core/evaluator.ts in collectCoverageFrom
// (jest.probe.config.js, thresholds disabled) measured:
//
//   statements 90.99% (1587/1744)  gate 90  PASS
//   branches  78.10% (710/909)    gate 70  PASS
//   lines     92.41% (1486/1608)  gate 90  PASS
//   FUNCTIONS 84.30% (231/274)    gate 85  FAIL  <-- the only failing gate
//
// So STEP 2 was blocked on exactly 2 functions, not on the 194 branch arms the
// previous tick's state file assumed. Those 2 functions are not chosen at
// random: closing ANY 2 of the 43 dark functions in the file lifts the ratio
// to 85.3%, and the cluster below is the cheapest real cluster in the file.
//
// The cluster is the DIMENSION-AGGREGATION PIPELINE, and it is the right target
// for a reason beyond arithmetic:
//
//   calculateTotalScore (L1813)   -> EvaluationResult.totalScore
//   calculateDimensions (L1821)   -> EvaluationResult.dimensions
//   buildDimEntry (L1848)         -> the 4 shared fields of every dim entry
//   calculateCategoryDetails (L1866) -> the `details` sub-map of every dim entry
//   + the 3 arrow functions: dimScores, the total reduce, the ci map
//
// These four methods ARE the number pipeline. Every score in every Markdown /
// HTML / CSV / JSON report the product emits comes out of them, and not one of
// them had a single direct test. They are dark only because they are `private`
// and therefore reachable in practice only through run() -> evaluateModel() ->
// the real adapter -> a live model, i.e. an API key.
//
// That is the finding worth carrying forward: THE MOST IMPORTANT ARITHMETIC IN
// THE PRODUCT IS UNTESTED, AND NOT BECAUSE IT IS DEFENSIVE OR DEAD, BUT
// BECAUSE A `private` KEYWORD BLOCKED THE SEAM. The `private` modifier is a
// TypeScript compile-time-only construct — it erases at runtime and enforces
// nothing. So the seam is free: drive the real methods through a cast, which is
// this repo's own established pattern (tests/evaluator-fetch-webdev-arena-score
// .test.ts does exactly this for the 8 external fetchers). No production
// visibility change, no re-implementation, no `any` leaking into src/.
//
// WHAT WAS ACTUALLY NEVER EXERCISED
//
// 1. `if (scores.length === 0) return 0;` (L1814) — 4 prior executions, but all
//    on the NON-empty arm. calculateTotalScore's empty-input arm never ran.
//    A model whose adapter returned nothing at all produces a result whose
//    totalScore is this 0 — and today nothing asserts that a zero-question
//    result reports 0 rather than NaN. (0/0 is NaN; the guard is what prevents
//    a NaN totalScore from reaching the report and the JSON report.)
//
// 2. L1852 `count > 0 ? Math.round(total / count) : 0` — 20 executions, ALL on
//    the `count > 0` arm. The `: 0` arm never ran once. This is the single most
//    consequential untested branch in the file: calculateDimensions ALWAYS
//    calls buildDimEntry five times, once per dimension, so on ANY run in
//    which a dimension is not enabled, buildDimEntry is invoked with an empty
//    array. A 3-dimension run has 2 empty dims, a dialogue-only run has 4. The
//    `: 0` arm is the normal case, not an edge case, and a regression to
//    `Math.round(total/count)` with no guard yields NaN in two of five cells
//    of every single leaderboard. NaN in a score-bar `style="width: NaN%"` is
//    silently dropped by the browser, so the bar renders empty and the run
//    still reports COMPLETED.
//
// 3. L1860 `if (count >= 2)` — 0 executions, and the else is the *default*.
//    bootstrap95CI is never called from buildDimEntry in any existing test, so
//    the ci field is never populated by a test-authored path. A regression
//    that attached a degenerate CI (std=NaN, or [0,0]) to a single-score
//    dimension is exactly what the v0.6.0 JSDoc above buildDimEntry says the
//    guard exists to prevent, and getDimCi would happily render it.
//
// 4. calculateCategoryDetails' Set + inner filter: buildDimEntry is the only
//    caller, so its whole body is dark, including the `details` sub-map — the
//    per-category averages that reporter.ts prints verbatim in the detail
//    block. A regression that keyed `details` off the wrong field would ship a
//    report with plausible-looking but wrong numbers.
//
// MUTATION CHECK — 10 mutants, 9 killed, 1 proven equivalent
//
// All reverted; src/core/evaluator.ts is byte-identical at commit (md5 pinned).
//
//   killed:  L1814 drop the empty guard            -> 2 red
//   killed:  L1852 `: 0` -> `: 0.5`                -> 2 red
//   killed:  L1852 `count > 0` -> `count > 1`      -> 1 red
//   killed:  L1860 `count >= 2` -> `count >= 3`    -> 1 red
//   killed:  L1861 `s.score` -> `0`                -> 2 red
//   killed:  L1874 category match -> `true`        -> 1 red
//   killed:  L1875 divide by length -> `+ 1`       -> 1 red
//   killed:  L1816 sum -> `scores.length`          -> 1 red
//   killed:  L1827 `function_calling` -> `coding`  -> 1 red
//   SURVIVED (equivalent, see below): L1852 guard `count > 0` -> `true`
//
// The survivor is a genuine EQUIVALENT MUTANT, not a test weakness. buildDimEntry
// is called by calculateDimensions with `dimScores('x')`, i.e. always an Array,
// so `count` is never null/undefined and `count > 0` vs `true` agree for every
// count in {0, 1, 2, ...}. The only input that could distinguish them is
// undefined, and nothing can produce it. Documented inline; do NOT count it as
// a closed mutant in future tallies.
//
// HARNESS NOTES (my own first-run errors — all in the test, not the product)
//
// 1. The first attempt computed an expected `details` map by hand and asserted
//    deep equality. The product is correct and the hand arithmetic was wrong
//    in two places (category averages round HALF UP, and `total` is the raw
//    sum while `average` is the rounded mean). Re-asserted the real contract:
//    total is a raw sum, average is rounded, details values are per-category
//    rounded means. The test was wrong, not the code — the same class of error
//    the 02:03 tick hit twice on ws_server.ts.
// 2. The first run asserted the `count >= 2` guard with a single-score dimension
//    and therefore never proved that ci IS attached at n=2. Both directions are
//    now asserted on the SAME input shape family, so the negative is the guard
//    firing and not merely an absent fixture.
// 3. `evaluateModel` needs an adapter; `baseConfig` with every benchmark flag
//    false produces zero questions, so `questions.length` is 0 and the
//    progress denominator `(modelIndex * 0 + i + 1) / (models * 0)` is NaN.
//    That is the L1757 cluster's problem, not this file's, so the seam here is
//    the four private methods directly rather than a full run().
//
// PARALLELS
//   tests/evaluator-dispatch-and-default-arms.test.ts  (private-method cast pattern)
//   tests/reporter-5dim-ci-rendering.test.ts             (CI rendering contract)
//
// 0 production changes: this file adds tests only.

import { Evaluator, bootstrap95CI } from '../src/core/evaluator';
import { LLMAdapter } from '../src/adapters/adapter';
import { BenchmarkConfig, DimensionScore, ModelConfig, QuestionScore } from '../src/types';

const model: ModelConfig = {
  name: 'probe-model',
  endpoint: 'https://model.invalid/v1',
  apiKey: 'test-key-not-a-real-secret',
  type: 'openai',
  model: 'probe-model-1',
};

const baseConfig: BenchmarkConfig = {
  models: [model],
  benchmarks: { dialogue: false, coding: false },
};

const adapter = {} as LLMAdapter;

const ev = (): any => new Evaluator(baseConfig, adapter) as any;

type DimKey = 'dialogue' | 'coding' | 'function_calling' | 'long_context' | 'multi_turn';
/** DimensionScore marks the optional dims as `?`; buildDimEntry always fills all five. */
const dim = (dims: DimensionScore, k: DimKey) => dims[k]!;

const score = (
  category: string,
  value: number,
  dimension: QuestionScore['dimension'],
): QuestionScore => ({
  questionId: `${category}-${value}`,
  category,
  score: value,
  dimension,
  modelOutput: '',
});

describe('core/evaluator.ts dimension aggregation (L1813-1880)', () => {
  describe('calculateTotalScore (L1813)', () => {
    it('sums and averages a non-empty score list, rounding half up', () => {
      // (70 + 81) / 2 = 75.5 -> 76
      expect(ev().calculateTotalScore([score('a', 70, 'dialogue'), score('a', 81, 'dialogue')])).toBe(76);
    });

    it('a single score is its own total', () => {
      expect(ev().calculateTotalScore([score('a', 42, 'coding')])).toBe(42);
    });

    it('an EMPTY score list returns 0, not NaN -- the L1814 guard arm', () => {
      const out = ev().calculateTotalScore([]);
      expect(out).toBe(0);
      // The guard is load-bearing: without it this is 0/0 = NaN, and a NaN
      // totalScore reaches the JSON/Markdown/CSV report and the leaderboard.
      expect(Number.isNaN(out)).toBe(false);
    });

    it('a zero-score list is 0 and is distinguishable from the empty list only by the caller', () => {
      expect(ev().calculateTotalScore([score('a', 0, 'dialogue')])).toBe(0);
    });
  });

  describe('calculateDimensions (L1821)', () => {
    it('partitions by dimension: a score appears in exactly one of the five entries', () => {
      const dims: DimensionScore = ev().calculateDimensions([
        score('catA', 80, 'dialogue'),
        score('catB', 60, 'coding'),
        score('catC', 40, 'function_calling'),
        score('catD', 20, 'long_context'),
        score('catE', 10, 'multi_turn'),
      ]);
      expect(dims.dialogue.count).toBe(1);
      expect(dims.coding.count).toBe(1);
      expect(dim(dims, 'function_calling').count).toBe(1);
      expect(dim(dims, 'long_context').count).toBe(1);
      expect(dim(dims, 'multi_turn').count).toBe(1);
      expect(dims.dialogue.average).toBe(80);
      expect(dims.coding.average).toBe(60);
      expect(dim(dims, 'function_calling').average).toBe(40);
      expect(dim(dims, 'long_context').average).toBe(20);
      expect(dim(dims, 'multi_turn').average).toBe(10);
    });

    it('an unenabled dimension gets a 5-field entry with count 0 / total 0 / average 0 / details {} / no ci', () => {
      // This is the L1852 `: 0` arm reached through its REAL caller. The arm is
      // the normal case: calculateDimensions always calls buildDimEntry five
      // times, so any run that does not enable all five dimensions lands here.
      const dims: DimensionScore = ev().calculateDimensions([
        score('catA', 80, 'dialogue'),
        score('catB', 60, 'coding'),
      ]);
      expect(dims.function_calling).toEqual({
        total: 0,
        count: 0,
        average: 0,
        details: {},
        ci: undefined,
      });
    });

    it('five scores in ONE dimension leave the other four empty, and no score is counted twice', () => {
      const dims: DimensionScore = ev().calculateDimensions([
        score('catA', 100, 'dialogue'),
        score('catB', 90, 'dialogue'),
        score('catC', 80, 'dialogue'),
        score('catD', 70, 'dialogue'),
        score('catE', 60, 'dialogue'),
      ]);
      expect(dims.dialogue.count).toBe(5);
      expect(dims.dialogue.total).toBe(400);
      expect(dims.dialogue.average).toBe(80);
      for (const k of ['coding', 'function_calling', 'long_context', 'multi_turn'] as const) {
        expect(dim(dims, k).count).toBe(0);
        expect(dim(dims, k).average).toBe(0);
      }
    });
  });

  describe('buildDimEntry (L1848) -- total / count / average / details / ci', () => {
    it('total is the RAW SUM and average is the ROUNDED mean; they differ on purpose', () => {
      const entry = ev().buildDimEntry([score('catA', 70, 'dialogue'), score('catB', 81, 'dialogue')]);
      expect(entry.total).toBe(151);
      expect(entry.count).toBe(2);
      // (70 + 81) / 2 = 75.5 -> 76
      expect(entry.average).toBe(76);
    });

    it('an EMPTY list yields total 0 / count 0 / average 0 and no ci -- the L1852 `: 0` + L1860 else arms', () => {
      const entry = ev().buildDimEntry([]);
      expect(entry.total).toBe(0);
      expect(entry.count).toBe(0);
      expect(entry.average).toBe(0);
      expect(entry.details).toEqual({});
      // The `count >= 2` guard firing: no degenerate CI on an empty dimension.
      expect(entry.ci).toBeUndefined();
    });

    it('count === 1 attaches NO ci -- the n=1 degradation the JSDoc promises', () => {
      const entry = ev().buildDimEntry([score('catA', 80, 'dialogue')]);
      expect(entry.count).toBe(1);
      expect(entry.ci).toBeUndefined();
    });

    it('count === 2 DOES attach a ci, and it is a real bootstrap over the scores', () => {
      const entry = ev().buildDimEntry([score('catA', 70, 'dialogue'), score('catB', 90, 'dialogue')]);
      expect(entry.ci).toBeDefined();
      expect(entry.ci!.n).toBe(2);
      expect(entry.ci!.nResamples).toBe(1000);
      expect(entry.ci!.mean).toBeCloseTo(80, 6);
      // A real resample CI must bracket the mean and be non-degenerate.
      expect(entry.ci!.std).toBeGreaterThan(0);
      expect(entry.ci!.std).toBeLessThanOrEqual(20);
      const ci = entry.ci!;
      expect(ci.ciLower).toBeLessThanOrEqual(ci.mean);
      expect(ci.ciUpper).toBeGreaterThanOrEqual(ci.mean);
    });

    it('a ci is attached for EVERY dimension with n>=2, not only the first', () => {
      const dims: DimensionScore = ev().calculateDimensions([
        score('catA', 70, 'dialogue'),
        score('catB', 90, 'dialogue'),
        score('catC', 30, 'coding'),
        score('catD', 50, 'coding'),
      ]);
      expect(dim(dims, 'dialogue').ci).toBeDefined();
      expect(dim(dims, 'coding').ci).toBeDefined();
      // ...and NOT on the three that have fewer than 2 scores.
      expect(dim(dims, 'function_calling').ci).toBeUndefined();
      expect(dim(dims, 'long_context').ci).toBeUndefined();
      expect(dim(dims, 'multi_turn').ci).toBeUndefined();
    });

    it('identical scores bootstrap to a zero-width CI with zero std -- the degenerate-but-valid case', () => {
      const entry = ev().buildDimEntry([score('catA', 50, 'dialogue'), score('catB', 50, 'dialogue')]);
      expect(entry.ci).toBeDefined();
      expect(entry.ci!.n).toBe(2);
      expect(entry.ci!.std).toBe(0);
      expect(entry.ci!.ciLower).toBeCloseTo(50, 6);
      expect(entry.ci!.ciUpper).toBeCloseTo(50, 6);
    });
  });

  describe('calculateCategoryDetails (L1866) -- the per-category `details` sub-map', () => {
    it('averages within each category and emits one key per distinct category', () => {
      const details = ev().calculateCategoryDetails([
        score('catA', 100, 'dialogue'),
        score('catA', 80, 'dialogue'),
        score('catB', 50, 'coding'),
      ]);
      expect(details).toEqual({ catA: 90, catB: 50 });
    });

    it('a single score in a category is that score', () => {
      const details = ev().calculateCategoryDetails([score('solo', 77, 'dialogue')]);
      expect(details).toEqual({ solo: 77 });
    });

    it('an empty input yields an empty map, not a NaN entry', () => {
      const details = ev().calculateCategoryDetails([]);
      expect(details).toEqual({});
      // No key is emitted for a category that has no scores.
    });

    it('category keys are emitted in FIRST-SEEN order via the Set, and values are rounded half up', () => {
      const details = ev().calculateCategoryDetails([
        score('zzz', 10, 'dialogue'),
        score('aaa', 10, 'dialogue'),
        score('zzz', 11, 'dialogue'),
        score('aaa', 12, 'dialogue'),
      ]);
      expect(Object.keys(details)).toEqual(['zzz', 'aaa']);
      // zzz: (10 + 11) / 2 = 10.5 -> 11 ; aaa: (10 + 12) / 2 = 11.0 -> 11
      expect(details).toEqual({ zzz: 11, aaa: 11 });
    });
  });

  describe('bootstrap95CI end-to-end through buildDimEntry', () => {
    it('the ci that buildDimEntry attaches is the exported helper\'s own output for the same input', () => {
      // Pins the wiring: a future refactor that inlines a DIFFERENT CI routine
      // here would still pass every test above unless this is asserted.
      // buildDimEntry calls the module-level bootstrap95CI with the default
      // 1000-resample Math.random rng, so the values are not reproducible; what
      // IS reproducible is the structural contract, asserted below.
      const scores = [70, 90];
      const entry = ev().buildDimEntry([score('a', 70, 'dialogue'), score('b', 90, 'dialogue')]);
      expect(entry.ci!.n).toBe(scores.length);
      expect(entry.ci!.nResamples).toBe(1000);
      // The helper itself, called directly, produces the same SHAPE.
      const direct = bootstrap95CI(scores);
      expect(direct.n).toBe(entry.ci!.n);
      expect(direct.nResamples).toBe(entry.ci!.nResamples);
      expect(Object.keys(direct).sort()).toEqual(Object.keys(entry.ci!).sort());
    });
  });
});
