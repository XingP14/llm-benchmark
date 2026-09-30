// tests/web/evaluator-five-dimension-pipeline.test.ts
//
// Coverage target: the 3-dimension evaluation pipeline in
// src/web/engine/evaluator.ts that is UNREACHABLE from the entire existing
// web test suite:
//
//   - lines 93-96: `if (task.includeFunctionCalling) questions.push(...getAllFunctionCallingBenchmarks())`
//                    `if (task.includeLongContext)     questions.push(...getAllLongContextBenchmarks())`
//                    `if (task.includeMultiTurn)        questions.push(...getAllMultiTurnBenchmarks())`
//   - line 126-129: the `question.type === 'multi_turn'` dispatch, which sends
//                    `mtQuestion.turns` to `adapter.chat()` instead of the
//                    single `[{ role: 'user', content: question.content }]`
//   - lines 128 / 152 / 230: `mtQuestion.turns || []` and the two
//                    `question.referenceAnswer || ''` fallbacks
//   - lines 240-244: the 3 score* branches of `scoreQuestion()` that are not
//                    `dialogue` (function_calling / long_context / multi_turn)
//   - line 306: the `output.includes(keyPart)` arm of `scoreDialogue()` (and
//                    by symmetry its 3 siblings scoreFunctionCalling /
//                    scoreLongContext / scoreMultiTurn, none of which had run)
//
// WHY THIS GAP MATTERS
//
// `POST /api/evaluations` (src/web/routes/evaluations.ts:96-124) accepts
// `function_calling`, `long_context` and `multi_turn` request-body flags,
// persists them into `evaluations.include_*`, and passes them to
// `taskManager.startTask()`. So all three dimensions are shipped, reachable
// product surface -- the UI can request them.
//
// But NO web test ever sets those three flags. Every pre-existing engine test
// calls `taskManager.startTask(userId, [configId], true, false)` -- dialogue
// on, coding off, and the remaining three defaulting to false. So the three
// `questions.push(...)` guards were always false, the `multi_turn` prompt-shape
// dispatch was never taken, and the 3 non-dialogue scorers were never called.
//
// The 3 dark scorers are NOT duplicates of the dialogue path: they hand the
// output to the core `Scorer`, which parses the model's answer structurally.
//   - scoreFunctionCalling -> `extractToolCall()` must find a tool_call in the
//     output at all; a model that answers in prose scores 0 with detail
//     '未检测到 tool_call'.
//   - scoreLongContext -> keyFacts hit ratio; the production web path
//     deliberately IGNORES the `tolerance` field the benchmark carries.
//   - scoreMultiTurn -> required/forbidden phrase arithmetic, incl. the
//     `required.length === 0 ? 1 : ...` arm that makes a rule-free question
//     score 100 rather than NaN.
//
// And the multi_turn prompt shape is the single most consequential difference
// in the file: every other dimension sends ONE user message, while multi_turn
// sends the whole `turns` array (5-6 messages, alternating user/assistant).
// A regression that dropped `.turns` in favour of `question.content` would
// send the model an EMPTY string (multi_turn fixtures have `content: ''`)
// and still keep the whole suite green, because `chat()` is mocked and no test
// inspected the prompt.
//
// The assertions below are therefore on OBSERVABLE STATE, not on
// absence-of-throw: which questions got picked up, what shape the adapter was
// handed, and what score landed in the `results` table.

import { EvaluatorEngine } from '../../src/web/engine/evaluator';
import { taskManager } from '../../src/web/engine/task';
import { resetDatabase, initAdminUser, resetSingleton, getDatabase } from '../../src/web/db/database';

// The 6 constructors are mocked so `adapter.chat()` resolves instantly and so
// the multi_turn prompt shape can be inspected on the mock.
const chatSpy = jest.fn();

