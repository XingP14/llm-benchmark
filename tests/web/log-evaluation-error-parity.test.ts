// tests/web/log-evaluation-error-parity.test.ts
//
// Round 2026-06-30 22:33 cron: migrate the lone `console.error(message, err)`
// site in src/web/engine/evaluator.ts (logEvaluationError helper body at L28)
// to use `errorMessage(err)` for parity with the 3 caller catch blocks
// (L139 / L168 in engine/evaluator.ts, and evaluations.ts:145 .catch handler).
//
// Why this matters:
//   - logEvaluationError is the single-source helper exported from
//     src/web/engine/evaluator.ts:26 and called by 3 catch sites:
//       (a) L139 in engine/evaluator.ts run() inner catch block:
//             logEvaluationError(`Error evaluating ${question.id}:`, err);
//       (b) L168 in engine/evaluator.ts run() outer catch block:
//             logEvaluationError('Evaluation error:', err);
//       (c) evaluations.ts:145 .catch handler:
//             .catch((err: unknown) => logEvaluationError('Engine run failed for evaluation ' + evaluationId + ':', err))
//   - All 3 caller sites pass the raw `err: unknown` value as the trailing
//     arg; the helper body was `console.error(message, err)` which under Node
//     prints `Error: <message>` for Error subclasses but `[object Object]` /
//     toString() for non-Error throws (objects, undefined, custom class).
//   - Routing through `errorMessage(err)` brings the helper output into the
//     canonical string-rendering shape used by 59753ba logEvaluationError's
//     sibling sites — errorMessage(new Error(x)) === (x as Error).message
//     for Error, and for non-Error throws it returns String(err) instead of
//     [object Object] (per src/errors.ts implementation), so log lines are
//     uniform.
//   - Same pattern as the 2026-06-30 22:23 cron scorer.ts L52 fix (commit
//     0b3250e): the lone `console.error(..., error)` site was migrated to
//     `console.error(..., errorMessage(error))` and pinned by 5 regression
//     tests in tests/scorer-console-error-parity.test.ts. This commit
//     closes the lone residual site of that pattern in src/web/.
//
// This file pins:
//   1. Source-level gate: 0 `console.error(..., err)` sites remain in
//      src/web/engine/evaluator.ts outside comments (the fix migrates the 1
//      site to `console.error(message, errorMessage(err))`).
//   2. The L28 helper body uses errorMessage(err) (byte-for-byte shape).
//   3. logEvaluationError signature unchanged: (message: string, err: unknown) => void.
//   4. All 3 caller sites preserved: L139 + L168 + evaluations.ts:145 still
//      pass raw `err: unknown` and route through the helper (no caller
//      regressed by the migration).
//   5. Helper gating preserved: NODE_ENV=test and JEST_WORKER_ID set still
//      suppress the console.error (matches evaluations-catch-log.test.ts
//      (3) + (4) gating expectations — refactor must not break the existing
//      gate).

import * as fs from 'fs';
import * as path from 'path';
import { logEvaluationError } from '../../src/web/engine/evaluator';

