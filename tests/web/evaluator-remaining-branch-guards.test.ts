// tests/web/evaluator-remaining-branch-guards.test.ts
//
// Closes the 8 branch arms in src/web/engine/evaluator.ts that had zero
// execution at d96b388 (branches 43/51, per coverage/coverage-final.json):
//
//   L31   `process.env.NODE_ENV !== 'test' && !process.env.JEST_WORKER_ID`
//         -> the SECOND operand is never evaluated under jest, because
//            NODE_ENV === 'test' short-circuits the &&. The documented
//            backstop ("stay quiet even outside NODE_ENV=test but inside a
//            jest worker") is unverified.
//   L33   `if (shouldLog) console.error(...)` -> never true in any test, so the
//         log emission path had zero execution.
//   L115  the INNER `taskManager.isCancelled()` guard (the per-question one).
//         Every pre-existing cancellation test cancels BEFORE run(), so it
//         leaves via the L103 outer guard and the inner guard is dead.
//   L128  `mtQuestion.turns || []` -> every shipped multi_turn fixture in
//         src/benchmarks/multi-turn.ts carries a populated `turns` array.
//   L152  `question.referenceAnswer || ''` in the ERROR-row insert. No test
//         ever failed a question: adapter.chat always resolves, and every
//         dialogue fixture has a referenceAnswer, so both halves are dark.
//         (KILLABLE -- replacing the operand with a sentinel is 1 red.)
//   L230  `dbConfig.model ?? undefined` -> every seeded config row sets a
//         model, and configs.model is a nullable column.
//   L300  `question.referenceAnswer || ''` in scoreDialogue. All 13 shipped
//         dialogue questions define a referenceAnswer, so the empty-ref arm
//         (score stays 50 even for a long, on-topic answer) never ran.
//         (EXECUTED but the `||` itself is an EQUIVALENT MUTANT -- see the note
//         in that describe block. Do not count it as a killed mutant.)
//   L333  `if (!funcMatch) return { score: 50 }` in scoreCoding. Reaching it
//         needs an output that contains the literal "def " and "return" but
//         has no `def <word>(` signature -- no real model emits that, and no
//         fixture was built to.
//
// WHY THESE MATTER
//
// L115 is a real product path: POST /api/evaluations hands a live
// requestCancel() (DELETE /api/evaluations/current) to a run that is midway
// through its question list. Cancelling only at the config boundary would
// still burn the whole remaining question set of the current config.
//
// L128 / L300 / L152 are the two prompt-shape and two persistence
// fallbacks. A regression that dropped `|| []` on turns would send a
// multi_turn question with no `turns` to the adapter as an EMPTY array
// instead of falling back, and every existing suite stays green because
// chat() is mocked and no shipped fixture is degenerate.
//
// L333 is the only grade between "code has a def and a return but does not
// run" (60) and "code has no recognisable function definition at all" (50);
// it is the arm that stops an unparseable answer from being reported as
// merely unsandboxed.
//
// The assertions are on OBSERVABLE STATE (persisted rows, WS frames,
// chat() arguments, console.error calls) rather than on absence-of-throw,
// and every engine run asserts the evaluation reached a terminal non-FAILED
// status first, so a swallowed exception cannot produce a vacuous pass.

import { EvaluatorEngine, logEvaluationError } from '../../src/web/engine/evaluator';
import { taskManager } from '../../src/web/engine/task';
import {
  resetDatabase,
  initAdminUser,
  resetSingleton,
  getDatabase,
} from '../../src/web/db/database';

// The two benchmark modules are mocked so degenerate questions can be
// injected: a dialogue question with no referenceAnswer (L300) and a
// multi_turn question with no turns (L128). Both shapes are legal under
// BenchmarkQuestion -- referenceAnswer? and turns are optional -- so this
// asserts production behaviour on a shape the shipped fixtures happen not to
// contain, rather than a shape the type system forbids.
const dialogueFixtures: any[] = [];
const multiTurnFixtures: any[] = [];

jest.mock('../../src/benchmarks/dialogue', () => ({
  getAllDialogueBenchmarks: () => dialogueFixtures,
}));
jest.mock('../../src/benchmarks/multi-turn', () => ({
  getAllMultiTurnBenchmarks: () => multiTurnFixtures,
}));
jest.mock('../../src/benchmarks/coding', () => ({
  getAllCodeBenchmarks: () => codeFixtures,
}));
jest.mock('../../src/benchmarks/function-calling', () => ({
  getAllFunctionCallingBenchmarks: () => [],
}));
jest.mock('../../src/benchmarks/long-context', () => ({
  getAllLongContextBenchmarks: () => [],
}));