jest.mock('../../src/adapters/openai-adapter', () => ({
  OpenAIAdapter: jest.fn().mockImplementation(() => ({
    chat: (...args: unknown[]) => chatSpy(...args),
    name: 'openai',
  })),
}));
jest.mock('../../src/adapters/anthropic-adapter', () => ({
  AnthropicAdapter: jest.fn().mockImplementation(() => ({
    chat: (...args: unknown[]) => chatSpy(...args),
    name: 'anthropic',
  })),
}));
jest.mock('../../src/adapters/glm-adapter', () => ({
  GLMAdapter: jest.fn().mockImplementation(() => ({
    chat: (...args: unknown[]) => chatSpy(...args),
    name: 'glm',
  })),
}));
jest.mock('../../src/adapters/deepseek-adapter', () => ({
  DeepSeekAdapter: jest.fn().mockImplementation(() => ({
    chat: (...args: unknown[]) => chatSpy(...args),
    name: 'deepseek',
  })),
}));
jest.mock('../../src/adapters/qwen-adapter', () => ({
  QwenAdapter: jest.fn().mockImplementation(() => ({
    chat: (...args: unknown[]) => chatSpy(...args),
    name: 'qwen',
  })),
}));
jest.mock('../../src/adapters/ollama-adapter', () => ({
  OllamaAdapter: jest.fn().mockImplementation(() => ({
    chat: (...args: unknown[]) => chatSpy(...args),
    name: 'ollama',
  })),
}));

jest.mock('../../src/sandbox/python-sandbox', () => ({
  PythonSandbox: jest.fn().mockImplementation(() => ({
    execute: jest.fn().mockResolvedValue({ success: false, output: '', error: 'Execution failed' }),
  })),
}));

type Dim = 'dialogue' | 'coding' | 'function_calling' | 'long_context' | 'multi_turn';

interface ResultRow {
  question_id: string;
  question_type: Dim;
  model_output: string;
  score: number;
  reference_answer: string;
}

