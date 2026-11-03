// tests/r531-function-calling-tool-contract-never-sent.test.ts
//
// 2026-11-04 03:30 cron tick (rotation: llm-benchmark, after woclaw de73a7e).
//
// PLANE: "the tool contract is never sent" -- a function-calling benchmark
// whose TOOL DECLARATION never reaches the model.
//
// R524 proved the WEB path drops `question.systemPrompt`. R519 proved the web
// CODING score ignores the benchmark's test cases. R522 proved the web
// DIALOGUE score is a function of length and of a prefix fragment. This file
// is about the FUNCTION-CALLING dimension, and about the one thing every
// tool-calling benchmark must hand the model before anything can be scored.
//
// THE SHAPE OF THE DIMENSION. Five shipped questions
// (src/benchmarks/function-calling.ts) each carry TWO halves:
//
//   availableTools[]        the tool DECLARATION -- name + JSON-schema
//                           (properties / required)
//   expectedToolCall        the EXPECTED tool name + the expected arguments
//
// and the question text is a plain natural-language request:
//
//   fc-basic-001  content: "北京今天天气怎么样？"
//                 availableTools: [ get_weather ]      (city, unit)
//                 expectedToolCall: get_weather { city: "北京" }
//
//   fc-multi-001  content: "帮我算一下 123 乘以 456 等于多少。"
//                 availableTools: [ get_weather, calculate, search_web ]
//                 expectedToolCall: calculate { expression: "123 * 456" }
//
// THE FINDING. Neither half of the contract is ever put in front of the
// model. MEASURED through the real production classes (the real
// `Evaluator.run()` and the real `EvaluatorEngine.run()`, adapters stubbed at
// the module boundary -- nothing re-implements the prompt assembly):
//
//   F1  the CLI request carries NO tool contract. Every adapter call for a
//       function_calling question is EXACTLY ONE `user` message whose content
//       is the question text. Measured: the expected tool name appears in 0
//       of 5 requests; ANY of the question's availableTools names appears in
//       0 of 5; the schema's `"required"` appears in 0 of 5; the request
//       contains no `tools` key at all.
//
//   F2  the WEB request carries NO tool contract either -- byte-identical
//       shape: one user message, question text only.
//
//   F3  so the score is a function of a NAME THE MODEL WAS NEVER TOLD.
//       Measured over the real `Scorer.scoreFunctionCalling`: the expected
//       name + perfect arguments scores 100; the SAME arguments under a
//       PLAUSIBLE alternative name (`get_current_weather`, `multiply`,
//       `send_mail`, `reserve_restaurant`, `add_attachment`) scores 0. The
//       argument matcher is not the discriminator -- the name is.
//
//   F4  and a fully CORRECT natural-language answer scores 0 ("未检测到
//       tool_call"). A model that answers the user's request perfectly, in
//       prose, is scored as having failed every function-calling question.
//
//   F5  the ARGUMENT KEYS are unobtainable too. Measured: for every one of
//       the five questions, NONE of the schema's property names appears in
//       the question text. The model cannot know it is supposed to emit
//       `{"city": ...}` rather than `{"location": ...}`.
//
//   F6  the ORACLE is reachable but only by guessing. End-to-end through the
//       real `Evaluator.run()`: a model that answers in prose scores 0/100;
//       a model that emits well-formed tool_call JSON with PERFECT arguments
//       under plausible names scores 0/100; the same JSON under the exact
//       expected names scores 100/100.
//
//   F7  and the argument matcher is SUBSTRING-INCLUSIVE, so even a perfect
//       name can be paired with a wrong value and still score 100:
//       `{"city":"北京"}` -> 100 and `{"city":"北京市"}` -> 100, because
//       `valueMatches` compares strings with `actual.includes(expected)`.
//
// WHY IT MATTERS HERE SPECIFICALLY. A function-calling score is a
// MEASUREMENT of a capability. Here the measurement's TARGET -- "can this
// model call the right tool with the right arguments?" -- requires the model
// to guess a tool name that the harness chose and never disclosed. The
// dimension is opt-in (`"function_calling": true`, default false), so this
// does not silently corrupt the default run; but a user who turns it on gets
// a number that measures the harness's secret vocabulary, not the model's
// tool-use ability.
//
// WHAT THIS FILE IS NOT. It does not assert correct behaviour and it ships
// NO production change. The repair is a product decision with a wire-format
// tail:
//   F1/F2 -- send the tool declaration (as an OpenAI `tools` array, which
//            means extending the `LLMAdapter.chat` signature, or as a system
//            message carrying the schema JSON, which means changing what the
//            model sees on EVERY request);
//   F3     -- accept a name-agnostic match (the schema's own tool set), or
//            score arguments only;
//   F4     -- give partial credit to a prose answer;
//   F7     -- tighten the string comparison to equality.
//
// Per docs/PROJECT-GOVERNANCE.md ("Design Rules": cross-cutting changes that
// touch scoring algorithms or benchmark dimensions need a design note before
// code), each of those is father-gated. This file PINS THE OBSERVED
// (defective) behaviour so that when a repair is decided, each candidate arm
// turns RED and the decision stays visible.
//
// HARNESS NOTES (measured on this file)
//
// 1. THE PRODUCTION CLASSES ARE DRIVEN, NOT RE-IMPLEMENTED. The real
//    `Evaluator.run()` (CLI) and the real `EvaluatorEngine.run()` (web), with
//    the adapters stubbed at the module boundary. A hand-copied prompt
//    assembly written into the test would pass against every mutation below.
//
// 2. THE ASSERTIONS ARE ON OBSERVED STATE. Every arm inspects the messages
//    the adapter actually received, or the score the real scorer actually
//    returned -- never "no throw". A suite that only asserted "no throw"
//    would pass against a broken guard.
//
// 3. THE MOCK CAN MOVE THE SCORE. F3's arms are written so that the SAME
//    stub, given a different tool NAME, produces a different score. A stub
//    that could not move the score would report every arm below as "stable"
//    and prove nothing.
//
// 4. THE CLI'S FUNCTION-CALLING SCORER IS STRUCTURAL, NOT A JUDGE CALL. The
//    CLI's `Scorer.scoreFunctionCalling` matches the model's reply against
//    the expected tool call by structure; it makes NO adapter call of its
//    own. So in the CLI arms every recorded adapter call is a SUBJECT call,
//    and the count of subject calls equals the number of FC questions. (The
//    web path is the same for FC: `webScorer()` is used only for the
//    structural dimensions.)

