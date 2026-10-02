// tests/web/evaluator-web-scorer-runtime.test.ts
//
// 2026-10-03 06:03 cron tick (rotation: llm-benchmark, after woclaw 05:03).
//
// FINDING: tests/web/evaluator-web-scorer-helper.test.ts is the ONLY suite
// guarding the `private webScorer(): Scorer` factory in
// src/web/engine/evaluator.ts -- the helper that the 06-29 漏更 refactor
// (14c64d4) created by collapsing 3 byte-identical
// `new Scorer(this.createAdapter('openai'), dummyModel)` inline copies into
// one method. All 6 of its cases are readFileSync greps over the source text.
// Not one constructs the Scorer or calls the helper.
//
// MUTATION RESULT against the real evaluator.ts (10 mutants, _tmp/matrix-web-scorer.py):
//
//   M1  apiKey '' -> 'sk-live-oops'                        OLD 1r  NEW 2r
//   M2  endpoint '' -> leak URL                            OLD 1r  NEW 1r
//   M3  type 'openai' -> 'anthropic'                       OLD 1r  NEW 1r
//   M4  createAdapter('openai') -> 'anthropic'             OLD 1r  NEW 1r
//   M5  name 'web' -> 'web-typo'                           OLD 1r  NEW 1r
//   M6  Scorer's 2nd arg replaced inline                   OLD 1r  NEW 2r
//   M7  webScorer returns a different Scorer               OLD 1r  NEW 3r
//   M8  scoreFunctionCalling -> scoreLongContext delegate   OLD 1r  NEW 3r
//   M9  `return { score: result.score }` -> `{ score: 100 }`  OLD 0r  NEW 3r
//   M10 scoreLongContext(question, output) -> (question, '') OLD 1r  NEW -- (no compile)
//
// OLD kills 9/10, NEW kills 9/10 (M10 not scoreable for NEW -- see below).
// NEITHER suite alone is sufficient: M9 is NEW-only, M10 is OLD-only.
//
// The grep suite is HONEST about 9 of 10. It is not worthless, and this
// file does not replace it. M1/M2/M3/M5 are text-level drift assertions that
// a runtime test happens to be able to make here, because the placeholder
// ModelConfig is reachable as a real object once the helper is actually
// called; on a helper whose configuration is assembled elsewhere they would
// be a poor fit and the grep suite is the right instrument.
//
// The one mutant the OLD suite MISSES is M9 -- hardcoding the
// function_calling dimension's score to 100. The old file's own header
// promises "behavior byte-identical to the previous inline construction",
// and M9 is the exact change that breaks that promise while leaving all six
// greps satisfied.
//
// M9 is caught elsewhere in the repo: tests/web/evaluator-five-dimension-pipeline.test.ts
// asserts the persisted `results.score` for a real fc-basic-001 row, so the
// gap is narrower than it first looked. This file exists so the webScorer
// CONTRACT is guarded at the helper itself rather than incidentally by a
// pipeline test that would be rewritten for unrelated reasons.
//
// M10 is a COMPILE error, not a runtime failure: tsconfig's noUnusedParameters
// turns the now-unread `output` param into TS6133 and `npm run build` already
// guards it. It is deliberately not scored as a kill for this file.
//
// WHAT THIS FILE DOES DIFFERENTLY: it drives the real private helper and the
// real private score* methods through the `(EvaluatorEngine as any).webScorer`
// accessor -- the same shape rest_server.test.ts in woclaw already uses for
// handleReady. No test-only re-implementation of the factory: a copy of
// `new Scorer(adapter, dummyModel)` written into a test would pass against
// every one of these mutants, which is the defect class this file exists to
// close.
//
// The scorer is driven through the REAL core Scorer, so the assertions are
// on the score the product would actually persist.
//
// FIRST DRAFT CORRECTIONS, recorded rather than quietly fixed: (1) M1 passed
// 12/12 while apiKey was asserted as `expect.any(String)` -- a placeholder
// acquiring a real-looking key is the exact drift being guarded, so it is now
// the empty string. (2) M10's first matrix row read 0r/0t, i.e. a
// HARNESS-ERROR, and the draft summary counted it as a kill anyway.

