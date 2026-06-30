// tests/sandbox-error-message-parity.test.ts
//
// Regression test pinning the migration of src/sandbox/python-sandbox.ts L121
// (execute() catch block) from raw `String(err)` to the typed
// `errorMessage(err)` helper (src/errors.ts), the last remaining raw
// `String(err)` site in src/ (verified via `grep -rn 'String(err)' src/`).
//
// Why this matters (parallels the 漏更 cleanup chain):
// - 59753ba logEvaluationError → errorMessage(err)
// - 6af9f47  console.error → errorMessage(err) (5-dim)
// - 2bb18e4  avgOf helper
// - 14c64d4  webScorer helper
// - 9e8f7ff  dispatchV050External helper
// - 999a62a  src/index.ts L277/L391 catch sites → errorMessage(err)
// - 0b3250e  src/core/scorer.ts L52 console.error
// - ef8ec6b  src/web/engine/evaluator.ts L28 logEvaluationError
// - 3a3179c  jest.config scorer.ts restore
// - this file: src/sandbox/python-sandbox.ts L121 — last `String(err)` site
//
// errorMessage() provides better unknown-narrowing (Error.message / string /
// JSON.stringify fallback / String fallback) than bare `String(err)`, which
// would emit `'[object Object]'` for plain objects.
//
// Strategy: jest.mock the child_process module at the file scope with a
// factory whose spawn() throws. This is more robust than jest.spyOn on
// child_process.spawn, which fails on Node 22 (the property is
// non-configurable per TypeError: Cannot redefine property: spawn).

// We need to mock child_process so python-sandbox's `import { spawn }` resolves
// to a throwing function. The factory must be supplied to jest.mock per test
// (since each test wants a different thrown value), so we re-mock via
// jest.doMock + require inside individual tests.

import { errorMessage } from '../src/errors';
import * as fs from 'fs';
import * as path from 'path';

describe('PythonSandbox errorMessage parity', () => {
  // Helper: load PythonSandbox with a child_process.spawn that throws `thrown`.
  // Uses jest.isolateModules so each test gets a fresh module cache and the
  // spawn mock is re-installed cleanly. Returns the fresh PythonSandbox class.
  const loadWithThrowingSpawn = (thrown: unknown): typeof import('../src/sandbox/python-sandbox').PythonSandbox => {
    let result: typeof import('../src/sandbox/python-sandbox').PythonSandbox | undefined;
    jest.isolateModules(() => {
      jest.doMock('child_process', () => ({
        spawn: () => {
          throw thrown;
        },
      }));
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('../src/sandbox/python-sandbox');
      result = mod.PythonSandbox;
    });
    if (!result) throw new Error('failed to load PythonSandbox');
    return result;
  };

  afterEach(() => {
    jest.resetModules();
    jest.dontMock('child_process');
  });

  it('routes spawn-thrown Error.message through errorMessage (no [object Object])', async () => {
    const PythonSandbox = loadWithThrowingSpawn(new Error('python3 not found'));
    const sandbox = new PythonSandbox();
    const result = await sandbox.execute('def f():\n    return 1', '');
    expect(result.success).toBe(false);
    expect(result.error).toBe('python3 not found');
    expect(result.error).not.toBe('[object Object]');
  });

  it('handles non-Error thrown values via errorMessage JSON fallback', async () => {
    const PythonSandbox = loadWithThrowingSpawn({ code: 'ENOENT', path: '/usr/bin/python3' });
    const sandbox = new PythonSandbox();
    const result = await sandbox.execute('def f():\n    return 1', '');
    expect(result.success).toBe(false);
    // errorMessage() JSON.stringifies plain objects; raw String() would
    // produce '[object Object]' which is the bug this migration prevents.
    expect(result.error).toBe('{"code":"ENOENT","path":"/usr/bin/python3"}');
  });

  it('handles thrown string via errorMessage string branch', async () => {
    const PythonSandbox = loadWithThrowingSpawn('spawn raw string failure');
    const sandbox = new PythonSandbox();
    const result = await sandbox.execute('def f():\n    return 1', '');
    expect(result.success).toBe(false);
    expect(result.error).toBe('spawn raw string failure');
  });

  it('returns success=false, output=\'\', duration>=0 on catch (contract preserved)', async () => {
    const PythonSandbox = loadWithThrowingSpawn(new Error('boom'));
    const sandbox = new PythonSandbox();
    const result = await sandbox.execute('def f():\n    return 1', '');
    expect(result).toEqual(expect.objectContaining({
      success: false,
      output: '',
      duration: expect.any(Number),
    }));
    expect(result.duration).toBeGreaterThanOrEqual(0);
    expect((result as { error?: string }).error).toBe('boom');
  });

  it('source file no longer contains raw String(err) in catch block', () => {
    // Locks the migration. If anyone reverts python-sandbox.ts:121 back to
    // `error: String(err),` this test fails. Greps the actual file on disk
    // to catch the regression even if the catch block is unreachable in
    // unit tests.
    const srcPath = path.join(__dirname, '..', 'src', 'sandbox', 'python-sandbox.ts');
    const src = fs.readFileSync(srcPath, 'utf8');
    expect(src).not.toMatch(/error:\s*String\(err\)/);
    expect(src).toMatch(/error:\s*errorMessage\(err\)/);
  });

  it('source file imports errorMessage from ../errors', () => {
    const srcPath = path.join(__dirname, '..', 'src', 'sandbox', 'python-sandbox.ts');
    const src = fs.readFileSync(srcPath, 'utf8');
    expect(src).toMatch(/import\s*\{[^}]*\berrorMessage\b[^}]*\}\s*from\s*['"]\.\.\/errors['"]/);
  });

  it('errorMessage() contract — Error.message / string / JSON fallback', () => {
    // Sanity check: errorMessage itself works as expected. If the helper
    // signature drifts, this pin catches it (mirrors how 999a62a locks the
    // helper contract).
    expect(errorMessage(new Error('hi'))).toBe('hi');
    expect(errorMessage('plain string')).toBe('plain string');
    expect(errorMessage({ a: 1 })).toBe('{"a":1}');
    expect(errorMessage(undefined)).toBe('');
  });
});
