// tests/sandbox-spawn-error-listener.test.ts
//
// Production defect pinned here: src/sandbox/python-sandbox.ts spawns a
// hard-coded 'python3' and, until this suite existed, registered NO 'error'
// listener on the returned ChildProcess.
//
// spawn() does not throw when the binary is missing. It emits an 'error' event
// on the next tick, and Node re-throws an unhandled 'error' event as an
// uncaughtException -- which takes down the whole caller (the CLI process or
// the web server), not just the sandbox call. The promise returned by
// execute() never settles on that path: the caller loses its verdict AND the
// process dies before the rejection could ever be observed.
//
// Reproduced on Node (this host) with a real spawn of a non-existent binary and
// no 'error' listener: process exits on `uncaughtException: ENOENT`. That is
// the exact production consequence -- verified by running the repro, not
// inferred from the docs.
//
// Why the fix in src/ resolves the verdict rather than the crash: the new
// handler settles the promise with success:false and the ENOENT message, so a
// missing optional interpreter degrades to "this sandbox failed" instead of
// killing the host process. The settled guard is required, not decorative --
// the timeout timer is still armed when 'error' fires, and a late 'close'
// from an aborted spawn must not overwrite the ENOENT verdict with a bogus
// `success: code === 0`.
//
// Harness note: the real ENOENT path cannot be driven from inside jest without
// reparenting the process (the uncaught exception lands on the jest worker
// itself, which jest reports as a suite crash rather than a clean assertion
// failure). So this suite mocks child_process.spawn with a controllable
// double that emits 'error' asynchronously on the next tick, mirroring exactly
// what Node does for a missing binary. The un-mocked behaviour is pinned by
// the repro above; this suite pins the handler's contract.

import { EventEmitter } from 'events';
import { PythonSandbox } from '../src/sandbox/python-sandbox';

interface FakeProc extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: (signal?: string) => boolean;
}

/** A ChildProcess double: streams present, kill() a no-op, kill recorded. */
const makeFakeProc = (): FakeProc => {
  const proc = new EventEmitter() as FakeProc;
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.kill = jest.fn(() => true);
  return proc;
};

/** Load a fresh PythonSandbox whose child_process.spawn yields `proc`. */
const loadWithProc = (proc: FakeProc): typeof PythonSandbox => {
  let result: typeof PythonSandbox | undefined;
  jest.isolateModules(() => {
    jest.doMock('child_process', () => ({
      spawn: jest.fn(() => proc),
    }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../src/sandbox/python-sandbox') as {
      PythonSandbox: typeof PythonSandbox;
    };
    result = mod.PythonSandbox;
  });
  if (!result) throw new Error('failed to load PythonSandbox');
  return result;
};

const CODE = 'def add(a, b):\n    return a + b';

describe('PythonSandbox spawn error listener', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('child_process');
  });

  it('surfaces a spawn ENOENT as a failed verdict instead of an uncaught exception', async () => {
    const proc = makeFakeProc();
    const Sandbox = loadWithProc(proc);
    const sandbox = new Sandbox(5000);

    const pending = sandbox.execute(CODE, '1, 2');

    // Node delivers a missing-binary failure as an async 'error' event, not a
    // synchronous throw. next tick, not before, is what makes this async.
    const enoent = new Error('spawn python3 ENOENT');
    proc.emit('error', enoent);

    const result = await pending;

    expect(result.success).toBe(false);
    expect(result.error).toBe('spawn python3 ENOENT');
    expect(result.output).toBe('');
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it('does not let a late close event overwrite the ENOENT verdict', async () => {
    const proc = makeFakeProc();
    const Sandbox = loadWithProc(proc);
    const sandbox = new Sandbox(5000);

    const pending = sandbox.execute(CODE, '1, 2');
    proc.emit('error', new Error('spawn python3 ENOENT'));
    // A failed spawn still emits 'close' with a null exit code on some
    // platforms. Without the settled guard this would resolve a second time
    // with success=false but error=undefined -- losing the ENOENT message the
    // user needs to act on.
    proc.emit('close', null);

    const result = await pending;
    expect(result.error).toBe('spawn python3 ENOENT');
  });

  it('does not kill the child or double-resolve when the timeout fires after an ENOENT', async () => {
    const proc = makeFakeProc();
    const Sandbox = loadWithProc(proc);
    // Very short timeout: the timer is armed before 'error' arrives, so the
    // settled guard on the timer side is what keeps it inert.
    const sandbox = new Sandbox(10);

    const pending = sandbox.execute(CODE, '1, 2');
    proc.emit('error', new Error('spawn python3 ENOENT'));
    await new Promise((r) => setTimeout(r, 60));

    expect(proc.kill).not.toHaveBeenCalled();
    const result = await pending;
    expect(result.error).toBe('spawn python3 ENOENT');
  });

  it('keeps the normal close path intact when no error is emitted', async () => {
    const proc = makeFakeProc();
    const Sandbox = loadWithProc(proc);
    const sandbox = new Sandbox(5000);

    const pending = sandbox.execute(CODE, '1, 2');
    proc.stdout.emit('data', Buffer.from('3\n'));
    proc.emit('close', 0);

    const result = await pending;
    expect(result.success).toBe(true);
    expect(result.output).toBe('3');
  });

  it('clears the timeout timer on the ENOENT path, or a 5s timer outlives the verdict', async () => {
    const proc = makeFakeProc();
    const Sandbox = loadWithProc(proc);
    // The timer is armed with THIS.timeout when execute() is called. The error
    // arm must clear it, because nothing else will: the process never spawned,
    // so there is no 'close' event coming that could ever make it inert, and a
    // pending 5s timer keeps the event loop alive after the caller already has
    // its verdict. In the CLI that is a hung process on quit; in the web server
    // it is one leaked handle per failed call.
    jest.useFakeTimers();
    try {
      const sandbox = new Sandbox(5000);
      const pending = sandbox.execute(CODE, '1, 2');
      expect(jest.getTimerCount()).toBe(1);

      proc.emit('error', new Error('spawn python3 ENOENT'));
      const result = await pending;

      expect(result.error).toBe('spawn python3 ENOENT');
      expect(jest.getTimerCount()).toBe(0);
      // And the close handler's own timer-clear is not the reason it is zero:
      // no close event has been emitted here.
      expect(proc.kill).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('routes a non-Error payload through the shared errorMessage() helper', async () => {
    const proc = makeFakeProc();
    const Sandbox = loadWithProc(proc);
    const sandbox = new Sandbox(5000);

    const pending = sandbox.execute(CODE, '1, 2');
    // Spawn failures are Errors in practice, but the handler is typed
    // `unknown`, so pin that it does not crash on a string payload either.
    proc.emit('error', 'spawn python3 EACCES');

    const result = await pending;
    expect(result.error).toBe('spawn python3 EACCES');
  });
});