import { EvaluatorEngine } from '../../src/web/engine/evaluator';
import { Scorer } from '../../src/core/scorer';
import type { LLMAdapter } from '../../src/adapters/adapter';
import { OpenAIAdapter } from '../../src/adapters/openai-adapter';
import { getAllFunctionCallingBenchmarks } from '../../src/benchmarks/function-calling';
import type { FunctionCallingQuestion } from '../../src/benchmarks/function-calling';
import { getAllLongContextBenchmarks } from '../../src/benchmarks/long-context';
import type { LongContextQuestion } from '../../src/benchmarks/long-context';
import { getAllMultiTurnBenchmarks } from '../../src/benchmarks/multi-turn';
import type { MultiTurnQuestion } from '../../src/benchmarks/multi-turn';
import type { BenchmarkQuestion } from '../../src/types';

// `webScorer` and the score* methods are private, which is intentional -- the
// helper is an implementation detail of EvaluatorEngine. Reaching them through
// an `any` accessor tests the real method without changing the public surface.
const engine = new EvaluatorEngine() as any;

const webScorer = (): Scorer => engine.webScorer() as Scorer;
const scoreFunctionCalling = (q: BenchmarkQuestion, out: string): Promise<{ score: number }> =>
  engine.scoreFunctionCalling(q, out);
const scoreLongContext = (q: BenchmarkQuestion, out: string): Promise<{ score: number }> =>
  engine.scoreLongContext(q, out);
const scoreMultiTurn = (q: BenchmarkQuestion, out: string): Promise<{ score: number }> =>
  engine.scoreMultiTurn(q, out);

describe('EvaluatorEngine.webScorer real construction', () => {
  it('returns a real Scorer instance, not a look-alike', () => {
    const scorer = webScorer();
    expect(scorer).toBeInstanceOf(Scorer);
  });

  it('hands the Scorer a real LLMAdapter, and for the literal "openai"', () => {
    // M4 changes the adapter literal. The constructor arg is private, so read
    // it off the instance -- a real adapter instance is what the Scorer will
    // actually use if a future dimension ever routes through adapter.chat().
    const adapter = (webScorer() as any).adapter as LLMAdapter;
    expect(adapter).toBeInstanceOf(OpenAIAdapter);
  });

  it('pins the placeholder ModelConfig the Scorer is built with (kills M1/M2/M3/M5)', () => {
    // The dummyModel is a placeholder -- Scorer reaches a real LLM only via
    // adapter.chat(), and the 3 web dimensions all use structural matching.
    // Its fields still matter: `type` is a ModelConfig union member, and a
    // drifting endpoint/apiKey is exactly the "3 copies drift out of sync"
    // failure the 06-29 refactor existed to prevent.
    //
    // apiKey is asserted as the EMPTY STRING, not `expect.any(String)`: an
    // earlier draft of this file used any(String) and the M1 mutant
    // (`apiKey: '' -> 'sk-live-oops'`) then passed 12/12. A placeholder that
    // silently acquires a real-looking key is precisely the drift this guards.
    const model = (webScorer() as any).model;
    expect(model).toEqual({
      name: 'web',
      type: 'openai',
      endpoint: '',
      apiKey: '',
    });
  });

  it('the placeholder carries no credential material (kills M1 independently)', () => {
    // Same mutant, different observable: a non-empty apiKey on a Scorer that
    // is documented as needing no credentials is the bug, regardless of which
    // string it is. Two assertions on two observables, not a restatement of one.
    const model = (webScorer() as any).model;
    expect(String(model.apiKey)).toHaveLength(0);
  });

  it('a fresh Scorer per call, so one dimension cannot mutate another (kills M6/M7)', () => {
    // M6 re-inlines the Scorer's 2nd argument in the return. It looks
    // behaviourally identical, but the `model` assertions above pin the exact
    // placeholder literal, so M6 is killed here too (measured 2r). That is a
    // property of those pins, not of this test -- this one covers M7.
    const a = webScorer();
    const b = webScorer();
    expect(a).not.toBe(b);
    expect((a as any).model).not.toBe((b as any).model);
  });
});