describe('EvaluatorEngine 3-dimension pipeline (function_calling / long_context / multi_turn)', () => {
  let engine: EvaluatorEngine;
  let wsMessages: any[];
  let adminUserId: number;

  beforeAll(() => {
    resetSingleton();
    initAdminUser();
  });

  beforeEach(() => {
    resetDatabase();
    taskManager.clear();
    engine = new EvaluatorEngine();
    wsMessages = [];
    chatSpy.mockReset();

    const db = getDatabase();
    const admin = db.prepare('SELECT id FROM users WHERE username=?').get('admin') as any;
    adminUserId = admin.id;
  });

  const sendWS = (data: any) => {
    wsMessages.push(data);
  };

  /**
   * Seed one 'openai' config, start a task with the 3 rarely-enabled flags,
   * and run the engine. Returns the persisted result rows.
   */
  async function runWithDimensions(opts: {
    dialogue?: boolean;
    coding?: boolean;
    functionCalling?: boolean;
    longContext?: boolean;
    multiTurn?: boolean;
    output?: string;
  }): Promise<ResultRow[]> {
    const db = getDatabase();
    const res = db
      .prepare(
        `INSERT INTO configs (user_id, name, type, endpoint, api_key, model)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(adminUserId, 'cfg', 'openai', 'https://example.invalid/v1', 'sk-test', 'test-model');
    const configId = res.lastInsertRowid as number;

    chatSpy.mockResolvedValue(opts.output ?? 'OK');

    const taskId = taskManager.startTask(
      adminUserId,
      [configId],
      opts.dialogue ?? false,
      opts.coding ?? false,
      opts.functionCalling ?? false,
      opts.longContext ?? false,
      opts.multiTurn ?? false,
    );
    db.prepare(
      `INSERT INTO evaluations (id, user_id, status, include_dialogue, include_coding, include_function_calling, include_long_context, include_multi_turn)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      taskId,
      adminUserId,
      'PENDING',
      opts.dialogue ? 1 : 0,
      opts.coding ? 1 : 0,
      opts.functionCalling ? 1 : 0,
      opts.longContext ? 1 : 0,
      opts.multiTurn ? 1 : 0,
    );

    await engine.run(taskId, sendWS);

    const row = db.prepare('SELECT status FROM evaluations WHERE id=?').get(taskId) as any;
    // Guard against the vacuous-pass trap: a throw anywhere in the pipeline
    // would be swallowed into a FAILED row AND the outer catch would still
    // emit a `completed`-less message set. Every case below asserts on
    // COMPLETED plus on the specific rows, so this is a precondition, not
    // the assertion.
    expect(row.status).toBe('COMPLETED');

    return db
      .prepare('SELECT question_id, question_type, model_output, score, reference_answer FROM results WHERE evaluation_id=? ORDER BY question_id')
      .all(taskId) as ResultRow[];
  }

  describe('question-set assembly guards (evaluator.ts:93-96)', () => {
    it('picks up only the function_calling questions when only that dimension is on', async () => {
      const rows = await runWithDimensions({ functionCalling: true });
      expect(rows.length).toBeGreaterThan(0);
      expect(new Set(rows.map((r) => r.question_type))).toEqual(new Set(['function_calling']));
      expect(rows.map((r) => r.question_id)).toEqual([
        'fc-array-001',
        'fc-basic-001',
        'fc-multi-001',
        'fc-nested-001',
        'fc-required-001',
      ]);
    });

    it('picks up only the long_context questions when only that dimension is on', async () => {
      const rows = await runWithDimensions({ longContext: true });
      expect(new Set(rows.map((r) => r.question_type))).toEqual(new Set(['long_context']));
      expect(rows.map((r) => r.question_id)).toEqual([
        'lc-extract-002',
        'lc-multi-003',
        'lc-needle-001',
      ]);
    });

    it('picks up only the multi_turn questions when only that dimension is on', async () => {
      const rows = await runWithDimensions({ multiTurn: true });
      expect(new Set(rows.map((r) => r.question_type))).toEqual(new Set(['multi_turn']));
      expect(rows.map((r) => r.question_id)).toEqual([
        'mt-context-001',
        'mt-logic-003',
        'mt-persona-002',
      ]);
    });

    it('assembles the union across all five dimensions without duplicates', async () => {
      const rows = await runWithDimensions({
        dialogue: true,
        coding: true,
        functionCalling: true,
        longContext: true,
        multiTurn: true,
      });
      const ids = rows.map((r) => r.question_id);
      expect(new Set(ids).size).toBe(ids.length);
      // 13 dialogue + 11 coding + 5 fc + 3 lc + 3 mt = 35
      expect(ids.length).toBe(35);
      expect(new Set(rows.map((r) => r.question_type)).size).toBe(5);
    });

    it('a false flag contributes zero questions even when the others are on', async () => {
      // `multi_turn: false` alongside everything else true: the guard is a
      // truthiness check on the task flag, not a property of the question set.
      const rows = await runWithDimensions({
        dialogue: true,
        coding: true,
        functionCalling: true,
        longContext: true,
        multiTurn: false,
      });
      expect(rows.some((r) => r.question_type === 'multi_turn')).toBe(false);
      expect(rows.length).toBe(32);
    });
  });

  describe('multi_turn prompt shape (evaluator.ts:126-129)', () => {
    it('sends the whole turns array, not the empty content field', async () => {
      await runWithDimensions({ multiTurn: true });
      expect(chatSpy).toHaveBeenCalledTimes(3);
      for (const call of chatSpy.mock.calls) {
        const messages = call[0] as Array<{ role: string; content: string }>;
        expect(Array.isArray(messages)).toBe(true);
        // The load-bearing invariant: multi_turn fixtures carry
        // `content: ''`, so a regression to `[{ role:'user', content: q.content }]`
        // would send an empty prompt and still resolve.
        expect(messages.length).toBeGreaterThan(1);
        expect(messages.every((m) => typeof m.content === 'string' && m.content.length > 0)).toBe(true);
        // Roles must be drawn from the interface's 3-member union and the
        // conversation must end on the question turn. Note mt-persona-002
        // legitimately opens with a 'system' persona turn, so a
        // "starts with user" assertion would be wrong here.
        expect(messages.every((m) => ['user', 'assistant', 'system'].includes(m.role))).toBe(true);
        expect(messages[messages.length - 1].role).toBe('user');
        expect(messages.filter((m) => m.role === 'user').length).toBeGreaterThan(1);
      }
    });

    it('forwards the full turns array verbatim for every multi_turn fixture', async () => {
      await runWithDimensions({ multiTurn: true });
      const { getAllMultiTurnBenchmarks } = require('../../src/benchmarks/multi-turn') as {
        getAllMultiTurnBenchmarks: () => Array<{
          turns: Array<{ role: string; content: string }>;
        }>;
      };
      const fixtures = getAllMultiTurnBenchmarks();
      const seen = chatSpy.mock.calls.map(
        (c) => (c[0] as Array<{ role: string; content: string }>).map((m) => m.content).join(' '),
      );
      for (const q of fixtures) {
        expect(seen).toContain(q.turns.map((t: { content: string }) => t.content).join(' '));
      }
    });

    it('preserves the exact turn count of each multi_turn fixture (5, 6, 5)', async () => {
      await runWithDimensions({ multiTurn: true });
      const lengths = chatSpy.mock.calls.map((c) => (c[0] as unknown[]).length);
      expect(lengths.slice().sort((a, b) => a - b)).toEqual([5, 5, 6]);
    });

    it('sends a SINGLE user message for the non-multi_turn dimensions', async () => {
      await runWithDimensions({ functionCalling: true, longContext: true });
      expect(chatSpy).toHaveBeenCalledTimes(8); // 5 fc + 3 lc
      for (const call of chatSpy.mock.calls) {
        const messages = call[0] as Array<{ role: string; content: string }>;
        expect(messages).toHaveLength(1);
        expect(messages[0].role).toBe('user');
        expect(messages[0].content.length).toBeGreaterThan(0);
      }
    });
  });

  describe('scoreQuestion() non-dialogue dispatch (evaluator.ts:240-244)', () => {
    it('routes function_calling rows to the core Scorer tool-call parser', async () => {
      // Output is a real OpenAI-shaped tool_calls envelope that
      // extractToolCall() understands, so the score must be non-zero --
      // proving the FC branch reached Scorer.scoreFunctionCalling() and not
      // the dialogue substring scorer.
      const rows = await runWithDimensions({
        functionCalling: true,
        output: JSON.stringify({
          tool_calls: [
            {
              function: {
                name: 'get_weather',
                arguments: { city: '北京' },
              },
            },
          ],
        }),
      });
      const basic = rows.find((r) => r.question_id === 'fc-basic-001')!;
      expect(basic.score).toBe(100);

      // The other four fixtures expect different tools, so they must score 0
      // on name mismatch -- a dialogue-substring scorer would have given
      // every one of them a positive score instead.
      const others = rows.filter((r) => r.question_id !== 'fc-basic-001');
      expect(others.every((r) => r.score === 0)).toBe(true);
    });

    it('scores a prose-only function_calling answer as 0, not via the length bonus', async () => {
      const rows = await runWithDimensions({
        functionCalling: true,
        output: 'Sure, the weather in Beijing is quite pleasant today.',
      });
      expect(rows.every((r) => r.score === 0)).toBe(true);
    });

    it('routes long_context rows to the keyFacts hit-ratio scorer', async () => {
      // Hits every keyFact of lc-needle-001 (杭州 / 18.7 亿 / 林承志) and
      // none of the others -> 100 for that row, 0 for the rest.
      const rows = await runWithDimensions({
        longContext: true,
        output: '项目"晨星"在杭州启动,首期投入 18.7 亿元,牵头人是林承志博士。',
      });
      const needle = rows.find((r) => r.question_id === 'lc-needle-001')!;
      expect(needle.score).toBe(100);
      const others = rows.filter((r) => r.question_id !== 'lc-needle-001');
      expect(others.every((r) => r.score === 0)).toBe(true);
    });

    it('gives a long_context row a partial score for a partial keyFacts hit', async () => {
      // 1 of 3 facts -> Math.round(1/3*100) = 33.
      const rows = await runWithDimensions({
        longContext: true,
        output: '在杭州启动。',
      });
      const needle = rows.find((r) => r.question_id === 'lc-needle-001')!;
      expect(needle.score).toBe(33);
    });

    it('routes multi_turn rows to the required/forbidden scorer', async () => {
      // Hits all 4 required phrases of mt-context-001 and none of the 4
      // forbidden ones -> 100. Also contains '3 岁', which the dialogue
      // scorer's referenceAnswer substring would not have matched.
      const rows = await runWithDimensions({
        multiTurn: true,
        output: '你家猫叫豆豆,今年 3 岁,平时玩逗猫棒,最近挑食,医生建议换粮。',
      });
      const ctx = rows.find((r) => r.question_id === 'mt-context-001')!;
      expect(ctx.score).toBe(100);
    });

    it('deducts 20 points per forbidden phrase hit in multi_turn scoring', async () => {
      // All 4 required hit (100) + 2 forbidden hits (狗, 4 岁) -> 100-40 = 60.
      const rows = await runWithDimensions({
        multiTurn: true,
        output: '豆豆 3 岁 逗猫棒 挑食,另外它不是狗,今年已经 4 岁了。',
      });
      const ctx = rows.find((r) => r.question_id === 'mt-context-001')!;
      expect(ctx.score).toBe(60);
    });

    it('clamps a multi_turn score at 0 when forbidden hits alone exceed the required ratio', async () => {
      // 0 required hit (0) minus 4 forbidden hits (80) -> clamped to 0, and
      // a Math.max(0, ...) removal would make this -80, which SQLite would
      // happily store. The clamp is load-bearing.
      const rows = await runWithDimensions({
        multiTurn: true,
        output: '狗 4 岁 5 岁 2 岁',
      });
      const ctx = rows.find((r) => r.question_id === 'mt-context-001')!;
      expect(ctx.score).toBe(0);
    });
  });

  describe('dialogue scorer referenceAnswer fallback (evaluator.ts:300, 306)', () => {
    it('scores the dialogue keyPart substring arm and the length bonus additively', async () => {
      // dial-fact-002 referenceAnswer is '木星'; the keyPart split on
      // [，。、,.] leaves the whole string. An output containing 木星 and
      // longer than 10 chars scores 50+30+20 = 100.
      const rows = await runWithDimensions({
        dialogue: true,
        output: '答案是木星,太阳系最大的行星。',
      });
      const jupiter = rows.find((r) => r.question_id === 'dial-fact-002')!;
      expect(jupiter.score).toBe(100);
    });

    it('gives the length bonus even when the reference keyPart is absent', async () => {
      // 50 base + 20 length, no +30 substring hit. Proves the length arm
      // is independent of the substring arm.
      const rows = await runWithDimensions({
        dialogue: true,
        output: '这是一个很长的回答,里面完全没有标准答案的内容。',
      });
      const jupiter = rows.find((r) => r.question_id === 'dial-fact-002')!;
      expect(jupiter.score).toBe(70);
    });

    it('caps the dialogue score at 100 via Math.min', async () => {
      // Any output that both hits the keyPart and exceeds 10 chars already
      // reaches exactly 100; the cap is what stops a future bonus arm from
      // exceeding the documented 0-100 range.
      const rows = await runWithDimensions({
        dialogue: true,
        output: '木星 太阳系 最大 的 行星 是 木星 木星 木星',
      });
      const jupiter = rows.find((r) => r.question_id === 'dial-fact-002')!;
      expect(jupiter.score).toBe(100);
    });
  });

  describe('referenceAnswer fallback (evaluator.ts:144, 152)', () => {
    it('persists an empty reference_answer for the fixtures that have none', async () => {
      // All 5 fc fixtures omit referenceAnswer, so `question.referenceAnswer || ''`
      // must be exercised on the SUCCESS path (not only the catch path).
      const rows = await runWithDimensions({ functionCalling: true });
      expect(rows.every((r) => r.reference_answer === '')).toBe(true);
    });

    it('persists the reference_answer when the fixture has one', async () => {
      const rows = await runWithDimensions({ longContext: true });
      const needle = rows.find((r) => r.question_id === 'lc-needle-001')!;
      expect(needle.reference_answer.length).toBeGreaterThan(0);
    });
  });

  describe('progress accounting across the 3 new dimensions', () => {
    it('reports total = questions x configs for a single-dimension run', async () => {
      wsMessages = [];
      const rows = await runWithDimensions({ functionCalling: true });
      const progress = wsMessages.filter((m) => m.type === 'progress');
      expect(progress).toHaveLength(5);
      expect(progress.every((m) => m.total === 5)).toBe(true);
      expect(progress.map((m) => m.progress)).toEqual([20, 40, 60, 80, 100]);
      expect(rows).toHaveLength(5);
    });

    it('reports 35 total for the all-five-dimensions run and reaches 100', async () => {
      wsMessages = [];
      await runWithDimensions({
        dialogue: true,
        coding: true,
        functionCalling: true,
        longContext: true,
        multiTurn: true,
      });
      const progress = wsMessages.filter((m) => m.type === 'progress');
      expect(progress).toHaveLength(35);
      expect(progress.every((m) => m.total === 35)).toBe(true);
      expect(progress[progress.length - 1].progress).toBe(100);
    });
  });
});