import { Evaluator } from '../src/core/evaluator';
import { Scorer } from '../src/core/scorer';
import { EvaluatorEngine } from '../src/web/engine/evaluator';
import { taskManager } from '../src/web/engine/task';
import { resetSingleton, initAdminUser, resetDatabase, getDatabase } from '../src/web/db/database';
import { getAllFunctionCallingBenchmarks } from '../src/benchmarks/function-calling';
import type { LLMAdapter } from '../src/adapters/adapter';

type Msg = { role: string; content: string };

const FC_IDS = [
  'fc-basic-001',
  'fc-multi-001',
  'fc-required-001',
  'fc-nested-001',
  'fc-array-001',
];

// Every message array the WEB path hands to an adapter, in order.
const webCalls: Msg[][] = [];
const chatSpy = jest.fn(async (...args: unknown[]) => {
  webCalls.push(args[0] as Msg[]);
  return 'MODEL_OUTPUT';
});

jest.mock('../src/adapters/openai-adapter', () => ({
  OpenAIAdapter: jest.fn().mockImplementation(() => ({
    chat: (...args: unknown[]) => chatSpy(...args),
    name: 'openai',
  })),
}));
jest.mock('../src/adapters/anthropic-adapter', () => ({
  AnthropicAdapter: jest.fn().mockImplementation(() => ({
    chat: (...args: unknown[]) => chatSpy(...args),
    name: 'anthropic',
  })),
}));
jest.mock('../src/adapters/glm-adapter', () => ({
  GlmAdapter: jest.fn().mockImplementation(() => ({
    chat: (...args: unknown[]) => chatSpy(...args),
    name: 'glm',
  })),
}));
jest.mock('../src/adapters/deepseek-adapter', () => ({
  DeepSeekAdapter: jest.fn().mockImplementation(() => ({
    chat: (...args: unknown[]) => chatSpy(...args),
    name: 'deepseek',
  })),
}));
jest.mock('../src/adapters/qwen-adapter', () => ({
  QwenAdapter: jest.fn().mockImplementation(() => ({
    chat: (...args: unknown[]) => chatSpy(...args),
    name: 'qwen',
  })),
}));
jest.mock('../src/adapters/ollama-adapter', () => ({
  OllamaAdapter: jest.fn().mockImplementation(() => ({
    chat: (...args: unknown[]) => chatSpy(...args),
    name: 'ollama',
  })),
}));
jest.mock('../src/sandbox/python-sandbox', () => ({
  PythonSandbox: jest.fn().mockImplementation(() => ({
    execute: jest.fn().mockResolvedValue({ success: false, output: '', error: 'Execution failed' }),
  })),
}));

