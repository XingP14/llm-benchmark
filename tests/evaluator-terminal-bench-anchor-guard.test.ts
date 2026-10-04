// tests/evaluator-terminal-bench-anchor-guard.test.ts
//
// 2026-10-05 04:03 cron tick (rotation: llm-benchmark, after woclaw 01:03).
//
// FINDING: src/core/evaluator.ts L930 is the ONLY anchor-drift guard in the
// file out of eleven, and it is the only one that has never executed. The
// per-line branch map at HEAD c235d6c gave:
//     L930:6  if            0        <- never taken
//     L930:10 binary-expr   7,0      <- the second operand never reached
// while its ten siblings all read
//     if (typeof anchorScore === 'number' && Math.abs(x - anchorScore) > 5)
//     L749 / L838 / L1031 / L1134 / L1248 / L1356 / L1481 / L1588 / L1640 / L1690
// L930 reads
//     if (anchorScore != null && Math.abs(normalized - anchorScore) > 5)
// with `!= null` in place of the `typeof` guard, and a DIFFERENT log format
// (no the leading two spaces + ⚠️ + "expected ~" the other ten use).
//
// WHY THIS IS PRODUCT BEHAVIOUR, NOT DEFENSIVE PADDING
//
// `anchor_score` is a documented config field (it is what the ten sibling
// guards exist to police), and the config is user-authored JSON, so its
// value is whatever the user typed. The two guards do not agree on what to
// do with a non-numeric one:
//
//   * a string anchor passes `!= null`, so `Math.abs(81 - '20')` coerces to
//     61 and the user is told their model is 61 points off an anchor that
//     was never a number. If the string happens to be numerically close the
//     warning is silently suppressed instead, so the SAME typo produces
//     either a spurious alarm or no alarm depending on digits the user
//     never meant as a threshold.
//   * a string anchor is rejected outright by all ten siblings, so the
//     user gets no anchor policing at all -- the one honest outcome.
//
// So a user who types `anchor_score: "20"` instead of `20` is warned by
// terminal_bench and not warned by the other ten fetchers on the same run.
// A single JSON typo produces two different observable outcomes depending
// on which benchmark it lands in.
//
// The fix is one token, and it is the ALIGNMENT, not a new rule: terminal_bench
// adopts the guard its ten siblings already use. No new behaviour is invented
// here, and the divergence it removes is the whole finding.
//
// WHY A FRESH MODULE LOAD
//
// The guard's only observable effect is the logWarn call, and the module
// computes `shouldLog` ONCE at import time
//     const shouldLog = process.env.NODE_ENV !== 'test' && !process.env.JEST_WORKER_ID;
// which is false inside jest, so importing the module normally makes
// logWarn a permanent no-op and the guard unobservable. Every suite that
// "silences" the anchor logWarn (e.g. tests/evaluator-fetch-terminal-bench-score.test.ts
// beforeEach) is in fact silencing a call that can never happen -- that is
// why the guard stayed dark. Loading the module with those two variables
// absent (then restoring them before any other test observes them) is what
// makes the guard assertable, and it is why the other eleven suites could
// not have found this. This mirrors tests/evaluator-log-helpers.test.ts,
// which reaches the same production-log path via a dist subprocess.
//
// NOT COVERED ON PURPOSE
//   - the other ten guards. They are already executed (counts 1 / 1, and
//     their tests/*.test.ts assert the detail suffix those five fetchers
//     append). Aligning terminal_bench to them is this commit's job; the
//     reverse direction is not a defect to test for.
//
// 1 production change: L930 guard aligned. Everything else is test-only.

type Ctor = new (
  config: unknown,
  adapter: unknown,
) => { fetchTerminalBenchScore: (
  apiBase: string,
  model: unknown,
  timeoutMs: number,
  anchorScore?: unknown,
  subset?: string,
    dispatchType?: string,
  ) => Promise<{ score: number; detail: string; dispatchType?: string }> };

/**
 * Load a fresh copy of the evaluator module with the log gate OPEN, without
 * leaving NODE_ENV / JEST_WORKER_ID unset for anything else in the process.
 * shouldLog is evaluated at module scope, so the variables have to be absent
 * at REQUIRE time, not at call time.
 */
const loadEvaluatorWithLogging = (): Ctor => {
  const savedNodeEnv = process.env.NODE_ENV;
  const savedWorkerId = process.env.JEST_WORKER_ID;
  delete process.env.NODE_ENV;
  delete process.env.JEST_WORKER_ID;
  let ctor: Ctor;
  try {
    let mod: { Evaluator: Ctor };
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      mod = require('../src/core/evaluator') as { Evaluator: Ctor };
    });
    ctor = mod!.Evaluator;
  } finally {
    if (savedNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = savedNodeEnv;
    if (savedWorkerId === undefined) delete process.env.JEST_WORKER_ID;
    else process.env.JEST_WORKER_ID = savedWorkerId;
  }
  return ctor;
};

const model = { name: 'tb-probe', endpoint: 'https://tb.invalid', model: 'tb-probe-1' };

const config = { models: [model], benchmarks: { dialogue: false, coding: false } };

