// tests/web/evaluator-web-scorer-helper.test.ts
//
// Regression tests for the 5-dim 漏更 refactor in src/web/engine/evaluator.ts
// EvaluatorEngine: 3x byte-identical 2-line `dummyModel + new Scorer(this.createAdapter('openai'), dummyModel)`
// boilerplate in scoreFunctionCalling / scoreLongContext / scoreMultiTurn
// (5-dim function_calling / long_context / multi_turn 三处) collapsed to
// a single `const scorer = this.webScorer();` call site each, with the
// shared factory hoisted into `private webScorer(): Scorer`.
//
// Pattern parallels the 5-dim 漏更 cleanup chain (06-29 cron step-N):
//   - llm-benchmark 2bb18e4 avgOf (evaluations.ts 6x Math.round(reduce/length))
//   - llm-benchmark 59753ba logEvaluationError (evaluations.ts .catch(console.error))
//   - woclaw 851ce56 serializeDelegationResult (ws_server.ts 3x JSON.stringify)
//   - woclaw f622f24 sendJsonError (rest_server.ts 65x writeHead+end)
//   - woclaw a8a4f57 console_error_consistency (ws_server.ts)
//   - woclaw 14a12ea catch_unknown (hub)
//   - llm-benchmark 2fa60e9 getDimValue (reporter.ts)
//
// 6 regression tests:
//  (1)  webScorer() is declared as `private webScorer(): Scorer {` in
//       src/web/engine/evaluator.ts (file-level grep guard)
//  (2)  webScorer() is called >= 3 times (one per site: function_calling /
//       long_context / multi_turn)
//  (3)  0 inline `const dummyModel = { name: 'web', type: 'openai' as const, ...}`
//       sites remain outside the helper body (would catch a future regression
//       that re-inlines the 2-line block in any of the 3 score* methods)
//  (4)  helper body contains the canonical dummyModel shape:
//       `name: 'web', type: 'openai' as const, endpoint: '', apiKey: ''`
//  (5)  helper calls `new Scorer(this.createAdapter('openai'), dummyModel)`
//       (the only place the Scorer is constructed for the 3 web 5-dim
//       sub-scorers; identical contract preserved)
//  (6)  the 3 score* methods (scoreFunctionCalling / scoreLongContext /
//       scoreMultiTurn) each contain a `const scorer = this.webScorer();`
//       line directly followed by `scorer.score<Method>(question, output)`
//       and `return { score: result.score }` — i.e. behavior byte-identical
//       to the previous inline construction

import * as fs from 'fs';
import * as path from 'path';

const EVALUATOR_PATH = path.resolve(
  __dirname,
  '../../src/web/engine/evaluator.ts',
);
const source = fs.readFileSync(EVALUATOR_PATH, 'utf-8');

describe('EvaluatorEngine webScorer helper (5-dim 漏更 closure)', () => {
  it('(1) webScorer() helper is declared in evaluator.ts', () => {
    // The helper is a private method on EvaluatorEngine; matches
    // `private webScorer(): Scorer {` (with exactly one space gap).
    expect(source).toMatch(/private webScorer\(\): Scorer \{/);
  });

  it('(2) webScorer() is called >= 3 times (function_calling / long_context / multi_turn)', () => {
    const callCount = (source.match(/this\.webScorer\(\)/g) ?? []).length;
    expect(callCount).toBeGreaterThanOrEqual(3);
  });

  it('(3) 0 inline `dummyModel = { name: \'web\', type: \'openai\' as const, ... }` sites outside the helper body', () => {
    // Strip the helper body (from `private webScorer(): Scorer {` to its
    // matching closing `}`) and ensure no leftover `dummyModel` declarations
    // in the rest of the file. Helper body is allowed to keep exactly 1
    // declaration.
    const helperMatch = source.match(
      /private webScorer\(\): Scorer \{[\s\S]*?\n  \}/,
    );
    expect(helperMatch).not.toBeNull();
    const outside = source.replace(helperMatch![0], '');
    const inlineDummyModel = (
      outside.match(/const dummyModel = \{ name: 'web'/g) ?? []
    ).length;
    expect(inlineDummyModel).toBe(0);
  });

  it('(4) helper body contains canonical dummyModel shape (name/type/endpoint/apiKey)', () => {
    // dummyModel literal is one-line: `{ name: 'web', type: 'openai' as const,
    // endpoint: '', apiKey: '' }`. All 4 fields must be present in this order
    // so that any future drift (e.g. type change to 'anthropic', apiKey from ''
    // to env-backed) trips the test.
    expect(source).toMatch(
      /\{\s*name:\s*'web',\s*type:\s*'openai' as const,\s*endpoint:\s*'',\s*apiKey:\s*''\s*\}/,
    );
  });

  it('(5) helper constructs Scorer via `new Scorer(this.createAdapter(\'openai\'), dummyModel)`', () => {
    expect(source).toMatch(
      /return new Scorer\(this\.createAdapter\('openai'\), dummyModel\);/,
    );
  });

  it('(6) the 3 score* methods use `const scorer = this.webScorer();` + scorer.score<Method>(question, output)', () => {
    // Each of scoreFunctionCalling / scoreLongContext / scoreMultiTurn
    // should contain a `const scorer = this.webScorer();` line directly
    // followed (within ~5 lines) by `scorer.score<Method>(question, output)`
    // and `return { score: result.score }`.
    const methods: Array<[string, string]> = [
      ['scoreFunctionCalling', 'scorer.scoreFunctionCalling(question, output)'],
      ['scoreLongContext', 'scorer.scoreLongContext(question, output)'],
      ['scoreMultiTurn', 'scorer.scoreMultiTurn(question, output)'],
    ];
    for (const [methodName, callExpr] of methods) {
      // Find the method body start: `private async <methodName>(...)` to
      // the next blank line + `}` boundary (heuristic).
      const re = new RegExp(
        `private async ${methodName}\\([\\s\\S]*?return \\{ score: result\\.score \\};`,
      );
      const m = source.match(re);
      expect(m).not.toBeNull();
      expect(m![0]).toContain('const scorer = this.webScorer();');
      expect(m![0]).toContain(callExpr);
    }
  });
});
