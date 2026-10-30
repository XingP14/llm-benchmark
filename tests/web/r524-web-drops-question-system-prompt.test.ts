// tests/web/r524-web-drops-question-system-prompt.test.ts
//
// 2026-10-31 03:03 cron tick (rotation: llm-benchmark).
//
// FINDING: the WEB evaluation path DROPS `question.systemPrompt`.
//
// The CLI path (src/core/evaluator.ts evaluateQuestion L1789-1791) assembles
// the prompt as:
//
//     if (question.systemPrompt) messages.push({ role: 'system', content: question.systemPrompt });
//     messages.push({ role: 'user', content: question.content });
//
// The WEB path (src/web/engine/evaluator.ts run() L121-130) assembles it as:
//
//     output = await adapter.chat([{ role: 'user', content: question.content }], ...)
//
// -- one user message, no system message, for EVERY question.
//
// Two shipped dialogue questions carry a systemPrompt:
//   src/benchmarks/dialogue.ts:97  dial-context-001
//   src/benchmarks/dialogue.ts:108 dial-context-002
// Both are `context_awareness` questions whose content embeds a prior
// user/assistant exchange and whose system prompt says
// "你是一个有帮助的助手。请记住对话历史，准确回答后续问题".
//
// WHY THIS MATTERS: the two planes are the SAME product (the Web UI is the
// documented way to run an evaluation -- src/web/routes/evaluations.ts POST /
// defaults dialogue=true and coding=true), and they are scored by the SAME
// scorer, but they do not put the same thing in front of the model. A model
// that needs the instruction "remember the conversation history" gets it on
// the CLI and does NOT get it on the web. The score therefore depends on
// WHICH entry point the operator happened to use.
//
// This file is a MEASUREMENT, not a fix.
//
// The repair (push the system message in the web path) changes what text the
// model sees, and therefore changes the score the Web UI persists. Per
// docs/PROJECT-GOVERNANCE.md ("Design Rules": cross-cutting changes that
// touch scoring algorithms or benchmark dimensions need a design note before
// code), the repair is father-gated. So ZERO production code changes here:
// this suite PINS THE OBSERVED (defective) behaviour so that when the repair
// is decided, each candidate arm turns RED and the decision stays visible.
//
// Every assertion below is on the messages actually handed to the adapter --
// observed state, not absence-of-throw. A test that only asserted "no throw"
// would pass against a broken guard (the same failure mode recorded in
// tests/evaluator-evaluate-question-runtime.test.ts).
//
// The production classes are driven, not re-implemented: the real
// EvaluatorEngine.run() and the real Evaluator.run(), with the adapters
// stubbed at the module boundary. A hand-copied prompt-assembly routine
// written into the test would pass against every mutation below, which is
// the defect class this file exists to close.

import { EvaluatorEngine } from '../../src/web/engine/evaluator';
import { taskManager } from '../../src/web/engine/task';
import { resetSingleton, initAdminUser, resetDatabase, getDatabase } from '../../src/web/db/database';
import { getAllDialogueBenchmarks } from '../../src/benchmarks/dialogue';