describe('core/evaluator.ts fetchTerminalBenchScore anchor guard (L930, previously 0 executions)', () => {
  const originalFetch = global.fetch;
  const originalWarn = console.warn;
  let warn: jest.Mock;
  let fetchTerminalBenchScore: Ctor['prototype']['fetchTerminalBenchScore'];

  /**
   * 0.8 * 70 + (1 - 600/3600) * 30 = 56 + 25 = 81. Every case below scores 81,
   * so the ONLY thing that varies is whether the anchor guard fires.
   */
  const serve81 = () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ task_pass_rate: 0.8, avg_duration_s: 600 }),
    }) as unknown as typeof fetch;
  };

  beforeEach(() => {
    warn = jest.fn();
    console.warn = warn;
    serve81();
    const Evaluator = loadEvaluatorWithLogging();
    fetchTerminalBenchScore = new Evaluator(config, {}).fetchTerminalBenchScore;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    console.warn = originalWarn;
  });

  const anchorWarnings = () =>
    warn.mock.calls.filter((c) => String(c[0]).includes('anchor mismatch')) as string[][];
  const anchorWarningText = () => anchorWarnings().map((c) => String(c[0])).join('\n');

  it('a numeric anchor 20 is 61 points off the score: the guard fires and names both numbers', async () => {
    const res = await fetchTerminalBenchScore('https://tb.invalid/v1', model, 30000, 20, 'full', 'agentic_coding');

    expect(res.score).toBe(81);
    expect(anchorWarnings()).toHaveLength(1);
    // The warning must identify the model and quote BOTH sides of the
    // comparison, otherwise a user cannot tell which of their two configs
    // is wrong.
    expect(anchorWarningText()).toContain('tb-probe');
    expect(anchorWarningText()).toContain('81.0');
    expect(anchorWarningText()).toContain('20');
    expect(anchorWarningText()).toContain('diff > 5');
  });

  it('a numeric anchor equal to the score: the guard is evaluated and does not fire', async () => {
    const res = await fetchTerminalBenchScore('https://tb.invalid/v1', model, 30000, 81, 'full', 'agentic_coding');

    expect(res.score).toBe(81);
    // This is the SECOND operand's false arm. Before this file the `> 5`
    // comparison had never been reached at all on this line, so a mutant
    // that inverted it could not have been caught anywhere.
    expect(anchorWarnings()).toHaveLength(0);
  });

  it('a numeric anchor 82, one point away: inside the 5-point tolerance, so still silent', async () => {
    await fetchTerminalBenchScore('https://tb.invalid/v1', model, 30000, 82, 'full', 'agentic_coding');

    // Pins the threshold at >5 rather than >0: 82 - 81 = 1 must NOT warn.
    expect(anchorWarnings()).toHaveLength(0);
  });

  it('a numeric anchor 86, exactly 5 points away: the boundary, still silent', async () => {
    await fetchTerminalBenchScore('https://tb.invalid/v1', model, 30000, 86, 'full', 'agentic_coding');

    // Strictly greater-than: 5 is not > 5.
    expect(anchorWarnings()).toHaveLength(0);
  });

  it('a numeric anchor 87, six points away: the first value that does warn', async () => {
    await fetchTerminalBenchScore('https://tb.invalid/v1', model, 30000, 87, 'full', 'agentic_coding');

    expect(anchorWarnings()).toHaveLength(1);
  });

  it('no anchor configured: the guard is evaluated and stays silent', async () => {
    await fetchTerminalBenchScore('https://tb.invalid/v1', model, 30000, undefined, 'full', 'agentic_coding');

    expect(anchorWarnings()).toHaveLength(0);
  });

  it('a STRING anchor is not policed at all -- the behaviour terminal_bench now shares with its ten siblings', async () => {
    // THE DISCRIMINATING CASE. `anchor_score: "20"` is valid JSON and a
    // plausible user typo for 20. Under `anchorScore != null` the string
    // passes the guard, `Math.abs(81 - '20')` coerces to 61, and the user
    // is warned that their model missed an anchor that was never numeric.
    // Under the typeof guard every sibling fetcher already uses, the string
    // is not a number, so there is no anchor to compare against and the
    // run is silent.
    //
    // The two answers to the same typo are the defect. This asserts the
    // aligned one.
    await fetchTerminalBenchScore('https://tb.invalid/v1', model, 30000, '20' as unknown as number, 'full', 'agentic_coding');

    expect(anchorWarnings()).toHaveLength(0);
  });

  it('a NULL anchor is silent, and does not reach the arithmetic', async () => {
    await fetchTerminalBenchScore('https://tb.invalid/v1', model, 30000, null as unknown as number, 'full', 'agentic_coding');

    // `!= null` already handled null correctly. Pinning it means the fix to
    // the string case cannot have been made by widening the guard instead.
    expect(anchorWarnings()).toHaveLength(0);
  });

  it('the score itself is unchanged by the anchor -- anchoring is a warning, never a clamp', async () => {
    const noAnchor = await fetchTerminalBenchScore('https://tb.invalid/v1', model, 30000, undefined, 'full', 'agentic_coding');
    const farAnchor = await fetchTerminalBenchScore('https://tb.invalid/v1', model, 30000, 5, 'full', 'agentic_coding');
    const stringAnchor = await fetchTerminalBenchScore('https://tb.invalid/v1', model, 30000, '5' as unknown as number, 'full', 'agentic_coding');

    expect(farAnchor.score).toBe(noAnchor.score);
    expect(stringAnchor.score).toBe(noAnchor.score);
    // A guard that could alter the score would make anchor_score a silent
    // override of the benchmark's own arithmetic.
    expect(farAnchor.detail).toBe(noAnchor.detail);
  });
});
