// tests/sandbox-settled-guard.test.ts - PythonSandbox settled-guard branch coverage
//
// python-sandbox.ts guards both the timeout handler (:86) and the close handler
// (:106) with `if (settled) return;`. Only the close-handler true arm is
// reachable in production: the timeout handler sets `settled = true` and kills
// the child, so the child's `close` event necessarily arrives afterwards and
// must be swallowed -- otherwise it would resolve the ExecutionResult a second
// time, overwriting the "执行超时" (execution timed out) verdict with a bogus
// `success: code === 0` result from a SIGTERM-killed process.
//
// This suite pins that late-close suppression path. The :86 arm (settled already
// true when the timer fires) is unreachable dead defence and is deliberately
// left uncovered.

import { PythonSandbox } from '../src/sandbox/python-sandbox';

describe('PythonSandbox settled guard', () => {
  it('reports 执行超时 once and does not let the late close event overwrite it', async () => {
    // Short timeout + a genuinely non-terminating function: the timer must win.
    const sandbox = new PythonSandbox(300);
    const code = 'def spin():\n    while True:\n        pass';

    const result = await sandbox.execute(code, '');

    expect(result.success).toBe(false);
    expect(result.error).toBe('执行超时');
    // The partial stdout captured before the kill is still reported.
    expect(result.output).toBe('');
    // A killed process that printed nothing must not be reported as successful.
    expect(result.duration).toBeGreaterThan(0);
  });

  it('keeps the timeout verdict for an infinite loop that emits output before hanging', async () => {
    // Same race, but with stdout already flushed: the timeout branch reports the
    // captured output alongside the timeout error, and the later close must not
    // re-resolve with success=false/error=<SIGTERM stderr> from proc.stderr.
    //
    // Two details matter here and both are load-bearing:
    //  - python3 buffers stdout when it is a pipe, so the child must flush
    //    explicitly or the "partial" line is still sitting in the buffer when
    //    SIGTERM lands and the timeout branch reports output: ''.
    //  - the timeout must exceed interpreter start-up (~150ms here) plus a
    //    flush, otherwise the kill races the first print and the assertion is
    //    testing the scheduler instead of the settled guard.
    const sandbox = new PythonSandbox(1500);
    const code =
      'def chatty():\n' +
      '    import sys\n' +
      '    print("partial")\n' +
      '    sys.stdout.flush()\n' +
      '    while True:\n' +
      '        pass';

    const result = await sandbox.execute(code, '');

    expect(result.success).toBe(false);
    expect(result.error).toBe('执行超时');
    expect(result.output).toBe('partial');
  });

  it('still short-circuits before spawning when no def is found', async () => {
    // Adjacent invariant of the same execute() flow: the '无法提取函数名' early
    // return must not be disturbed by the settled-guard logic, and must not
    // spend any wall-clock time on a child process.
    const sandbox = new PythonSandbox(5000);
    const result = await sandbox.execute('x = 1\nprint(1)', '');

    expect(result.success).toBe(false);
    expect(result.error).toBe('无法提取函数名');
    expect(result.duration).toBe(0);
    expect(result.output).toBe('');
  });
});