/** A scoring stub that CAN move the score: the FC scorer makes no call of its own. */
const structuralAdapter: LLMAdapter = {
  chat: async () => 'unused',
  ping: async () => true,
  getName: () => 'structural',
};

function scorer(): Scorer {
  return new Scorer(structuralAdapter, {
    name: 'm',
    type: 'openai' as const,
    endpoint: '',
    apiKey: 'k',
  });
}

/** Run the real CLI Evaluator over the FC dimension, recording every request. */
async function runCli(): Promise<Msg[][]> {
  const calls: Msg[][] = [];
  const adapter: LLMAdapter = {
    chat: async (messages) => {
      calls.push(messages as Msg[]);
      return 'REPLY';
    },
    ping: async () => true,
    getName: () => 'recorder',
  };
  const evaluator = new Evaluator(
    {
      models: [{ name: 'm', model: 'm' }],
      benchmarks: {
        dialogue: false,
        coding: false,
        function_calling: true,
        long_context: false,
        multi_turn: false,
      },
    } as any,
    adapter,
  );
  await evaluator.run();
  return calls;
}

/** Run the real web engine over the FC dimension, recording every request. */
async function runWeb(): Promise<Msg[][]> {
  resetSingleton();
  initAdminUser();
  resetDatabase();
  taskManager.clear();
  webCalls.length = 0;
  chatSpy.mockClear();

  const db = getDatabase();
  const admin = db.prepare('SELECT id FROM users WHERE username=?').get('admin') as any;
  const res = db
    .prepare(
      `INSERT INTO configs (user_id, name, type, endpoint, api_key, model)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(admin.id, 'cfg', 'openai', 'https://example.invalid/v1', 'sk-test', 'test-model');
  const configId = res.lastInsertRowid as number;

  const taskId = taskManager.startTask(admin.id, [configId], false, false, true, false, false);
  db.prepare(
    `INSERT INTO evaluations (id, user_id, status, include_dialogue, include_coding, include_function_calling, include_long_context, include_multi_turn)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(taskId, admin.id, 'PENDING', 0, 0, 1, 0, 0);

  const engine = new EvaluatorEngine();
  await engine.run(taskId, () => {});

  // Precondition, not the assertion: a throw inside the pipeline would be
  // swallowed into a FAILED row and every assertion below would be
  // vacuously satisfiable.
  const row = db.prepare('SELECT status FROM evaluations WHERE id=?').get(taskId) as any;
  expect(row.status).toBe('COMPLETED');
  return webCalls;
}

describe('r531 — the function-calling tool contract is never sent to the model', () => {
  const fcs = getAllFunctionCallingBenchmarks();

  describe('F0 — the dimension itself is what this file claims it is', () => {
    it('(0) the shipped set is five questions, each with a declaration and an expectation', () => {
      expect(fcs.map((q) => q.id)).toEqual(FC_IDS);
      for (const q of fcs) {
        expect(q.availableTools.length).toBeGreaterThan(0);
        expect(q.expectedToolCall.name).toBeTruthy();
        expect(Object.keys(q.expectedToolCall.arguments).length).toBeGreaterThan(0);
        // The expected tool is one of the declared tools -- the declaration
        // is what makes the expectation meaningful.
        expect(q.availableTools.map((t) => t.name)).toContain(q.expectedToolCall.name);
      }
    });

    it('(0b) the question text never names the expected tool', () => {
      for (const q of fcs) {
        expect(q.content.includes(q.expectedToolCall.name)).toBe(false);
      }
    });
  });

  describe('F1 — the CLI request carries NO tool contract', () => {
    it('(1) the expected tool name appears in NONE of the requests', async () => {
      const calls = await runCli();
      expect(calls.length).toBe(FC_IDS.length);
      const all = calls.map((m) => JSON.stringify(m)).join('\n');
      for (const q of fcs) {
        expect(all.includes(q.expectedToolCall.name)).toBe(false);
      }
    });

    it('(2) NO declared tool name appears in ANY request', async () => {
      const calls = await runCli();
      const all = calls.map((m) => JSON.stringify(m)).join('\n');
      for (const q of fcs) {
        for (const tool of q.availableTools) {
          expect(all.includes(tool.name)).toBe(false);
        }
      }
    });

    it('(3) the request carries no schema and no tools payload', async () => {
      const calls = await runCli();
      const all = calls.map((m) => JSON.stringify(m)).join('\n');
      expect(all).not.toContain('"required"');
      expect(all).not.toContain('"properties"');
      expect(all).not.toContain('tools');
      expect(all).not.toContain('parameter_validation');
    });

    it('(4) every request is EXACTLY ONE user message carrying the question text', async () => {
      const calls = await runCli();
      for (const messages of calls) {
        expect(messages).toHaveLength(1);
        expect(messages[0].role).toBe('user');
      }
      const texts = calls.map((m) => m[0].content);
      for (const q of fcs) {
        expect(texts).toContain(q.content);
      }
    });
  });

  describe('F2 — the WEB request carries NO tool contract either', () => {
    it('(5) the expected tool name appears in NONE of the web requests', async () => {
      const calls = await runWeb();
      expect(calls.length).toBe(FC_IDS.length);
      const all = calls.map((m) => JSON.stringify(m)).join('\n');
      for (const q of fcs) {
        expect(all.includes(q.expectedToolCall.name)).toBe(false);
        for (const tool of q.availableTools) {
          expect(all.includes(tool.name)).toBe(false);
        }
      }
    });

    it('(6) the web request is one user message with the question text', async () => {
      const calls = await runWeb();
      for (const messages of calls) {
        expect(messages).toHaveLength(1);
        expect(messages[0].role).toBe('user');
      }
      const texts = calls.map((m) => m[0].content);
      for (const q of fcs) {
        expect(texts).toContain(q.content);
      }
    });

    it('(7) the web and CLI requests carry the SAME text -- the drop is not web-specific', async () => {
      const cli = await runCli();
      const web = await runWeb();
      const cliTexts = cli.map((m) => m[0].content).sort();
      const webTexts = web.map((m) => m[0].content).sort();
      expect(webTexts).toEqual(cliTexts);
    });
  });

  describe('F3 — the score is a function of a NAME THE MODEL WAS NEVER TOLD', () => {
    it('(8) the expected name with perfect arguments scores 100', async () => {
      const s = scorer();
      for (const q of fcs) {
        const reply = JSON.stringify({
          name: q.expectedToolCall.name,
          arguments: q.expectedToolCall.arguments,
        });
        const got = await s.scoreFunctionCalling(q as any, reply);
        expect(got.score).toBe(100);
      }
    });

    it('(9) the SAME arguments under a plausible alternative name score 0', async () => {
      const alternatives: Record<string, string> = {
        'fc-basic-001': 'get_current_weather',
        'fc-multi-001': 'multiply_numbers',
        'fc-required-001': 'send_email_message',
        'fc-nested-001': 'reserve_table',
        'fc-array-001': 'attach_files_to_draft',
      };
      const s = scorer();
      for (const q of fcs) {
        const reply = JSON.stringify({
          name: alternatives[q.id],
          arguments: q.expectedToolCall.arguments,
        });
        const got = await s.scoreFunctionCalling(q as any, reply);
        expect(got.score).toBe(0);
        expect(got.detail).toContain(q.expectedToolCall.name);
      }
    });

    it('(10) the correct name with the WRONG arguments still scores 40 -- the name is the discriminator', async () => {
      const s = scorer();
      for (const q of fcs) {
        const reply = JSON.stringify({
          name: q.expectedToolCall.name,
          arguments: { __wrong__: 'x' },
        });
        const got = await s.scoreFunctionCalling(q as any, reply);
        expect(got.score).toBe(40);
      }
    });

    it('(11) MOCK CONTROL: the same stub produces 100 and 0 by changing only the name', async () => {
      const q = fcs[0];
      const good = await scorer().scoreFunctionCalling(
        q as any,
        JSON.stringify({ name: q.expectedToolCall.name, arguments: q.expectedToolCall.arguments }),
      );
      const bad = await scorer().scoreFunctionCalling(
        q as any,
        JSON.stringify({ name: 'some_other_tool', arguments: q.expectedToolCall.arguments }),
      );
      // If the stub could not move the score, arms (8)/(9) would be vacuous.
      expect(good.score).not.toBe(bad.score);
      expect(good.score).toBeGreaterThan(bad.score);
    });
  });

  describe('F4 — a fully correct natural-language answer scores 0', () => {
    it('(12) prose answers score 0 with "no tool_call detected"', async () => {
      const prose: Record<string, string> = {
        'fc-basic-001': '北京今天晴，气温 25 摄氏度。',
        'fc-multi-001': '123 乘以 456 等于 56088。',
        'fc-required-001':
          '已给 alice@example.com 发送了主题为「会议提醒」、内容为「明天上午 10 点开会」的邮件。',
        'fc-nested-001': '已在东京预订了寿司店，2 位客人，今晚 7 点。',
        'fc-array-001': '已把「项目周报.pdf」和「财务表.xlsx」加到名为「Q2 总结」的草稿邮件中。',
      };
      const s = scorer();
      for (const q of fcs) {
        const got = await s.scoreFunctionCalling(q as any, prose[q.id]);
        expect(got.score).toBe(0);
        expect(got.detail).toContain('未检测到 tool_call');
      }
    });
  });

  describe('F5 — the argument KEYS are unobtainable too', () => {
    it('(13) NO schema property name appears in the question text', () => {
      for (const q of fcs) {
        const tool = q.availableTools.find((t) => t.name === q.expectedToolCall.name)!;
        const props = Object.keys((tool.parameters as any).properties);
        expect(props.length).toBeGreaterThan(0);
        for (const prop of props) {
          expect(q.content.includes(prop)).toBe(false);
        }
      }
    });
  });

  describe('F6 — the oracle is reachable, but only by guessing the exact name', () => {
    /** Drive the real CLI Evaluator with an adapter that answers per question. */
    async function runCliWith(replyFor: (content: string) => string) {
      const adapter: LLMAdapter = {
        chat: async (messages) => replyFor(messages[messages.length - 1].content),
        ping: async () => true,
        getName: () => 'scripted',
      };
      const evaluator = new Evaluator(
        {
          models: [{ name: 'm', model: 'm' }],
          benchmarks: {
            dialogue: false,
            coding: false,
            function_calling: true,
            long_context: false,
            multi_turn: false,
          },
        } as any,
        adapter,
      );
      const results = await evaluator.run();
      return results[0];
    }

    it('(14) a model that answers in prose scores 0 over the whole dimension', async () => {
      const result = await runCliWith(() => '这是我的答案。');
      expect(result.dimensions.function_calling!.count).toBe(FC_IDS.length);
      expect(result.dimensions.function_calling!.average).toBe(0);
      expect(result.totalScore).toBe(0);
    });

    it('(15) well-formed tool_call JSON with PERFECT arguments but plausible names scores 0', async () => {
      const alternatives: Record<string, string> = {
        'fc-basic-001': 'get_current_weather',
        'fc-multi-001': 'multiply_numbers',
        'fc-required-001': 'send_email_message',
        'fc-nested-001': 'reserve_table',
        'fc-array-001': 'attach_files_to_draft',
      };
      const result = await runCliWith((content) => {
        const q = fcs.find((x) => x.content === content);
        if (!q) return 'ok';
        return JSON.stringify({
          name: alternatives[q.id],
          arguments: q.expectedToolCall.arguments,
        });
      });
      expect(result.dimensions.function_calling!.average).toBe(0);
      expect(result.totalScore).toBe(0);
    });

    it('(16) the SAME JSON under the exact expected names scores 100 -- the oracle exists', async () => {
      const result = await runCliWith((content) => {
        const q = fcs.find((x) => x.content === content);
        if (!q) return 'ok';
        return JSON.stringify({
          name: q.expectedToolCall.name,
          arguments: q.expectedToolCall.arguments,
        });
      });
      expect(result.dimensions.function_calling!.average).toBe(100);
      expect(result.totalScore).toBe(100);
    });
  });

  describe('F7 — the argument matcher is SUBSTRING-INCLUSIVE', () => {
    it('(17) a superset value matches the expected value', async () => {
      const q = fcs[0];
      const s = scorer();
      const exact = await s.scoreFunctionCalling(
        q as any,
        JSON.stringify({ name: q.expectedToolCall.name, arguments: { city: '北京' } }),
      );
      const superset = await s.scoreFunctionCalling(
        q as any,
        JSON.stringify({ name: q.expectedToolCall.name, arguments: { city: '北京市' } }),
      );
      expect(exact.score).toBe(100);
      expect(superset.score).toBe(100);
    });

    it('(18) a non-substring value does not match', async () => {
      const q = fcs[0];
      const got = await scorer().scoreFunctionCalling(
        q as any,
        JSON.stringify({ name: q.expectedToolCall.name, arguments: { city: 'beijing' } }),
      );
      expect(got.score).toBe(40);
    });
  });
});