describe('scoreFunctionCalling returns the Scorer score, not a constant (kills M9)', () => {
  const [basic] = getAllFunctionCallingBenchmarks() as FunctionCallingQuestion[];

  it('a prose answer with no tool_call scores 0 through the real helper', async () => {
    // M9 hardcodes { score: 100 } on this exact line. The core Scorer returns
    // 0 with detail '未检测到 tool_call' because extractToolCall() finds
    // nothing -- so the honest product score here is 0, and 100 is the bug.
    const result = await scoreFunctionCalling(basic, 'I could not find any tool call in that.');
    expect(result.score).toBe(0);
  });

  it('an exact tool_call scores 100', async () => {
    const expected = basic.expectedToolCall;
    const result = await scoreFunctionCalling(
      basic,
      JSON.stringify({ name: expected.name, arguments: expected.arguments }),
    );
    expect(result.score).toBe(100);
  });

  it('the two ends of the range are distinguishable -- a constant cannot pass both', async () => {
    const expected = basic.expectedToolCall;
    const exact = await scoreFunctionCalling(
      basic,
      JSON.stringify({ name: expected.name, arguments: expected.arguments }),
    );
    const prose = await scoreFunctionCalling(basic, 'no tool call here');
    expect(exact.score).not.toBe(prose.score);
  });

  it('a question with no expectedToolCall scores 0, not the 100 floor (kills M9)', async () => {
    // The core Scorer's `if (!expected)` arm. A helper that returned a
    // constant would hand the product a perfect score for a malformed
    // question.
    const broken = { ...basic, expectedToolCall: undefined } as unknown as BenchmarkQuestion;
    const result = await scoreFunctionCalling(broken, '{"name":"get_weather","arguments":{}}');
    expect(result.score).toBe(0);
  });
});

describe('scoreLongContext forwards the output argument (kills M10)', () => {
  const [ctx] = getAllLongContextBenchmarks() as LongContextQuestion[];

  it('an output matching every keyFact scores 100', async () => {
    const output = ctx.keyFacts.map((f: unknown) => String(f)).join(' and ');
    const result = await scoreLongContext(ctx, output);
    expect(result.score).toBe(100);
  });

  it('an empty output scores 0 -- the argument is genuinely forwarded', async () => {
    // Note on M10 (`scorer.scoreLongContext(question, output)` -> `(question, '')`):
    // that mutant is NOT counted as killed by this file, because it does not
    // compile -- tsconfig's noUnusedParameters turns the now-unread `output`
    // param into TS6133, and the suite fails to run (0 total). `npm run build`
    // (bare tsc) already guards it. Claiming a kill here would be a
    // HARNESS-ERROR read as a green, which is exactly the error this tick
    // recorded in its own first draft.
    //
    // scoreFunctionCalling is the control: it is unaffected by M10, and it
    // proves the two methods are genuinely independent.
    const ctxResult = await scoreLongContext(ctx, '');
    expect(ctxResult.score).toBe(0);

    const [fc] = getAllFunctionCallingBenchmarks() as FunctionCallingQuestion[];
    const fcExpected = fc.expectedToolCall;
    const fcResult = await scoreFunctionCalling(
      fc,
      JSON.stringify({ name: fcExpected.name, arguments: fcExpected.arguments }),
    );
    expect(fcResult.score).toBe(100);
  });
});

describe('scoreMultiTurn computes the required/forbidden arithmetic through the real Scorer', () => {
  const [mt] = getAllMultiTurnBenchmarks() as MultiTurnQuestion[];

  it('a rule-free question scores 100 rather than NaN', async () => {
    const check = mt.consistencyCheck;
    expect(check).toBeDefined();
    const result = await scoreMultiTurn(
      { ...mt, consistencyCheck: { required: [], forbidden: [] } } as MultiTurnQuestion,
      'anything at all',
    );
    expect(result.score).toBe(100);
  });

  it('one forbidden hit costs 20 from a fully-matched required set', async () => {
    const required = ['alpha', 'beta'];
    const hit = await scoreMultiTurn(
      { ...mt, consistencyCheck: { required, forbidden: [] } } as MultiTurnQuestion,
      'alpha and beta',
    );
    const penalised = await scoreMultiTurn(
      { ...mt, consistencyCheck: { required, forbidden: ['alpha'] } } as MultiTurnQuestion,
      'alpha and beta',
    );
    expect(hit.score).toBe(100);
    expect(penalised.score).toBe(80);
  });
});