const codeFixtures: any[] = [];

const chatSpy = jest.fn();
const sandboxExecute = jest.fn();

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
    execute: (...args: unknown[]) => sandboxExecute(...args),
  })),
}));

interface ResultRow {
  question_id: string;
  question_type: string;
  model_output: string;
  score: number;
  reference_answer: string;
}

describe('EvaluatorEngine remaining branch guards', () => {
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
    sandboxExecute.mockReset();
    sandboxExecute.mockResolvedValue({ success: false, output: '', error: 'Execution failed' });
    dialogueFixtures.length = 0;
    multiTurnFixtures.length = 0;
    codeFixtures.length = 0;

    const db = getDatabase();
    const admin = db.prepare('SELECT id FROM users WHERE username=?').get('admin') as any;
    adminUserId = admin.id;
  });

  const sendWS = (data: any) => {
    wsMessages.push(data);
  };

  function seedConfig(model: string | null = 'test-model'): number {
    const db = getDatabase();
    const res = db
      .prepare(
        `INSERT INTO configs (user_id, name, type, endpoint, api_key, model)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(adminUserId, 'cfg', 'openai', 'https://example.invalid/v1', 'sk-test', model);
    return res.lastInsertRowid as number;
  }

  function startTask(configId: number, flags: {
    dialogue?: boolean;
    coding?: boolean;
    multiTurn?: boolean;
  }): string {
    const db = getDatabase();
    const taskId = taskManager.startTask(
      adminUserId,
      [configId],
      flags.dialogue ?? false,
      flags.coding ?? false,
      false,
      false,
      flags.multiTurn ?? false,
    );
    db.prepare(
      `INSERT INTO evaluations (id, user_id, status, include_dialogue, include_coding, include_function_calling, include_long_context, include_multi_turn)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      taskId,
      adminUserId,
      'PENDING',
      flags.dialogue ? 1 : 0,
      flags.coding ? 1 : 0,
      0,
      0,
      flags.multiTurn ? 1 : 0,
    );
    return taskId;
  }

  function resultsFor(evaluationId: string): ResultRow[] {
    return getDatabase()
      .prepare(
        'SELECT question_id, question_type, model_output, score, reference_answer FROM results WHERE evaluation_id=? ORDER BY question_id',
      )
      .all(evaluationId) as ResultRow[];
  }

  function statusOf(evaluationId: string): string {
    const row = getDatabase()
      .prepare('SELECT status FROM evaluations WHERE id=?')
      .get(evaluationId) as any;
    return row.status;
  }

  // ---------------------------------------------------------------------
  // L230 -- `dbConfig.model ?? undefined`
  // ---------------------------------------------------------------------
  describe('buildModelConfig nullable model column', () => {
    it('passes a null configs.model through as undefined rather than as null', async () => {
      const configId = seedConfig(null);
      chatSpy.mockResolvedValue('OK');
      const taskId = startTask(configId, { dialogue: true });
      dialogueFixtures.push({
        id: 'dial-noref-model-null-001',
        category: 'knowledge',
        type: 'dialogue',
        content: 'hi',
        referenceAnswer: 'OK',
        weight: 1,
      });

      await engine.run(taskId, sendWS);

      expect(statusOf(taskId)).toBe('COMPLETED');
      expect(chatSpy).toHaveBeenCalledTimes(1);
      const modelConfig = chatSpy.mock.calls[0][1] as any;
      // The column is NULL in SQLite; `?? undefined` is what turns it into the
      // absent property the adapters branch on, instead of a null that would
      // be sent verbatim as the model name.
      expect(modelConfig.model).toBeUndefined();
      expect(Object.prototype.hasOwnProperty.call(modelConfig, 'model')).toBe(true);
    });

    it('keeps a populated model column intact (guards against an over-eager fallback)', async () => {
      const configId = seedConfig('gpt-4o-mini');
      chatSpy.mockResolvedValue('OK');
      const taskId = startTask(configId, { dialogue: true });
      dialogueFixtures.push({
        id: 'dial-model-set-001',
        category: 'knowledge',
        type: 'dialogue',
        content: 'hi',
        referenceAnswer: 'OK',
        weight: 1,
      });

      await engine.run(taskId, sendWS);

      expect(statusOf(taskId)).toBe('COMPLETED');
      expect((chatSpy.mock.calls[0][1] as any).model).toBe('gpt-4o-mini');
    });
  });

  // ---------------------------------------------------------------------
  // L300 -- `question.referenceAnswer || ''` in scoreDialogue
  // ---------------------------------------------------------------------
  describe('scoreDialogue empty-reference branch', () => {
    // HONEST NOTE ON KILLABILITY, verified by mutation run (all reverted):
    //   `question.referenceAnswer || ''` -> `question.referenceAnswer`  SURVIVES
    //   `question.referenceAnswer || 'SENTINEL'`                          SURVIVES
    // The `|| ''` is an EQUIVALENT MUTANT, not an untested behaviour: `ref` is
    // only ever read behind `if (ref)`, so '' and undefined are
    // indistinguishable, and npx tsc --noEmit stays green without the fallback
    // (referenceAnswer? is `string | undefined` and `ref.split` is narrowed by
    // the guard). The two tests below therefore pin the BEHAVIOUR the fallback
    // exists to protect -- a reference-less question must score base+length and
    // must not crash the scorer -- rather than the `||` token itself. The
    // surrounding logic IS killable and both mutants below are caught:
    //   `if (ref) {` -> `if (true) {`            2 red (the +30 must not fire)
    //   `output.length > 10` -> `> 0`             1 red
    // Ship it as a coverage closure and a behaviour gate, NOT as proof that the
    // fallback is load-bearing; do not count it as a closed mutant below.
    it('caps an empty reference at the base 50 plus length, even for an on-topic long answer', async () => {
      const configId = seedConfig();
      // A long answer that would otherwise earn the +30 reference-match bonus.
      chatSpy.mockResolvedValue('100摄氏度（标准大气压下）boiling point is a well known fact');
      const taskId = startTask(configId, { dialogue: true });
      dialogueFixtures.push({
        id: 'dial-noref-001',
        category: 'knowledge',
        type: 'dialogue',
        content: '水的沸点是多少？',
        // referenceAnswer deliberately absent -- legal, the field is optional.
        weight: 1,
      });

      await engine.run(taskId, sendWS);

      expect(statusOf(taskId)).toBe('COMPLETED');
      const rows = resultsFor(taskId);
      expect(rows).toHaveLength(1);
      // 50 base + 20 (length > 10) = 70. The +30 arm cannot fire, because
      // `ref` is '' and `ref.split(...)` on the empty string still yields one
      // falsy element -- `if (ref)` short-circuits before the split.
      expect(rows[0].score).toBe(70);
      expect(rows[0].reference_answer).toBe('');
    });

    it('an empty reference does not crash the scorer (the .split() on "" arm)', async () => {
      const configId = seedConfig();
      chatSpy.mockResolvedValue('short');
      const taskId = startTask(configId, { dialogue: true });
      dialogueFixtures.push({
        id: 'dial-noref-002',
        category: 'knowledge',
        type: 'dialogue',
        content: 'x',
        referenceAnswer: '',
        weight: 1,
      });

      await engine.run(taskId, sendWS);

      expect(statusOf(taskId)).toBe('COMPLETED');
      expect(resultsFor(taskId)[0].score).toBe(50);
    });
  });

  // ---------------------------------------------------------------------
  // L128 -- `mtQuestion.turns || []`
  // ---------------------------------------------------------------------
  describe('multi_turn prompt shape with a missing turns array', () => {
    it('sends an empty message array, not [undefined content], for a turns-less question', async () => {
      const configId = seedConfig();
      chatSpy.mockResolvedValue('OK');
      const taskId = startTask(configId, { multiTurn: true });
      multiTurnFixtures.push({
        id: 'mt-noturns-001',
        category: 'multi_turn',
        type: 'multi_turn',
        content: '这段对话的第二轮被模型截断了',
        // turns deliberately absent.
        required: ['OK'],
        forbidden: [],
        weight: 1,
      });

      await engine.run(taskId, sendWS);

      expect(statusOf(taskId)).toBe('COMPLETED');
      expect(chatSpy).toHaveBeenCalledTimes(1);
      const [messages] = chatSpy.mock.calls[0] as any[];
      // `turns || []` keeps this an empty ARRAY. A regression to `turns` alone
      // would hand the adapter undefined and every downstream adapter would
      // throw on messages[0].role, which the per-question catch would swallow
      // into a zero-score error row -- the run would still read COMPLETED.
      expect(Array.isArray(messages)).toBe(true);
      expect(messages).toEqual([]);

      const rows = resultsFor(taskId);
      expect(rows).toHaveLength(1);
      // No error row: the empty-array fallback ran, so chat() resolved and the
      // multi_turn scorer graded the output rather than the catch block.
      expect(rows[0].model_output).toBe('OK');
      expect(rows[0].score).toBe(100);
    });
  });

  // ---------------------------------------------------------------------
  // L152 -- `question.referenceAnswer || ''` in the ERROR-row insert
  // ---------------------------------------------------------------------
  describe('error row persistence for a reference-less question', () => {
    it('records the thrown message with an empty reference and a zero score', async () => {
      const configId = seedConfig();
      chatSpy.mockRejectedValue(new Error('upstream 503'));
      const taskId = startTask(configId, { coding: true });
      codeFixtures.push({
        id: 'code-noref-001',
        category: 'syntax',
        type: 'coding',
        language: 'python',
        content: '写一个函数',
        // referenceAnswer absent -- all 11 shipped coding fixtures omit it,
        // so the error row is the only place this fallback is reached.
        testCases: [],
        weight: 1,
      });

      await engine.run(taskId, sendWS);

      expect(statusOf(taskId)).toBe('COMPLETED');
      const rows = resultsFor(taskId);
      expect(rows).toHaveLength(1);
      expect(rows[0].model_output).toBe('Error: upstream 503');
      expect(rows[0].score).toBe(0);
      expect(rows[0].reference_answer).toBe('');
    });
  });

  // ---------------------------------------------------------------------
  // L115 -- the INNER isCancelled() guard
  // ---------------------------------------------------------------------
  describe('mid-run cancellation via the per-question guard', () => {
    it('stops after the question in flight instead of finishing the dimension', async () => {
      const configId = seedConfig();
      // Cancel while the first question is being answered. The guard is read
      // at the TOP of each question iteration, so question 1 completes and
      // question 2 never starts.
      chatSpy.mockImplementation(async () => {
        taskManager.requestCancel();
        return 'OK';
      });
      const taskId = startTask(configId, { dialogue: true });
      ['dial-a', 'dial-b', 'dial-c', 'dial-d'].forEach((id) => {
        dialogueFixtures.push({
          id,
          category: 'knowledge',
          type: 'dialogue',
          content: 'hi',
          referenceAnswer: 'OK',
          weight: 1,
        });
      });

      await engine.run(taskId, sendWS);

      expect(statusOf(taskId)).toBe('CANCELLED');
      const rows = resultsFor(taskId);
      expect(rows).toHaveLength(1);
      expect(rows[0].question_id).toBe('dial-a');
      // The cancelled frame, not a completed one.
      expect(wsMessages.some((m: any) => m.type === 'cancelled')).toBe(true);
      expect(wsMessages.some((m: any) => m.type === 'completed')).toBe(false);
    });

    it('a cancel requested before the run is still caught by the outer config guard', async () => {
      const configId = seedConfig();
      chatSpy.mockResolvedValue('OK');
      const taskId = startTask(configId, { dialogue: true });
      ['dial-x', 'dial-y'].forEach((id) => {
        dialogueFixtures.push({
          id,
          category: 'knowledge',
          type: 'dialogue',
          content: 'hi',
          referenceAnswer: 'OK',
          weight: 1,
        });
      });
      taskManager.requestCancel();

      await engine.run(taskId, sendWS);

      expect(statusOf(taskId)).toBe('CANCELLED');
      expect(resultsFor(taskId)).toHaveLength(0);
      // Nothing was ever handed to the adapter.
      expect(chatSpy).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------
  // L333 -- `if (!funcMatch) return { score: 50 }` in scoreCoding
  // ---------------------------------------------------------------------
  describe('scoreCoding unparseable-def branch', () => {
    it('grades an unrecognisable def at 50, below the sandboxed 60 and above no-def 20', async () => {
      const configId = seedConfig();
      // Contains the literal "def " and "return" (so the hasDef/hasReturn
      // guards both pass) but the /def\s+(\w+)\s*\(/ signature does not match,
      // because a non-word char follows the space.
      chatSpy.mockResolvedValue('def +-foo(x):\n    return 1');
      sandboxExecute.mockResolvedValue({ success: true, output: 'OK', error: '' });
      const taskId = startTask(configId, { coding: true });
      codeFixtures.push({
        id: 'code-weird-def-001',
        category: 'syntax',
        type: 'coding',
        language: 'python',
        content: '写一个函数',
        testCases: [],
        weight: 1,
      });

      await engine.run(taskId, sendWS);

      expect(statusOf(taskId)).toBe('COMPLETED');
      const rows = resultsFor(taskId);
      expect(rows).toHaveLength(1);
      expect(rows[0].score).toBe(50);
      // The early return happened before the sandbox was ever consulted, which
      // is the distinguishing observable: 60 means the sandbox ran and failed.
      expect(sandboxExecute).not.toHaveBeenCalled();
    });

    it('still reaches the sandbox and returns 80 for a well-formed def that runs', async () => {
      const configId = seedConfig();
      chatSpy.mockResolvedValue('def add(a, b):\n    return a + b');
      sandboxExecute.mockResolvedValue({ success: true, output: 'OK', error: '' });
      const taskId = startTask(configId, { coding: true });
      codeFixtures.push({
        id: 'code-good-def-001',
        category: 'syntax',
        type: 'coding',
        language: 'python',
        content: '写一个函数',
        testCases: [],
        weight: 1,
      });

      await engine.run(taskId, sendWS);

      expect(statusOf(taskId)).toBe('COMPLETED');
      expect(resultsFor(taskId)[0].score).toBe(80);
      expect(sandboxExecute).toHaveBeenCalledTimes(1);
    });
  });
});

// -------------------------------------------------------------------------
// L31 / L33 -- the log gate's second operand and the emission path.
//
// These need a module instance whose module-level `shouldLog` constant was
// computed under a non-test NODE_ENV, which no amount of process.env poking
// after import can achieve -- hence jest.isolateModules per case.
// -------------------------------------------------------------------------
describe('logEvaluationError gate (fresh module instances)', () => {
  const envBackup = {
    NODE_ENV: process.env.NODE_ENV,
    JEST_WORKER_ID: process.env.JEST_WORKER_ID,
  };

  afterEach(() => {
    if (envBackup.NODE_ENV === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = envBackup.NODE_ENV;
    if (envBackup.JEST_WORKER_ID === undefined) delete process.env.JEST_WORKER_ID;
    else process.env.JEST_WORKER_ID = envBackup.JEST_WORKER_ID;
    jest.restoreAllMocks();
  });

  function freshEvaluator(): typeof import('../../src/web/engine/evaluator') {
    let mod!: typeof import('../../src/web/engine/evaluator');
    jest.isolateModules(() => {
      mod = require('../../src/web/engine/evaluator') as typeof import('../../src/web/engine/evaluator');
    });
    return mod;
  }

  it('suppresses the error log when NODE_ENV=test even outside a jest worker', () => {
    process.env.NODE_ENV = 'test';
    delete process.env.JEST_WORKER_ID;
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    freshEvaluator().logEvaluationError('boom', new Error('detail'));

    expect(spy).not.toHaveBeenCalled();
  });

  it('suppresses the error log when JEST_WORKER_ID is set despite a production NODE_ENV', () => {
    // The documented backstop and the L31 second operand. Without it, any
    // suite that runs with NODE_ENV=production (a deploy smoke test, a
    // wrapper script) would spray stack traces into the reporter output and
    // could corrupt a CSV written to the same fd.
    process.env.NODE_ENV = 'production';
    process.env.JEST_WORKER_ID = '3';
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    freshEvaluator().logEvaluationError('boom', new Error('detail'));

    expect(spy).not.toHaveBeenCalled();
  });

  it('emits the error log in a real production process', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.JEST_WORKER_ID;
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    freshEvaluator().logEvaluationError('Error evaluating q-1:', new Error('upstream 503'));

    // L33 was never true anywhere in the suite, so the emission format itself
    // was unverified: message first, then the normalised error text.
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('Error evaluating q-1:', 'upstream 503');
  });

  it('normalises a non-Error throwable to its string form', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.JEST_WORKER_ID;
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    freshEvaluator().logEvaluationError('odd', 'a bare string');

    expect(spy).toHaveBeenCalledWith('odd', 'a bare string');
  });
});
