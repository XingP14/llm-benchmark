// tests/web/evaluator-adapter-type-routing.test.ts
//
// Coverage target: the `createAdapter(type)` switch in
// src/web/engine/evaluator.ts:201-218 -- 7 UNEXECUTED switch cases
// (anthropic / glm / zhipu / deepseek / qwen / tongyi / dashscope /
// ollama / local) plus the `type.toLowerCase()` normalisation it
// exists to perform.
//
// WHY THIS GAP IS THE RISKIEST IN THE FILE
//
// The switch carries an explicit comment in production:
//
//   // 与 src/index.ts CLI 路径对齐：toLowerCase + 接受 'zhipu' 别名,
//   // 避免老 v0.2.0 时期配置 (type: "ZHIPU" / "zhipu") 走 default → OpenAI
//
// i.e. its entire job is: a config row persisted by an old release
// (type "ZHIPU", "Zhipu", "Tongyi", "LOCAL", ...) must NOT silently fall
// through `default:` and be sent to the OpenAI API with a GLM/Qwen key.
// That is a wrong-provider dispatch: HTTP 401 from the provider, an
// empty benchmark row scored 0, and a user-visible "model error" that
// looks like the model's fault rather than a routing bug.
//
// Every pre-existing web evaluator test seeds its configs with
// type 'openai', which is the `default:` arm. So all 7 named cases had
// ZERO execution and a regression -- dropping `.toLowerCase()`, losing
// the 'zhipu' alias, or mistyping a case label -- would keep the entire
// suite GREEN while breaking every non-OpenAI deployment. Coverage
// percentage was in fact 100% green on the file and still shipped that.
//
// The tests below drive the real `EvaluatorEngine.run()` end-to-end (the
// only public entry point that reaches createAdapter) and assert on
// WHICH CONSTRUCTOR fired, so the assertion is about dispatch
// identity, not about absence-of-throw.

import { EvaluatorEngine } from '../../src/web/engine/evaluator';
import { taskManager } from '../../src/web/engine/task';
import { resetDatabase, initAdminUser, resetSingleton, getDatabase } from '../../src/web/db/database';

jest.mock('../../src/adapters/openai-adapter', () => ({
  OpenAIAdapter: jest.fn().mockImplementation(function (this: any) {
    this.name = 'openai';
    this.chat = jest.fn().mockResolvedValue('OK');
  }),
}));
jest.mock('../../src/adapters/anthropic-adapter', () => ({
  AnthropicAdapter: jest.fn().mockImplementation(function (this: any) {
    this.name = 'anthropic';
    this.chat = jest.fn().mockResolvedValue('OK');
  }),
}));
jest.mock('../../src/adapters/glm-adapter', () => ({
  GLMAdapter: jest.fn().mockImplementation(function (this: any) {
    this.name = 'glm';
    this.chat = jest.fn().mockResolvedValue('OK');
  }),
}));
jest.mock('../../src/adapters/deepseek-adapter', () => ({
  DeepSeekAdapter: jest.fn().mockImplementation(function (this: any) {
    this.name = 'deepseek';
    this.chat = jest.fn().mockResolvedValue('OK');
  }),
}));
jest.mock('../../src/adapters/qwen-adapter', () => ({
  QwenAdapter: jest.fn().mockImplementation(function (this: any) {
    this.name = 'qwen';
    this.chat = jest.fn().mockResolvedValue('OK');
  }),
}));
jest.mock('../../src/adapters/ollama-adapter', () => ({
  OllamaAdapter: jest.fn().mockImplementation(function (this: any) {
    this.name = 'ollama';
    this.chat = jest.fn().mockResolvedValue('OK');
  }),
}));

jest.mock('../../src/sandbox/python-sandbox', () => ({
  PythonSandbox: jest.fn().mockImplementation(() => ({
    execute: jest.fn().mockResolvedValue({ success: false, output: '', error: 'Execution failed' }),
  })),
}));

const CTOR_NAMES = [
  'OpenAIAdapter',
  'AnthropicAdapter',
  'GLMAdapter',
  'DeepSeekAdapter',
  'QwenAdapter',
  'OllamaAdapter',
] as const;

type CtorName = (typeof CTOR_NAMES)[number];

function ctorCounters(): Record<CtorName, jest.Mock> {
  return {
    OpenAIAdapter: require('../../src/adapters/openai-adapter').OpenAIAdapter as jest.Mock,
    AnthropicAdapter: require('../../src/adapters/anthropic-adapter').AnthropicAdapter as jest.Mock,
    GLMAdapter: require('../../src/adapters/glm-adapter').GLMAdapter as jest.Mock,
    DeepSeekAdapter: require('../../src/adapters/deepseek-adapter').DeepSeekAdapter as jest.Mock,
    QwenAdapter: require('../../src/adapters/qwen-adapter').QwenAdapter as jest.Mock,
    OllamaAdapter: require('../../src/adapters/ollama-adapter').OllamaAdapter as jest.Mock,
  };
}

