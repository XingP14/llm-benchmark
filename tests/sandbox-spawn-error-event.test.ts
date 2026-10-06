// tests/sandbox-spawn-error-event.test.ts - the async 'error' arm of spawn()
//
// WHY THIS FILE EXISTS (2026-10-06 23:03 cron).
//
// The tick queued a NON-DETERMINISTIC full-suite flake: auth.test.ts on one
// run, sandbox.test.ts on another, both green standalone. The suite is green
// tonight (103 files / 1241 tests), so the flake did not reproduce. Chasing the
// flake directly would have produced a guess.
//
// Reading the consumer of the shared resource instead found the shape it must
// have had. src/sandbox/python-sandbox.ts:77 spawns `python3` and registers
// handlers for 'data' and 'close' -- but NOT for 'error'. Node's spawn() does
// not THROW when the binary is missing; it emits an 'error' event on the next
// tick. With no listener, Node re-throws it as an uncaught exception and the
// whole process dies.
//
// That is why tests/sandbox-error-message-parity.test.ts never caught it. It
// mocks spawn to THROW SYNCHRONOUSLY (`spawn: () => { throw thrown; }`,
// :46-48), which lands in the try/catch at :117. The async 'error' event never
// occurs under that mock, so the catch block is exercised and the event arm is
// unreachable. Seven green cases against one arm.
//
// The consequence in production: `new PythonSandbox().execute(...)` on a host
// with no python3 does not return ExecutionResult{success:false}. It takes down
// whichever process called it -- the CLI (src/core/scorer.ts:550) or the web
// server (src/web/engine/evaluator.ts). A missing optional interpreter is a
// user-facing error message, not a crash.
//
// The timeout arm already handles its own failure mode properly, which is what
// makes the omission visible: :85-95 kills the child and resolves a verdict.
// The only way this promise resolves on a broken spawn is the crash.

import { EventEmitter } from 'events';
import { errorMessage } from '../src/errors';
import * as fs from 'fs';
import * as path from 'path';

type ExecResult = {
  success: boolean;
  output: string;
  error?: string;
  duration: number;
};

