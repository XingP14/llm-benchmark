// tests/scorer-console-error-parity.test.ts
//
// Round 2026-06-30 22:23 cron: migrate the lone `console.error(..., error)`
// site in src/core/scorer.ts (the dialogue catch block at the original L52)
// to use `errorMessage(error)` for parity with the 6 other error-rendering
// sites in the same file (L59 / L186 / L243 / L304 / L470 / L542), which
// already route their `error: unknown` values through `errorMessage()`.
//
// Why this matters:
//   - The other 6 sites render `errorMessage(error)` (a string) into
//     `result.detail`.
//   - The L52 site logs the raw `error` object (which under Node prints as
//     `Error: <message>` for Error subclasses but as `[object Object]` /
//     the toString() of the throw value for non-Error throws). This is
//     inconsistent: when a string is thrown, the dialogue catch logs the
//     bare string with no prefix and the result detail renders
//     `评分错误: <bare string>`, which matches; but when an object is
//     thrown, the console.error prints `[object Object]` while the detail
//     renders `评分错误: [object Object]` too — so the inconsistency is
//     silent until a non-string-non-Error throw happens.
//   - Routing through `errorMessage()` brings the console.error into the
//     same canonical shape as the detail string and the sibling 6 sites.
//
// This file pins:
//   1. Source-level gate: 0 `console.error(..., error)` sites remain in
//      src/core/scorer.ts outside comments (the fix migrates the 1 site
//      to `console.error(..., errorMessage(error))`).
//   2. The L52 site explicitly calls `errorMessage(error)` (matches the
//      `L59` detail rendering byte-for-byte for the same throw value).
//   3. Sibling parity: 6 other `errorMessage(...)` renderings in scorer.ts
//      are unchanged (gate on count).

import * as fs from 'fs';
import * as path from 'path';

describe('scorer.ts console.error → errorMessage parity', () => {
  const scorerPath = path.resolve(__dirname, '..', 'src', 'core', 'scorer.ts');
  const src = fs.readFileSync(scorerPath, 'utf-8');
  // Strip /* */ block comments and // line comments so gate scans do not
  // trip on doc-comments that mention the migrated pattern.
  const stripped = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('has 0 inline `console.error(..., error)` sites in scorer.ts (L52 fix)', () => {
    // The exact migrated pattern: `console.error(..., error);` with `error`
    // as the trailing argument (no helper wrapper).
    // We allow up to 0 such occurrences after the migration.
    const matches = stripped.match(/console\.error\s*\([^)]*?,\s*error\s*\)\s*;?/g) ?? [];
    expect(matches).toEqual([]);
  });

  it('L52 site routes through errorMessage(error) for parity with L59', () => {
    // The migrated line should be:
    //   console.error(`评分失败 [${question.id}]:`, errorMessage(error));
    // Find the catch block of scoreDialogue and assert the console.error
    // line uses errorMessage(error).
    const idx = stripped.indexOf('console.error(`评分失败');
    expect(idx).toBeGreaterThan(-1);
    // Look at the next ~220 chars for the call.
    const slice = stripped.slice(idx, idx + 120);
    expect(slice).toMatch(/console\.error\s*\(\s*`评分失败\s*\[\$\{question\.id\}\]:`\s*,\s*errorMessage\s*\(\s*error\s*\)\s*\)/);
  });

  it('L59 sibling detail site still uses errorMessage(error) (unchanged)', () => {
    // After migration, the immediate-next-line detail rendering should
    // remain `评分错误: ${errorMessage(error)}`.
    const idx = stripped.indexOf('评分错误: ${errorMessage(error)}');
    expect(idx).toBeGreaterThan(-1);
  });

  it('preserves 7+ errorMessage(...) call sites in scorer.ts (L52 + 6 siblings)', () => {
    // Count total `errorMessage(...)` invocations in non-comment code.
    // After migration, we expect 7: the new L52 site + the 6 sibling sites.
    const matches = stripped.match(/errorMessage\s*\(/g) ?? [];
    // Some matches may be in JSDoc that escaped stripping; we only require >= 7.
    expect(matches.length).toBeGreaterThanOrEqual(7);
  });

  it('preserves the dialogue catch block shape (catch (error: unknown))', () => {
    // Ensure we did not accidentally remove the catch block while editing.
    expect(stripped).toMatch(/catch\s*\(\s*error:\s*unknown\s*\)\s*\{/);
    // And the return-with-zero-score behavior is preserved.
    expect(stripped).toMatch(/score:\s*0,\s*\n\s*dimension:\s*'dialogue'/);
  });
});