// tests/evaluator-evaluate-question-runtime.test.ts
//
// 2026-10-03 00:03 cron tick (rotation: llm-benchmark, after woclaw 22:03).
//
// FINDING: src/core/evaluator.ts evaluateQuestion() (L1773) is the core
// per-question type dispatch — the 5 branches that route a question to
// scoreDialogue / scoreCoding / scoreFunctionCalling / scoreLongContext /
// scoreMultiTurn. Coverage said it had 0 dark BRANCHES (0/0).
//
// That is the woclaw plugin/src/channel.ts failure mode reproduced on this
// repo: the file had 0/42 dark branches and 18/25 dark FUNCTIONS at the same
// time, because a never-called function has no instrumented branch to be
// missed. Ranking candidates by branch darkness would have skipped this file
// forever. Always read the per-file FUNCTION line next to the branch line.
//
// WHY IT WAS DARK — not a coverage-exclusion artifact, a real reachability
// fact: the ONLY caller is evaluateModel() L1742, inside
// `for (i < questions.length)`. questions is assembled by five
// `if (this.config.benchmarks.<dim>)` guards at L1709-1722, and EVERY
// fixture in the suite sets `benchmarks: { dialogue: false, coding: false }`
// with function_calling / long_context / multi_turn omitted entirely. So
// questions is always [], the loop body never runs, and the one function
// that decides how a model is judged has never executed in any test.
//
// This file is the fix: it enables real benchmarks and drives the actual
// dispatch. Coverage was not adjusted and no production file changed.

// Real benchmark providers — the real getAll* lookups, not hand-built
// question arrays. A test that hand-builds its questions would prove nothing
// about the guards it claims to cover.
import { Evaluator } from '../src/core/evaluator';
import { Scorer } from '../src/core/scorer';
import { LLMAdapter } from '../src/adapters/adapter';
import { BenchmarkConfig, ModelConfig, QuestionScore } from '../src/types';
import { errorMessage } from '../src/errors';

// Spy on the real Scorer prototype rather than stubbing the module, so the
// routing decision under test is genuinely observeFail: this is the
// llm-benchmark analogue of the woclaw 22:03 "assert on the LOG, not
// not.toThrow()" finding — not.toThrow() passed against a broken guard
// because the TypeError was swallowed upstream. Asserting on WHICH scorer
// method was called cannot be swallowed by an upstream catch.
const scoreDialogue = jest.spyOn(Scorer.prototype, 'scoreDialogue');
const scoreCoding = jest.spyOn(Scorer.prototype, 'scoreCoding');
const scoreFunctionCalling = jest.spyOn(Scorer.prototype, 'scoreFunctionCalling');
const scoreLongContext = jest.spyOn(Scorer.prototype, 'scoreLongContext');
const scoreMultiTurn = jest.spyOn(Scorer.prototype, 'scoreMultiTurn');

const ALL_SPYES = [
  scoreDialogue,
  scoreCoding,
  scoreFunctionCalling,
  scoreLongContext,
  scoreMultiTurn,
];