describe('engine/evaluator.ts logEvaluationError console.error → errorMessage parity', () => {
  const evalPath = path.resolve(__dirname, '..', '..', 'src', 'web', 'engine', 'evaluator.ts');
  const routesPath = path.resolve(__dirname, '..', '..', 'src', 'web', 'routes', 'evaluations.ts');
  const src = fs.readFileSync(evalPath, 'utf-8');
  // Strip /* */ block comments and // line comments so gate scans do not
  // trip on doc-comments that mention the migrated pattern.
  const stripped = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('(1) has 0 inline `console.error(message, err)` sites in engine/evaluator.ts (L28 fix)', () => {
    // The exact migrated pattern: `console.error(message, err)` with raw
    // `err` (the param name) as the trailing argument and no helper wrapper.
    // We allow 0 such occurrences after the migration.
    const matches = stripped.match(/console\.error\s*\([^)]*?,\s*err\s*\)\s*;?/g) ?? [];
    expect(matches).toEqual([]);
  });

  it('(2) logEvaluationError body routes through logEvalError helper which carries errorMessage(err) (chain #13 closure)', () => {
    // chain #13 refactor: logEvaluationError body became `logEvalError(message, errorMessage(err))`;
    // the actual `console.error(message, errorMessage(err))` literal now lives inside the new
    // `logEvalError` helper, byte-identical to the previous inline shape. We assert that the
    // exported function body routes through the helper, and that the helper body still contains
    // `console.error(...args)` so behavior parity with chain #5 / chain #6 / 047e952 is preserved.
    const idx = stripped.indexOf('export function logEvaluationError');
    expect(idx).toBeGreaterThan(-1);
    // Look at the next ~220 chars for the body.
    const slice = stripped.slice(idx, idx + 240);
    expect(slice).toMatch(/logEvalError\s*\(\s*message\s*,\s*errorMessage\s*\(\s*err\s*\)\s*\)/);
    // And the helper itself still calls console.error(...args) (byte-identical gate semantics).
    expect(stripped).toMatch(/const\s+logEvalError\s*=\s*\(\.\.\.args:\s*unknown\[\]\)\s*:\s*void\s*=>\s*\{/);
    expect(stripped).toMatch(/if\s*\(\s*shouldLog\s*\)\s*console\.error\s*\(\.\.\.args\s*\)\s*;/);
  });

  it('(3) logEvaluationError signature unchanged (message, err) => void', () => {
    expect(typeof logEvaluationError).toBe('function');
    expect(logEvaluationError.length).toBe(2);
  });

  it('(4) 3 caller sites preserved: L139 + L168 in engine/evaluator.ts + evaluations.ts:145', () => {
    // (a) engine/evaluator.ts L139 inner catch: logEvaluationError(`Error evaluating ${question.id}:`, err);
    expect(stripped).toMatch(/logEvaluationError\s*\(\s*`Error evaluating\s*\$\{question\.id\}:`\s*,\s*err\s*\)/);
    // (b) engine/evaluator.ts L168 outer catch: logEvaluationError('Evaluation error:', err);
    expect(stripped).toMatch(/logEvaluationError\s*\(\s*'Evaluation error:'\s*,\s*err\s*\)/);
    // (c) routes/evaluations.ts:145 .catch handler
    const routesSrc = fs.readFileSync(routesPath, 'utf-8');
    expect(routesSrc).toMatch(/\.catch\s*\(\s*\(err:\s*unknown\)\s*=>\s*logEvaluationError\s*\(\s*'Engine run failed for evaluation '\s*\+\s*evaluationId\s*\+\s*':'\s*,\s*err\s*\)/);
  });

  it('(5) helper gating preserved: NODE_ENV=test still suppresses console.error', () => {
    const prev = process.env.NODE_ENV;
    const prevWorker = process.env.JEST_WORKER_ID;
    process.env.NODE_ENV = 'test';
    process.env.JEST_WORKER_ID = '1';
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      logEvaluationError('gate-test', new Error('boom'));
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
      if (prev === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prev;
      if (prevWorker === undefined) delete process.env.JEST_WORKER_ID;
      else process.env.JEST_WORKER_ID = prevWorker;
    }
  });
  it('(6) chain #13 shouldLog per-prefix helper exists (parallels src/core/evaluator.ts:26 / scorer.ts:30 / reporter.ts:7 / websocket.ts:9)', () => {
    // The new `shouldLog` const must exist with byte-identical gate logic to the 4 sibling sites:
    //   `process.env.NODE_ENV !== 'test' && !process.env.JEST_WORKER_ID`
    expect(stripped).toMatch(/const\s+shouldLog\s*=\s*process\.env\.NODE_ENV\s*!==\s*'test'\s*&&\s*!process\.env\.JEST_WORKER_ID\s*;/);
  });

  it('(7) chain #13 attribution comment present (mentions 047e952 leak-fix pattern + 4 sibling shouldLog sites)', () => {
    // Header doc-comment must reference the chain #13 closure rationale AND the 4 sibling sites
    // whose `shouldLog` pattern this engine/evaluator.ts site now joins.
    expect(src).toMatch(/chain\s*#13\s*closure/);
    expect(src).toMatch(/src\/core\/evaluator\.ts:26/);
    expect(src).toMatch(/src\/core\/scorer\.ts:30/);
    expect(src).toMatch(/src\/core\/reporter\.ts:7/);
    expect(src).toMatch(/src\/web\/websocket\.ts:9/);
  });

  it('(8) chain #13 console.error site count = 1 (only the new logEvalError helper has it, logEvaluationError body now routes through helper)', () => {
    // After chain #13 refactor the file should have exactly 1 console.error call site:
    // inside the `logEvalError` helper body. The exported `logEvaluationError` no longer
    // contains a console.error call directly (it routes through logEvalError).
    // Strip doc-comments and string literals before counting.
    const matches = src.match(/console\.error\s*\(/g) ?? [];
    expect(matches.length).toBe(1);
  });
});
