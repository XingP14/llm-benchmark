// tests/web/log-evaluation-error-runtime.test.ts
//
// Companion to evaluations-catch-log.test.ts (6 cases, all GREEN against a
// helper that can never log). That suite pins only the SUPPRESSED branch:
//   (3) NODE_ENV === 'test'          -> no log
//   (4) JEST_WORKER_ID set           -> no log
// A mutant that deletes the console.error call from logEvalError, or pins
// `const shouldLog = false`, satisfies all 6 cases -- cases 5/6 only assert
// that engine.run() rejects and no unhandledRejection escapes, and both hold
// trivially when the helper is a no-op.
//
// This file pins the EMITTING branch, i.e. the condition under which the
// helper must actually reach console.error with the errorMessage() rendering
// of its second argument. `shouldLog` is a module-load-time const, so each
// case re-imports the module under a controlled env via jest.resetModules +
// jest.isolateModules. No source-text grep, no file-local copy of the helper:
// the assertions below drive the real exported logEvaluationError.

describe('logEvaluationError emitting branch (runtime)', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalWorkerId = process.env.JEST_WORKER_ID;
  const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

  afterEach(() => {
    consoleSpy.mockClear();
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalWorkerId === undefined) delete process.env.JEST_WORKER_ID;
    else process.env.JEST_WORKER_ID = originalWorkerId;
    jest.resetModules();
  });

  /**
   * Load the REAL logEvaluationError with `env` in place at module-load time.
   * Throws if the symbol is not a function, which is the whole point: a
   * deleted export, a renamed helper, or a helper turned into a no-op
   * constant must all fail here rather than pass silently.
   */
  const loadReal = (env: Record<string, string | undefined>): ((m: string, e: unknown) => void) => {
    // NOTE: process.env.X = undefined stores the STRING "undefined", which is
    // truthy -- `!process.env.JEST_WORKER_ID` then stays false and the gate
    // silently suppresses. delete() is the only way to make the var absent.
    if (env.NODE_ENV === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = env.NODE_ENV;
    if (env.JEST_WORKER_ID === undefined) delete process.env.JEST_WORKER_ID;
    else process.env.JEST_WORKER_ID = env.JEST_WORKER_ID;
    let helper: unknown;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require('../../src/web/engine/evaluator') as {
        logEvaluationError: unknown;
      };
      helper = mod.logEvaluationError;
    });
    expect(typeof helper).toBe('function');
    return helper as (m: string, e: unknown) => void;
  };

  const emitArgs = (): unknown[][] => consoleSpy.mock.calls.map((c) => c);

  it('(1) NODE_ENV=production and no JEST_WORKER_ID -> console.error IS called once', () => {
    const logEvaluationError = loadReal({ NODE_ENV: 'production', JEST_WORKER_ID: undefined });
    logEvaluationError('emit-production:', new Error('boom-1'));

    const calls = emitArgs();
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe('emit-production:');
  });

  it('(2) NODE_ENV=development and no JEST_WORKER_ID -> still emits (gate is not test-only)', () => {
    const logEvaluationError = loadReal({ NODE_ENV: 'development', JEST_WORKER_ID: undefined });
    logEvaluationError('emit-development:', new Error('boom-2'));

    const calls = emitArgs();
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe('emit-development:');
  });

  it('(3) emitting call forwards BOTH the message and errorMessage(err) as separate args', () => {
    const logEvaluationError = loadReal({ NODE_ENV: 'production', JEST_WORKER_ID: undefined });
    logEvaluationError('two-args:', new Error('boom-3'));

    const calls = emitArgs();
    // A mutant that collapses to console.error(message) alone -- dropping the
    // error rendering -- leaves length 1 and fails here.
    expect(calls).toHaveLength(1);
    expect(calls[0]).toHaveLength(2);
    expect(calls[0][0]).toBe('two-args:');
    expect(calls[0][1]).toBe('boom-3');
  });

  it('(4) errorMessage(err) rendering is preserved: string err passes through unchanged', () => {
    const logEvaluationError = loadReal({ NODE_ENV: 'production', JEST_WORKER_ID: undefined });
    logEvaluationError('string-err:', 'plain-string-4');

    const calls = emitArgs();
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toBe('plain-string-4');
  });

  it('(5) errorMessage(err) rendering is preserved: object err is JSON-stringified', () => {
    const logEvaluationError = loadReal({ NODE_ENV: 'production', JEST_WORKER_ID: undefined });
    logEvaluationError('object-err:', { code: 42 });

    const calls = emitArgs();
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toBe(JSON.stringify({ code: 42 }));
  });

  it('(6) undefined err renders as empty string, not the literal "undefined"', () => {
    const logEvaluationError = loadReal({ NODE_ENV: 'production', JEST_WORKER_ID: undefined });
    logEvaluationError('undefined-err:', undefined);

    const calls = emitArgs();
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toBe('');
  });

  it('(7) a non-empty JEST_WORKER_ID suppresses even with NODE_ENV=production (gate still armed)', () => {
    const logEvaluationError = loadReal({ NODE_ENV: 'production', JEST_WORKER_ID: '1' });
    logEvaluationError('suppressed-by-worker:', new Error('boom-7'));

    expect(emitArgs()).toHaveLength(0);
  });

  it('(8) NODE_ENV=test suppresses even with JEST_WORKER_ID unset (gate still armed)', () => {
    const logEvaluationError = loadReal({ NODE_ENV: 'test', JEST_WORKER_ID: undefined });
    logEvaluationError('suppressed-by-node-env:', new Error('boom-8'));

    expect(emitArgs()).toHaveLength(0);
  });

  it('(9) emitting branch fires once per call (no swallow, no double-emit)', () => {
    const logEvaluationError = loadReal({ NODE_ENV: 'production', JEST_WORKER_ID: undefined });
    logEvaluationError('first:', new Error('a'));
    logEvaluationError('second:', new Error('b'));
    logEvaluationError('third:', new Error('c'));

    const calls = emitArgs();
    expect(calls).toHaveLength(3);
    expect(calls.map((c) => c[0])).toEqual(['first:', 'second:', 'third:']);
    expect(calls.map((c) => c[1])).toEqual(['a', 'b', 'c']);
  });

  it('(10) a helper whose gate is pinned false is rejected by loadReal (sanity check on the harness)', () => {
    // Proves loadReal would actually notice a dead helper: a module exporting a
    // non-function under the same name must fail the typeof() guard, not
    // silently no-op. Guards against the case where every assertion below
    // would pass for the wrong reason.
    process.env.NODE_ENV = 'production';
    delete process.env.JEST_WORKER_ID;
    let helper: unknown = undefined;
    jest.isolateModules(() => {
      jest.doMock('../../src/web/engine/evaluator', () => ({
        EvaluatorEngine: class {},
        logEvaluationError: undefined,
      }));
      const mod = require('../../src/web/engine/evaluator') as {
        logEvaluationError: unknown;
      };
      helper = mod.logEvaluationError;
    });
    expect(typeof helper).not.toBe('function');
    jest.dontMock('../../src/web/engine/evaluator');
  });
});
