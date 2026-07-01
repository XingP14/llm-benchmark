// tests/web/evaluator-scorecoding-unused-param.test.ts
//
// Regression tests for TS6133 cleanup in src/web/engine/evaluator.ts:314
// EvaluatorEngine.scoreCoding(_question: BenchmarkQuestion, output: string):
// the `question` parameter was declared but never read (scoreCoding only uses
// `output` for its output-heuristic scoring — hasDef / hasReturn / sandbox execute
// test). Originally flagged by:
//   `npx tsc --noEmit --noUnusedLocals --noUnusedParameters`
//   -> error TS6133: 'question' is declared but its value is never read.
//
// Fix:
//   1. Rename the unused `question` parameter to `_question` (TypeScript
//      convention for intentionally-unused params under noUnusedParameters).
//      Keep the param in the signature so the public surface stays symmetric
//      with sibling score* methods (scoreDialogue / scoreFunctionCalling /
//      scoreLongContext / scoreMultiTurn all take (question, output)).
//   2. Enable noUnusedParameters in tsconfig.json so CI
//      `npm run build` (which is just `tsc`) catches future TS6133
//      regressions instead of silently shipping unused-param bloat.
//
// Pattern parallels the 2fb572a "fix(types): add api_base + model_id to
// process_aware_scoring" / 0ffb136 "8/8 type field" types-cleanup chain.

import * as fs from 'fs';
import * as path from 'path';

const EVALUATOR_TS = path.join(__dirname, '..', '..', 'src', 'web', 'engine', 'evaluator.ts');
const TSCONFIG_JSON = path.join(__dirname, '..', '..', 'tsconfig.json');

describe('web/engine/evaluator.ts scoreCoding TS6133 cleanup (07-02 01:23 cron regression gate)', () => {
  let src: string;
  let tsconfig: any;

  beforeAll(() => {
    src = fs.readFileSync(EVALUATOR_TS, 'utf-8');
    tsconfig = JSON.parse(fs.readFileSync(TSCONFIG_JSON, 'utf-8'));
  });

  it('scoreCoding declaration uses _question (not bare question) to satisfy noUnusedParameters', () => {
    // The pre-fix signature was: private async scoreCoding(question: BenchmarkQuestion, output: string)
    // After the rename it must be: private async scoreCoding(_question: BenchmarkQuestion, output: string)
    expect(src).toMatch(/private async scoreCoding\(\s*_question:\s*BenchmarkQuestion\s*,\s*output:\s*string\s*\)/);
    // Negative: bare `private async scoreCoding(question:` must NOT exist anymore.
    expect(src).not.toMatch(/private async scoreCoding\(\s*question\s*:\s*BenchmarkQuestion/);
  });

  it('scoreCoding call site at the scoreQuestion dispatcher still passes (question, output)', () => {
    // Call site should be unchanged — the rename is signature-only, callers pass
    // `question` as a value (the underscore prefix only affects the param binding).
    expect(src).toMatch(/return this\.scoreCoding\(question, output\)/);
  });

  it('tsconfig.json enables noUnusedParameters (so future TS6133 unused-param surfaces in CI build)', () => {
    expect(tsconfig.compilerOptions).toBeDefined();
    expect(tsconfig.compilerOptions.noUnusedParameters).toBe(true);
  });

  it('tsconfig.json keeps strict: true (no regression on the existing strict mode)', () => {
    expect(tsconfig.compilerOptions.strict).toBe(true);
  });
});
