// tests/web/r473-cancel-two-planes.test.ts
//
// R473 -- ONE OBJECT, TWO PLANES, THREE DEAD MEMBERS.
//
// The subject: `EvaluationTask` in src/web/engine/task.ts, the in-memory
// record of the single evaluation the web engine will run at a time, and the
// `evaluations` row in SQLite that the REST layer reads back.
//
// The finding this suite measures, not assumes:
//
//   F1  `EvaluationTask['status']` declares FIVE states, and exactly FOUR are
//       reachable from production. The fifth, 'CANCELLED', has NO writer:
//       `cancelEvaluation()` writes 'CANCELLED' to the DATABASE row and then
//       calls `taskManager.setCompleted()`, which sets the IN-MEMORY status to
//       'COMPLETED' and stamps `completedAt`. So after a cancelled run the two
//       planes disagree -- the row a GET /api/evaluations/:id reads says
//       CANCELLED, and the singleton the engine holds says COMPLETED, with a
//       completion timestamp on a run that did not complete.
//   F2  `EvaluationTask['userId']` has ZERO production readers. The engine
//       reads `task.includeDialogue` ... `task.includeMultiTurn` and nothing
//       else off the task, so the ownership field that
//       websocket-multi-client-and-cancel-scoping.test.ts case (4) shows is
//       needed to scope a cancel is already carried and already unread.
//   F3  `taskManager.clear()` has ZERO production callers. Every one of the 8
//       call sites in the tree is in a test's beforeEach. So the task slot is
//       never released in a running hub; a second startTask is gated on
//       `status === 'RUNNING'`, not on the slot being free.
//
// WHY THIS MATTERS. `getCurrentTask()` is what `EvaluatorEngine.run()` reads
// at its top, and the REST cancel surface reaches `requestCancel()` over a
// WebSocket that the sibling suite already showed is unscoped. A record that
// cannot represent its own terminal cancelled state is why that fix has
// nothing to assert against: `startTask`'s guard is a status comparison, and
// after a cancel the status says the run finished.
//
// CHARACTERISATION, NOT A RED ARM (AGENTS.md rule 1). Case (1) asserts the
// measured value 'COMPLETED', which is the DEFECT, and says so in-source:
// adding a `setCancelled()` flips it to 'CANCELLED' on purpose. That is the
// intended signal for a future repair, not a regression.
//
// WHAT THE MATRIX HAS TO PROVE (see hub/scripts-equivalent notes in the
// commit body). Arms (2), (4) and (5) are CENSUS arms -- they count writers
// and readers in the source tree. A census arm is unfailable unless something
// else moves, so the matrix mutates in exactly that direction: M1 plants the
// missing writer, M5 plants the missing reader. Both must die.

import { EvaluatorEngine } from '../../src/web/engine/evaluator';
import { taskManager } from '../../src/web/engine/task';
import {
  resetDatabase,
  initAdminUser,
  resetSingleton,
  getDatabase,
} from '../../src/web/db/database';

const dialogueFixtures: any[] = [];

jest.mock('../../src/benchmarks/dialogue', () => ({
  getAllDialogueBenchmarks: () => dialogueFixtures,
}));
jest.mock('../../src/benchmarks/multi-turn', () => ({
  getAllMultiTurnBenchmarks: () => [],
}));
jest.mock('../../src/benchmarks/coding', () => ({
  getAllCodeBenchmarks: () => [],
}));
jest.mock('../../src/benchmarks/function-calling', () => ({
  getAllFunctionCallingBenchmarks: () => [],
}));
jest.mock('../../src/benchmarks/long-context', () => ({
  getAllLongContextBenchmarks: () => [],
}));

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

// ---------------------------------------------------------------------------
// Source census helpers. These walk the production tree, not the test tree, so
// a census arm is measured against the same subject set production ships.
// ---------------------------------------------------------------------------

import * as fs from 'fs';
import * as path from 'path';