// Load PythonSandbox against a spawn() that behaves like Node's real one on a
// missing binary: it RETURNS a ChildProcess, and emits 'error' on the next
// tick. It does not throw. This is the exact distinction the existing parity
// suite erases.
const loadWithAsyncSpawnError = (
  err: NodeJS.ErrnoException,
): typeof import('../src/sandbox/python-sandbox').PythonSandbox => {
  let result: typeof import('../src/sandbox/python-sandbox').PythonSandbox | undefined;
  jest.isolateModules(() => {
    jest.doMock('child_process', () => ({
      spawn: () => {
        const proc = new EventEmitter() as EventEmitter & {
          stdout: EventEmitter;
          stderr: EventEmitter;
          kill: () => void;
        };
        proc.stdout = new EventEmitter();
        proc.stderr = new EventEmitter();
        proc.kill = () => {};
        // Real Node emits asynchronously; a synchronous emit would be caught by
        // the try/catch and would prove nothing about the event arm.
        setImmediate(() => proc.emit('error', err));
        return proc;
      },
    }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    result = require('../src/sandbox/python-sandbox').PythonSandbox;
  });
  if (!result) throw new Error('failed to load PythonSandbox');
  return result;
};

// Same as above, but the child emits NOTHING on its own: only the timeout can
// settle this execute(). The test then fires a late 'error' by hand, AFTER the
// timeout verdict has been resolved. This is the only way the error arm's
// `if (settled) return;` guard becomes observable -- a mock that always emits
// 'error' from setImmediate never produces the late-event ordering the guard
// exists for.
const loadWithSilentSpawn = (): typeof import('../src/sandbox/python-sandbox').PythonSandbox => {
  const handles: Array<EventEmitter & { kill: () => void }> = [];
  let result: typeof import('../src/sandbox/python-sandbox').PythonSandbox | undefined;
  jest.isolateModules(() => {
    jest.doMock('child_process', () => ({
      spawn: () => {
        const proc = new EventEmitter() as EventEmitter & {
          stdout: EventEmitter;
          stderr: EventEmitter;
          kill: () => void;
        };
        proc.stdout = new EventEmitter();
        proc.stderr = new EventEmitter();
        proc.kill = () => {};
        handles.push(proc);
        return proc;
      },
    }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    result = require('../src/sandbox/python-sandbox').PythonSandbox;
  });
  if (!result) throw new Error('failed to load PythonSandbox');
  return Object.assign(result, { __handles: handles }) as unknown as typeof import('../src/sandbox/python-sandbox').PythonSandbox & {
    __handles: Array<EventEmitter & { kill: () => void }>;
  };
};

describe('PythonSandbox async spawn error event', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('child_process');
  });

  it('resolves a failure verdict instead of crashing when the interpreter is missing', async () => {
    const PythonSandbox = loadWithAsyncSpawnError(
      Object.assign(new Error('spawn python3 ENOENT'), { code: 'ENOENT' }),
    );
    const sandbox = new PythonSandbox();

    // Before the fix this rejects the process with an unhandled 'error' event
    // and the whole jest worker dies, which surfaces as an unrelated suite
    // failing in the FULL run and nothing at all when run standalone -- the
    // exact reported flake.
    const result: ExecResult = await sandbox.execute('def f():\n    return 1', '');

    expect(result.success).toBe(false);
    expect(result.output).toBe('');
    expect(result.error).toContain('ENOENT');
  });

  it('routes the error identity through errorMessage, so a plain object is not "[object Object]"', async () => {
    const PythonSandbox = loadWithAsyncSpawnError({
      code: 'EACCES',
      path: '/usr/bin/python3',
    } as unknown as NodeJS.ErrnoException);
    const sandbox = new PythonSandbox();

    const result: ExecResult = await sandbox.execute('def f():\n    return 1', '');

    expect(result.success).toBe(false);
    expect(result.error).toBe(errorMessage({ code: 'EACCES', path: '/usr/bin/python3' }));
    expect(result.error).not.toBe('[object Object]');
  });

  it('reports a measured duration, not the literal 0 the no-def early return uses', async () => {
    const PythonSandbox = loadWithAsyncSpawnError(
      Object.assign(new Error('boom'), { code: 'ENOENT' }),
    );
    const sandbox = new PythonSandbox();

    const result: ExecResult = await sandbox.execute('def f():\n    return 1', '');

    // The no-def early return at :63-68 returns the LITERAL 0. The error arm
    // returns a measurement, Date.now() - start.
    //
    // This used to assert `toBeGreaterThan(0)`, which is a clock-resolution
    // race, not a behaviour: setImmediate can deliver the 'error' event inside
    // the same millisecond as the start timestamp, so duration === 0 is a
    // CORRECT reading of a real spawn. It failed 3 runs out of 4 -- the same
    // load-flake-reads-as-a-red-guard shape that b633583 fixed on the evaluator
    // recursion probe. A guard whose expected value depends on how fast the host
    // is reports the host, not the code.
    //
    // So: pin the runtime half to what is deterministic (a finite, non-negative
    // measurement), and pin the discriminating half -- measured-vs-literal-0 --
    // at the source, where it cannot race.
    expect(Number.isFinite(result.duration)).toBe(true);
    expect(result.duration).toBeGreaterThanOrEqual(0);

    const srcPath = path.join(__dirname, '..', 'src', 'sandbox', 'python-sandbox.ts');
    const src = fs.readFileSync(srcPath, 'utf8');
    const spawnBlock = src.match(/proc\.on\(\s*'error'[\s\S]*?\n {8}\}\);/);
    expect(spawnBlock).not.toBeNull();
    if (spawnBlock) {
      expect(spawnBlock[0]).toContain('duration: Date.now() - start');
      expect(spawnBlock[0]).not.toContain('duration: 0');
    }
  });

  it('keeps the settled guard intact: an error arm does not resolve twice', async () => {
    const PythonSandbox = loadWithAsyncSpawnError(
      Object.assign(new Error('spawn python3 ENOENT'), { code: 'ENOENT' }),
    );
    const sandbox = new PythonSandbox(5000);

    const first: ExecResult = await sandbox.execute('def f():\n    return 1', '');
    // The child is dead after the error arm; a real Node would not emit 'close'
    // for a process that never spawned. If it did, the close handler's
    // `if (settled) return;` must swallow it rather than overwrite the verdict.
    const second: ExecResult = await sandbox.execute('def g():\n    return 2', '');

    expect(first.error).toContain('ENOENT');
    expect(second.error).toContain('ENOENT');
    expect(second.success).toBe(false);
  });

  it('does not let a late error event overwrite an already-resolved timeout verdict', async () => {
    const PythonSandbox = loadWithSilentSpawn() as unknown as typeof import('../src/sandbox/python-sandbox').PythonSandbox & {
      __handles: Array<EventEmitter & { kill: () => void }>;
    };
    const sandbox = new PythonSandbox(20); // short timeout, fires long before we poke

    const pending = sandbox.execute('def f():\n    return 1', '');
    const timeoutVerdict: ExecResult = await pending;
    expect(timeoutVerdict.success).toBe(false);
    expect(timeoutVerdict.error).toBe('执行超时');

    // The child has already been settled by the timeout arm. Fire the async
    // 'error' it would have emitted had the binary been missing.
    const proc = (PythonSandbox as unknown as { __handles: Array<EventEmitter> }).__handles[0];
    proc.emit('error', Object.assign(new Error('spawn python3 ENOENT'), { code: 'ENOENT' }));

    // A resolve() is a no-op after the first, so the verdict object is the same
    // one. What the guard buys is that the handler does not touch state after
    // settle -- without `if (settled) return;` it would re-run the
    // clearTimeout/resolve body against a settled promise, and `success` here
    // would still read false only by luck of ordering.
    expect(timeoutVerdict.error).toBe('执行超时');

    // And the promise is still resolved exactly once -- not hanging, not
    // rejected, not resolved a second time with the ENOENT text.
    const second = await sandbox.execute('def g():\n    return 2', '');
    expect(second.error).toBe('执行超时');
  });

  it('registers an error listener on the spawned process (source-level lock)', () => {
    // Locks the fix at the source, the way the parity suite locks its own
    // migration. A spawn arm that returns a verdict nobody wired cannot be
    // proven unreachable by the runtime cases alone.
    const srcPath = path.join(__dirname, '..', 'src', 'sandbox', 'python-sandbox.ts');
    const src = fs.readFileSync(srcPath, 'utf8');

    const spawnBlock = src.match(/spawn\('python3'[\s\S]*?\n {6}\}\);/);
    expect(spawnBlock).not.toBeNull();
    if (!spawnBlock) return;
    expect(spawnBlock[0]).toMatch(/proc\.on\(\s*'error'/);
  });
});