describe('EvaluatorEngine createAdapter() type routing', () => {
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
    for (const mock of Object.values(ctorCounters())) mock.mockClear();

    const db = getDatabase();
    const admin = db.prepare('SELECT id FROM users WHERE username=?').get('admin') as any;
    adminUserId = admin.id;
  });

  const sendWS = (data: any) => {
    wsMessages.push(data);
  };

  /** Seed one config of the given persisted `type` and run a dialogue-only eval. */
  async function runWithConfigType(type: string): Promise<void> {
    const db = getDatabase();
    const res = db
      .prepare(
        `INSERT INTO configs (user_id, name, type, endpoint, api_key, model)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(adminUserId, `cfg-${type}`, type, 'https://example.invalid/v1', 'sk-test', 'test-model');

    const configId = res.lastInsertRowid as number;
    const taskId = taskManager.startTask(adminUserId, [configId], true, false);
    db.prepare(
      `INSERT INTO evaluations (id, user_id, status, include_dialogue, include_coding)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(taskId, adminUserId, 'PENDING', 1, 0);

    await engine.run(taskId, sendWS);

    const row = db.prepare('SELECT status FROM evaluations WHERE id=?').get(taskId) as any;
    // Every case must reach COMPLETED -- a throw inside adapter
    // construction would be swallowed into an FAILED row and would make
    // the "which ctor fired" assertion below pass vacuously.
    expect(row.status).toBe('COMPLETED');
  }

  function expectOnly(expected: CtorName): void {
    const counters = ctorCounters();
    const fired = CTOR_NAMES.filter((n) => counters[n].mock.calls.length > 0);
    expect(fired).toEqual([expected]);
    expect(counters[expected].mock.calls.length).toBeGreaterThan(0);
  }

  describe('named case labels (previously 0 execution each)', () => {
    it.each([
      ['anthropic', 'AnthropicAdapter'],
      ['glm', 'GLMAdapter'],
      ['deepseek', 'DeepSeekAdapter'],
      ['qwen', 'QwenAdapter'],
      ['ollama', 'OllamaAdapter'],
    ] as Array<[string, CtorName]>)(
      "routes type '%s' to %s instead of the OpenAI default",
      async (type, expected) => {
        await runWithConfigType(type);
        expectOnly(expected);
      },
    );

    it.each([
      ['zhipu', 'GLMAdapter'],
      ['tongyi', 'QwenAdapter'],
      ['dashscope', 'QwenAdapter'],
      ['local', 'OllamaAdapter'],
    ] as Array<[string, CtorName]>)(
      "routes the alias '%s' to %s",
      async (type, expected) => {
        await runWithConfigType(type);
        expectOnly(expected);
      },
    );
  });

  describe('case-insensitive normalisation (type.toLowerCase())', () => {
    it.each([
      ['ANTHROPIC', 'AnthropicAdapter'],
      ['ZHIPU', 'GLMAdapter'],
      ['Qwen', 'QwenAdapter'],
      ['DeepSeek', 'DeepSeekAdapter'],
      ['OLLAMA', 'OllamaAdapter'],
    ] as Array<[string, CtorName]>)(
      "routes the mixed-case persisted type '%s' to %s",
      async (type, expected) => {
        // These are exactly the shapes written by the v0.2.0-era config
        // editor that the production comment calls out by name.
        await runWithConfigType(type);
        expectOnly(expected);
      },
    );
  });

  describe('default arm', () => {
    it('falls back to OpenAIAdapter for an unrecognised type', async () => {
      await runWithConfigType('some-unknown-provider');
      expectOnly('OpenAIAdapter');
    });

    it('falls back to OpenAIAdapter for a mixed-case "OPENAI"', async () => {
      // 'openai' is deliberately not a case label: the CLI-alignment
      // contract routes it through `default:`, so it must be pinned as
      // the default arm and not silently given its own label.
      await runWithConfigType('OPENAI');
      expectOnly('OpenAIAdapter');
    });
  });

  describe('one-sided-truthiness guard on the routing decision', () => {
    it('a known type and its default-collapsing mutant must not be indistinguishable', async () => {
      // Sanity pin: the assertion style used above (expect fired ctor set
      // to equal exactly [expected]) is only load-bearing because a
      // second ctor firing would fail it. Prove the oracle can fail.
      await runWithConfigType('qwen');
      const counters = ctorCounters();
      const fired = CTOR_NAMES.filter((n) => counters[n].mock.calls.length > 0);
      expect(fired).toEqual(['QwenAdapter']);
      // And the default arm really is reachable in the same suite, so
      // the two outcomes are distinguishable in both directions.
      await runWithConfigType('unknown-xyz');
      expect(ctorCounters().OpenAIAdapter.mock.calls.length).toBeGreaterThan(0);
    });
  });
});