const REPO = path.join(__dirname, '..', '..');
const SRC = path.join(REPO, 'src');
const TASK_TS = path.join(SRC, 'web', 'engine', 'task.ts');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (entry.name.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

const ALL_SRC = sourceFiles(SRC);

describe('R473 -- EvaluationTask and the evaluations row are two planes with three dead members', () => {
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
    chatSpy.mockResolvedValue('OK');
    dialogueFixtures.length = 0;
    const db = getDatabase();
    adminUserId = (db.prepare('SELECT id FROM users WHERE username=?').get('admin') as any).id;
  });

  const sendWS = (data: any) => {
    wsMessages.push(data);
  };

  function seedConfig(): number {
    const db = getDatabase();
    return db
      .prepare(
        `INSERT INTO configs (user_id, name, type, endpoint, api_key, model)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(adminUserId, 'cfg', 'openai', 'https://example.invalid/v1', 'sk-test', 'test-model')
      .lastInsertRowid as number;
  }

  /** Start a task whose run will be cancelled after the first question. */
  function startCancellableTask(questions: string[]): string {
    const db = getDatabase();
    const configId = seedConfig();
    questions.forEach((id, i) => {
      dialogueFixtures.push({
        id,
        category: 'knowledge',
        type: 'dialogue',
        content: 'hi',
        referenceAnswer: 'OK',
        weight: i + 1,
      });
    });
    const taskId = taskManager.startTask(adminUserId, [configId], true, false);
    db.prepare(
      `INSERT INTO evaluations (id, user_id, status, include_dialogue, include_coding, include_function_calling, include_long_context, include_multi_turn)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(taskId, adminUserId, 'PENDING', 1, 0, 0, 0, 0);
    return taskId;
  }

  function rowStatus(id: string): string {
    return (getDatabase().prepare('SELECT status FROM evaluations WHERE id=?').get(id) as any).status;
  }

  function rowCompletedAt(id: string): string | null {
    return (getDatabase().prepare('SELECT completed_at FROM evaluations WHERE id=?').get(id) as any)
      .completed_at;
  }

  it('(0) the task singleton is a real callable, so a renamed export fails here and not vacuously later', () => {
    expect(typeof taskManager.getCurrentTask).toBe('function');
    expect(typeof taskManager.clear).toBe('function');
    expect(taskManager.getCurrentTask()).toBeNull();
  });

  // -------------------------------------------------------------------------
  // F1 -- the two planes disagree after a cancel
  // -------------------------------------------------------------------------
  it('(1) a cancelled run leaves the ROW CANCELLED and the IN-MEMORY task COMPLETED', async () => {
    const taskId = startCancellableTask(['dial-a', 'dial-b']);
    // Cancel from inside chat(): the guard is read at the TOP of the next
    // question iteration, so question one finishes and question two never runs.
    chatSpy.mockImplementation(async () => {
      taskManager.requestCancel();
      return 'OK';
    });

    await engine.run(taskId, sendWS);

    // CONTROL -- the cancel genuinely reached the run. Without this, "the row
    // says CANCELLED" could be true because the row was never written at all.
    expect(rowStatus(taskId)).toBe('CANCELLED');
    expect(wsMessages.some((m: any) => m.type === 'cancelled')).toBe(true);
    expect(wsMessages.some((m: any) => m.type === 'completed')).toBe(false);

    // THE DEFECT, CHARACTERISED. The in-memory status is 'COMPLETED'.
    // A repair that adds TaskManager.setCancelled() and calls it from
    // cancelEvaluation() flips exactly this line to 'CANCELLED' -- on purpose.
    expect(taskManager.getCurrentTask()!.status).toBe('COMPLETED');
    // ... and it is stamped with a completion timestamp, on a run that was
    // cancelled rather than completed.
    expect(taskManager.getCurrentTask()!.completedAt).toBeInstanceOf(Date);
  });

  it('(2) CENSUS -- no production site assigns the CANCELLED state to an in-memory task status', () => {
    // The in-memory assignments all live INSIDE task.ts (setCompleted /
    // setFailed / setRunning assign `this.currentTask.status = ...`), so the
    // walk must cover task.ts too. The only line legitimately naming the
    // literal is the TYPE UNION on the interface, which is a declaration and
    // not an assignment -- so the arm skips lines matching `status:` and keeps
    // every `status =`.
    const writers: string[] = [];
    for (const file of ALL_SRC) {
      const text = fs.readFileSync(file, 'utf-8');
      text.split('\n').forEach((line, i) => {
        if (!/\.status\s*=/.test(line)) return;
        if (!line.includes('CANCELLED')) return;
        writers.push(`${path.relative(REPO, file)}:${i + 1}: ${line.trim()}`);
      });
    }
    // M1 plants exactly this writer (a setCancelled() that sets the status),
    // and it must make this case fail. If a repair ever routes the cancel
    // through the status, this arm goes red ON PURPOSE -- update it then.
    expect(writers).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // CONTROL for arm (2): the OTHER terminal states ARE written in memory, so a
  // green arm (2) is a census result and not a broken walker. This arm is what
  // makes arm (2) mean something -- without it, an always-empty walker and a
  // genuinely-unwritten state are indistinguishable.
  // -------------------------------------------------------------------------
  it('(3) CONTROL -- the same walk finds the OTHER two terminal assignments', () => {
    const assignments: string[] = [];
    for (const file of ALL_SRC) {
      const text = fs.readFileSync(file, 'utf-8');
      text.split('\n').forEach((line) => {
        if (/\.status\s*=/.test(line)) assignments.push(line.trim());
      });
    }
    // task.ts's own setCompleted / setFailed are the two. That asymmetry --
    // three terminal states declared, two written -- IS the finding, asserted
    // from the same walk that produced arm (2).
    const joined = assignments.join('|');
    expect(joined).toContain("'COMPLETED'");
    expect(joined).toContain("'FAILED'");
    expect(joined).not.toContain('CANCELLED');
  });

  // -------------------------------------------------------------------------
  // F2 -- EvaluationTask.userId has zero production readers
  // -------------------------------------------------------------------------
  it('(4) CENSUS -- no production file reads userId off the task returned by getCurrentTask()', () => {
    // The ONLY way to reach an EvaluationTask from production is
    // getCurrentTask(), so the reader set is exactly the files that call it.
    // Deriving the subject set this way means a new reader anywhere is
    // caught, rather than a hand-listed pair.
    const readers: string[] = [];
    for (const file of ALL_SRC) {
      if (file === TASK_TS) continue;
      const text = fs.readFileSync(file, 'utf-8');
      if (!text.includes('getCurrentTask()')) continue;
      text.split('\n').forEach((line, i) => {
        if (!/\buserId\b/.test(line)) return;
        readers.push(`${path.relative(REPO, file)}:${i + 1}: ${line.trim()}`);
      });
    }
    // M5 plants a reader (`const owner = task.userId;` inside evaluator.ts
    // run()) and must kill this. If a repair scopes the cancel to the task
    // owner, this arm goes red ON PURPOSE -- that is the repair landing.
    expect(readers).toEqual([]);
  });

  it('(5) CENSUS -- taskManager.clear() has no production caller', () => {
    const callers: string[] = [];
    for (const file of ALL_SRC) {
      if (file === TASK_TS) continue;
      const text = fs.readFileSync(file, 'utf-8');
      if (!/taskManager\s*\.\s*clear\s*\(/.test(text)) continue;
      callers.push(path.relative(REPO, file));
    }
    // Every call site in the tree is a test beforeEach. A production clear()
    // would flip this; that would also be the natural first half of the
    // repair for F3, so it is red ON PURPOSE.
    expect(callers).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // The gate that F3 hangs off: startTask is gated on a STATUS, not on the
  // slot being free. Characterised, because the repair is a behaviour call.
  // -------------------------------------------------------------------------
  it('(6) a COMPLETED in-memory task does not block the next startTask', () => {
    const first = startCancellableTask(['dial-a']);
    taskManager.setCompleted();
    const second = taskManager.startTask(adminUserId, [seedConfig()], true, false);
    expect(second).not.toBe(first);
    expect(taskManager.getCurrentTask()!.id).toBe(second);
  });

  it('(7) a RUNNING in-memory task does block it -- the control for arm (6)', () => {
    startCancellableTask(['dial-a']);
    taskManager.setRunning();
    expect(() => taskManager.startTask(adminUserId, [seedConfig()], true, false)).toThrow(
      'Another evaluation is running',
    );
  });
});