// Every message array the web path hands to an adapter, in order.
const webCalls: Array<Array<{ role: string; content: string }>> = [];
const chatSpy = jest.fn(async (...args: unknown[]) => {
  webCalls.push(args[0] as Array<{ role: string; content: string }>);
  return 'MODEL_OUTPUT';
});

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
  GlmAdapter: jest.fn().mockImplementation(() => ({
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

const SYSTEM_PROMPT_IDS = ['dial-context-001', 'dial-context-002'];

describe('WEB evaluation path drops question.systemPrompt (measured, not repaired)', () => {
  let adminUserId: number;

  beforeAll(() => {
    resetSingleton();
    initAdminUser();
  });

  beforeEach(() => {
    resetDatabase();
    taskManager.clear();
    webCalls.length = 0;
    chatSpy.mockClear();
    const db = getDatabase();
    const admin = db.prepare('SELECT id FROM users WHERE username=?').get('admin') as any;
    adminUserId = admin.id;
  });

  /**
   * Seed one config, start a DIALOGUE-only task, run the real web engine,
   * and return the messages the adapter actually received.
   */
  async function runWebDialogue(): Promise<Array<Array<{ role: string; content: string }>>> {
    const db = getDatabase();
    const res = db
      .prepare(
        `INSERT INTO configs (user_id, name, type, endpoint, api_key, model)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(adminUserId, 'cfg', 'openai', 'https://example.invalid/v1', 'sk-test', 'test-model');
    const configId = res.lastInsertRowid as number;

    const taskId = taskManager.startTask(adminUserId, [configId], true, false, false, false, false);
    db.prepare(
      `INSERT INTO evaluations (id, user_id, status, include_dialogue, include_coding, include_function_calling, include_long_context, include_multi_turn)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(taskId, adminUserId, 'PENDING', 1, 0, 0, 0, 0);

    const engine = new EvaluatorEngine();
    await engine.run(taskId, () => {});

    const row = db.prepare('SELECT status FROM evaluations WHERE id=?').get(taskId) as any;
    // Precondition, not the assertion: a throw inside the pipeline would be
    // swallowed into a FAILED row and every assertion below would be
    // vacuously satisfiable.
    expect(row.status).toBe('COMPLETED');
    return webCalls;
  }

  describe('F1 -- the shipped benchmark set carries systemPrompt on real questions', () => {
    it('exactly the two context_awareness dialogue questions carry a systemPrompt', () => {
      const withSys = getAllDialogueBenchmarks().filter((q: any) => q.systemPrompt);
      expect(withSys.map((q: any) => q.id).sort()).toEqual([...SYSTEM_PROMPT_IDS].sort());
    });

    it('each systemPrompt is a non-empty string', () => {
      for (const q of getAllDialogueBenchmarks().filter((x: any) => x.systemPrompt) as any[]) {
        expect(typeof q.systemPrompt).toBe('string');
        expect(q.systemPrompt.length).toBeGreaterThan(0);
      }
    });
  });

  describe('F2 -- the WEB path sends NO system message for ANY question', () => {
    it('no adapter call carries a `system` role message', async () => {
      const calls = await runWebDialogue();
      expect(calls.length).toBeGreaterThan(0);
      const withSystem = calls.filter((m) => m.some((x) => x.role === 'system'));
      expect(withSystem).toEqual([]);
    });

    it('every adapter call carries exactly ONE message, and it is the user turn', async () => {
      const calls = await runWebDialogue();
      for (const messages of calls) {
        expect(messages).toHaveLength(1);
        expect(messages[0].role).toBe('user');
      }
    });

    it('the two systemPrompt-carrying questions are still evaluated (the drop is silent)', async () => {
      const db = getDatabase();
      const res = db
        .prepare(
          `INSERT INTO configs (user_id, name, type, endpoint, api_key, model)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(adminUserId, 'cfg2', 'openai', 'https://example.invalid/v1', 'sk-test', 'test-model');
      const configId = res.lastInsertRowid as number;
      const taskId = taskManager.startTask(adminUserId, [configId], true, false, false, false, false);
      db.prepare(
        `INSERT INTO evaluations (id, user_id, status, include_dialogue, include_coding, include_function_calling, include_long_context, include_multi_turn)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(taskId, adminUserId, 'PENDING', 1, 0, 0, 0, 0);
      await new EvaluatorEngine().run(taskId, () => {});

      const ids = (
        db.prepare('SELECT question_id FROM results WHERE evaluation_id=?').all(taskId) as any[]
      ).map((r) => r.question_id);
      for (const id of SYSTEM_PROMPT_IDS) {
        expect(ids).toContain(id);
      }
    });
  });

  describe('F3 -- the CLI path is the reference: it DOES send the system message', () => {
    it('the CLI evaluator sends a `system` role message for the same question set', async () => {
      // Loaded lazily so the CLI module is not pulled into the web harness's
      // module registry above.
      const { Evaluator } = require('../../src/core/evaluator');
      const cliCalls: Array<Array<{ role: string; content: string }>> = [];
      const cliAdapter = {
        chat: jest.fn(async (messages: Array<{ role: string; content: string }>) => {
          cliCalls.push(messages);
          return 'MODEL_OUTPUT';
        }),
      };
      const evaluator = new Evaluator(
        {
          models: [{ name: 'm', model: 'm' }],
          benchmarks: { dialogue: true, coding: false },
        } as any,
        cliAdapter,
      );
      await evaluator.run();

      expect(cliCalls.length).toBeGreaterThan(0);
      const withSystem = cliCalls.filter((m) => m.some((x) => x.role === 'system'));
      // The CLI sends exactly one system message per systemPrompt-carrying
      // question -- two of them.
      expect(withSystem).toHaveLength(SYSTEM_PROMPT_IDS.length);
      // And the system message comes FIRST in the array.
      for (const messages of withSystem) {
        expect(messages[0].role).toBe('system');
      }
    });
  });
});