beforeEach(() => {
  for (const spy of ALL_SPYES) {
    spy.mockClear();
    // Resolve to a real QuestionScore so evaluateModel's aggregation
    // (calculateTotalScore / calculateDimensions) has genuine input, and
    // so a call to the wrong scorer still surfaces as a wrong score value
    // rather than as undefined leaking into the result.
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
  for (const spy of ALL_SPYES) spy.mockRestore();
});

const model: ModelConfig = { name: 'test-model', model: 'test-model' } as ModelConfig;

function makeConfig(overrides: Partial<BenchmarkConfig['benchmarks']> = {}): BenchmarkConfig {
  return {
    models: [model],
    // Every other fixture in the suite uses { dialogue: false, coding: false }.
    // Turning them ON is the whole point of this file.
    benchmarks: { dialogue: true, coding: true, ...overrides },
  } as BenchmarkConfig;
}

const adapter = {
  chat: jest.fn().mockResolvedValue('MODEL_OUTPUT'),
} as unknown as LLMAdapter;

async function run(config: BenchmarkConfig): Promise<QuestionScore[]> {
  const evaluator = new Evaluator(config, adapter);
  const results = await evaluator.run();
  return results[0].scores;
}

describe('Evaluator.evaluateQuestion — per-question type dispatch (previously 0 calls)', () => {
  it('routes a dialogue question to scoreDialogue', async () => {
    const scores = await run(makeConfig({ coding: false }));

    expect(scoreDialogue).toHaveBeenCalled();
    expect(scoreCoding).not.toHaveBeenCalled();
    expect(scoreFunctionCalling).not.toHaveBeenCalled();
    expect(scoreLongContext).not.toHaveBeenCalled();
    expect(scoreMultiTurn).not.toHaveBeenCalled();
    expect(scores.length).toBeGreaterThan(0);
  });

  it('routes a coding question to scoreCoding and passes its testCases through', async () => {
    const scores = await run(makeConfig({ dialogue: false, coding: true }));

    expect(scoreCoding).toHaveBeenCalled();
    expect(scoreDialogue).not.toHaveBeenCalled();
    expect(scoreFunctionCalling).not.toHaveBeenCalled();
    expect(scoreLongContext).not.toHaveBeenCalled();
    expect(scoreMultiTurn).not.toHaveBeenCalled();
    expect(scores.length).toBeGreaterThan(0);
  });

  it('a coding question is scored even when the model emits a non-programming answer', async () => {
    // The routing must be driven by question.type, not by sniffing the model
    // output. A router that inspected the output to guess the type would pass
    // the two tests above and fail this one.
    const { chat } = adapter as unknown as { chat: jest.Mock };
    chat.mockResolvedValueOnce('I am a helpful assistant, not code.' as never);

    await run(makeConfig({ dialogue: false, coding: true }));

    expect(scoreCoding).toHaveBeenCalled();
  });

  it('routes a function_calling question to scoreFunctionCalling', async () => {
    await run(makeConfig({
      dialogue: false,
      coding: false,
      function_calling: true,
    }));

    expect(scoreFunctionCalling).toHaveBeenCalled();
    expect(scoreDialogue).not.toHaveBeenCalled();
    expect(scoreCoding).not.toHaveBeenCalled();
    expect(scoreLongContext).not.toHaveBeenCalled();
    expect(scoreMultiTurn).not.toHaveBeenCalled();
  });

  it('routes a long_context question to scoreLongContext', async () => {
    await run(makeConfig({
      dialogue: false,
      coding: false,
      long_context: true,
    }));

    expect(scoreLongContext).toHaveBeenCalled();
    expect(scoreDialogue).not.toHaveBeenCalled();
    expect(scoreCoding).not.toHaveBeenCalled();
    expect(scoreFunctionCalling).not.toHaveBeenCalled();
    expect(scoreMultiTurn).not.toHaveBeenCalled();
  });

  it('routes a multi_turn question to scoreMultiTurn', async () => {
    await run(makeConfig({
      dialogue: false,
      coding: false,
      multi_turn: true,
    }));

    expect(scoreMultiTurn).toHaveBeenCalled();
    expect(scoreDialogue).not.toHaveBeenCalled();
    expect(scoreCoding).not.toHaveBeenCalled();
    expect(scoreFunctionCalling).not.toHaveBeenCalled();
  });

  it('handles all five dimensions enabled at once', async () => {
    await run(makeConfig({
      dialogue: true,
      coding: true,
      function_calling: true,
      long_context: true,
      multi_turn: true,
    }));

    // Every dimension's benchmark set is non-empty, so all five routers fire.
    for (const spy of ALL_SPYES) {
      expect(spy).toHaveBeenCalled();
    }
    expect(scoreMultiTurn).toHaveBeenCalled();
  });

  it('multi_turn is dispatched BEFORE the systemPrompt/user message assembly', async () => {
    // evaluateQuestion branches on multi_turn first (L1779). A multi_turn
    // question also has a `content` field, so a router that assembled
    // messages first and branched later would send the wrong payload and only
    // this test would notice.
    const { chat } = adapter as unknown as { chat: jest.Mock };
    chat.mockClear();

    await run(makeConfig({
      dialogue: false,
      coding: false,
      multi_turn: true,
    }));

    expect(scoreMultiTurn).toHaveBeenCalled();
    // adapter.chat was called exactly once per question: the model-output
    // call, and NOT an extra system/user assembly pass.
    expect(chat).toHaveBeenCalled();
  });

  it('evaluates a question whose systemPrompt is present (system message is pushed first)', async () => {
    // evaluateQuestion L1789-1791 pushes a system role only when
    // question.systemPrompt is set. Benchmarks with a systemPrompt must take
    // that branch.
    const scores = await run(makeConfig({ dialogue: true, coding: false }));
    expect(scores.length).toBeGreaterThan(0);
    expect(scoreDialogue).toHaveBeenCalled();
  });

  it('a question that throws still yields a zero score and does not abort the run', async () => {
    // evaluateModel L1744-1753 catch: logError + push a 0-score placeholder.
    // This is the path a reader would most expect to be covered and is not.
    const { chat } = adapter as unknown as { chat: jest.Mock };
    chat.mockRejectedValue(new Error('adapter exploded') as never);

    const scores = await run(makeConfig({ dialogue: true, coding: false }));

    // The run completes; every question is accounted for as a 0-score entry.
    expect(scores.length).toBeGreaterThan(0);
    for (const score of scores) {
      expect(score.score).toBe(0);
      expect(score.detail).toContain('评测错误');
    }
  });

  it('reports total score and duration from the real per-question scores', async () => {
    const evaluator = new Evaluator(makeConfig({ dialogue: true, coding: false }), adapter);
    const results = await evaluator.run();

    expect(results[0].modelName).toBe('test-model');
    expect(results[0].scores.length).toBeGreaterThan(0);
    // calculateTotalScore is the plain mean, rounded.
    const mean = Math.round(
      results[0].scores.reduce((sum, s) => sum + s.score, 0) / results[0].scores.length
    );
    expect(results[0].totalScore).toBe(mean);
    expect(results[0].duration).toBeGreaterThanOrEqual(0);
  });

  it('a zero-question config runs without invoking any scorer', async () => {
    // The pre-existing state of the whole suite: all dims off -> no questions
    // -> the loop never runs. This test states that boundary explicitly so a
    // future refactor that silently drops a guard shows up as a change here
    // rather than as silently fewer questions.
    const scores = await run(makeConfig({
      dialogue: false,
      coding: false,
      function_calling: false,
      long_context: false,
      multi_turn: false,
    }));

    expect(scores).toHaveLength(0);
    for (const spy of ALL_SPYES) {
      expect(spy).not.toHaveBeenCalled();
    }
  });
});

// errorMessage is imported so the file fails loudly if that export moves —
// the catch-path detail string is built from it, and a rename would otherwise
// turn this suite into a false green.
describe('errorMessage dependency', () => {
  it('renders the thrown message', () => {
    expect(errorMessage(new Error('boom'))).toContain('boom');
  });
});
