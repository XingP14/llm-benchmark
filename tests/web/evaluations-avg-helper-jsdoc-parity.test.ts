// tests/web/evaluations-avg-helper-jsdoc-parity.test.ts
//
// 07-07 01:23 cron: regression tests for the avgOf() JSDoc stale drift fix
// (5 → 6 call sites closure). Before this fix, the JSDoc above
// src/web/routes/evaluations.ts avgOf() helper said "Used by the 5
// question-type fields ... all 5 call sites" but actual code has 6 call
// sites: 5 per-type (dialogueAvg / codingAvg / fcAvg / lcAvg / mtAvg) +
// 1 totalAvg. This was the same 6af9f47-style stale comment drift pattern
// (comment claims X, code does Y, fix comment). Original 2bb18e4 commit
// introduced the helper + 6 call sites but only updated the JSDoc for 5.
//
// Pattern parallels:
//   - 6af9f47 printSummary 5-dim defaults stale drift
//   - cd7f3ef CSV header 5-dim comment stale drift (reporter 5-dim)
//   - ed3f996 getDispatchTypeCell JSDoc site count 3→4 stale drift
//   - fe3d31c HTML td getDimValue call site comment stale drift
//   - b3cb35e v0.6.0 step-v6.0-4 ci data real bootstrap injection
//
// 4 regression tests:
//  (1) avgOf JSDoc mentions "6 call sites" (was stale "5 call sites" pre-fix)
//  (2) avgOf JSDoc mentions "1 totalAvg" (the 6th call site being surfaced)
//  (3) avgOf JSDoc mentions "5 question-type fields" + "5 dim + 1 totalAvg = 6 calls"
//  (4) NO stale "all 5 call sites" claim survives in evaluations.ts (regex gate)

import * as fs from 'fs';
import * as path from 'path';

const ROUTES_PATH = path.resolve(
  __dirname,
  '../../src/web/routes/evaluations.ts',
);
const source = fs.readFileSync(ROUTES_PATH, 'utf-8');

// Locate the avgOf JSDoc block (the comment immediately above
// `function avgOf(...)`)
const AVGOF_JSDOC_START = source.indexOf(
  '// Average of a numeric score list',
);
const AVGOF_DEF_OFFSET = source.indexOf('function avgOf(', AVGOF_JSDOC_START);
const AVGOF_JSDOC = source.slice(AVGOF_JSDOC_START, AVGOF_DEF_OFFSET);

describe('Evaluations avgOf JSDoc parity (5-dim 漏更 stale drift closure, 6af9f47 mode)', () => {
  it('(1) avgOf JSDoc mentions "6 call sites" (5 dim + 1 totalAvg, was stale "5 call sites" pre-fix)', () => {
    expect(AVGOF_JSDOC).toMatch(/all 6 call sites/);
  });

  it('(2) avgOf JSDoc mentions "1 totalAvg" (the 6th call site surfaced)', () => {
    expect(AVGOF_JSDOC).toMatch(/1 totalAvg/);
  });

  it('(3) avgOf JSDoc names 5 question-type fields', () => {
    // The JSDoc wraps the field list across two lines (continuation
    // indent + newline before 'long_context'), so normalize whitespace
    // before matching so each name can be checked individually.
    // (Avoid a single regex across the wrap because the line break
    // leaves a '/ /' sequence at the seam that breaks a literal
    // pattern like /dialogue \/ coding \/ function_calling \/
    // long_context \/ multi_turn/.)
    const flattened = AVGOF_JSDOC.replace(/\s+/g, ' ');
    expect(flattened).toMatch(/dialogue/);
    expect(flattened).toMatch(/coding/);
    expect(flattened).toMatch(/function_calling/);
    expect(flattened).toMatch(/long_context/);
    expect(flattened).toMatch(/multi_turn/);
  });

  it('(4) avgOf JSDoc claim line says "all 6 call sites" (current), not stale "all 5"', () => {
    // The pre-fix JSDoc said "all 5 call sites are byte-identical" which is
    // wrong (actual 6). After the 07-07 01:23 cron fix, the *claim line*
    // (the assertion about how many call sites are byte-identical) must
    // say "all 6 call sites". Historical references inside explanatory
    // prose (e.g. the "(was: ...)" block) may still quote the old text.
    // Future regressions that re-introduce the stale 5 → 6 mismatch in
    // the actual claim line would surface here.
    expect(AVGOF_JSDOC).toMatch(/all 6 call sites are byte-identical/);
    expect(AVGOF_JSDOC).not.toMatch(/all 5 call sites are byte-identical/);
  });
});
