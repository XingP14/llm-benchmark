/**
 * reporter-helper-call-subject-set.test.ts
 *
 * The finding: `reporter-getdimvalue-site-count-parity.test.ts` is a suite whose
 * entire declared subject is "a stated number that drifted from the code it
 * describes" — and it pins ONLY the stated side.
 *
 * Measured at this commit:
 *   - src/core/reporter.ts:40  claims "集中实现避免 6 处 inline
 *     `if (!dim || typeof dim.average !== 'number')`"
 *   - the actual inline-guard copies remaining in reporter.ts CODE (comments
 *     stripped) : 1
 *   - reporter.ts:69  claims 5 处 inline `dim.ci && dim.ci.n > 0`      -> 0 remain
 *   - reporter.ts:128 claims 4 处 inline `(type=${result.dispatchType})` -> 0 remain
 *
 * Those three numbers are historical: they describe the copy count BEFORE the
 * extraction refactors. The 7 green arms of the parity suite assert the comment
 * strings, so the number in the comment can be any value at all and the suite
 * still passes as long as the digits it hard-codes are present.
 *
 * The class the parity suite therefore cannot see is INVERSION of its own claim:
 * the whole point of the helper extraction was "no inline copies remain". A new
 * inline copy planted anywhere in reporter.ts is the exact regression the JSDoc
 * says cannot happen, and it is invisible to every arm of the existing suite.
 * This file binds the claim to the CODE.
 *
 * Probe discipline (R431/R437/R438): measures; does not fix. Whether the three
 * historical numbers should be restated as "0 remaining" or deleted is a
 * father-gated wording decision and is NOT changed here.
 *
 * Parallels: woclaw R436/R437/R438 (same class, other repo), cd7f3ef,
 * ed3f996, 6af9f47, c8bba15 (the same comment-count drift, previously only ever
 * fixed by hand-refreshing the number).
 */

import * as fs from 'fs';
import * as path from 'path';

const readSrc = (rel: string): string =>
  fs.readFileSync(path.join(__dirname, '..', rel), 'utf-8');

/**
 * Strip comments so a measurement can never be satisfied by prose.
 * This is the one behaviour the parity suite lacks: every one of its arms
 * matches against the raw file, so a number that appears ONLY inside a comment
 * is exactly what it reads.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

/** The helper families the reporter JSDoc claims are "the single implementation". */
const HELPER_FAMILIES = [
  'getDimValue',
  'getDimCell',
  'getDimCi',
  'getDimCiCell',
  'getDispatchTypeCell',
] as const;

/**
 * The exact inline expressions each JSDoc claims were removed from the code.
 *
 * These are PATTERNS, not literals, and the distinction is the whole point.
 * A first draft matched the literal `if (!dim || typeof dim.average !== 'number')`
 * and mutation M3 survived it by writing the same re-introduced guard over a
 * variable named `d` — the copy that regression would realistically be. A
 * duplicate-existence check must be name-agnostic: what the JSDoc forbids is a
 * SECOND existence check, not a second occurrence of one particular spelling.
 */
const INLINE_PATTERNS: readonly { name: string; re: RegExp }[] = [
  {
    name: 'dim.average existence guard',
    re: /!\s*\w+\s*\|\|\s*typeof\s+\w+\.average\s*!==\s*'number'/g,
  },
  { name: 'ci existence guard', re: /\w+\.ci\s*&&\s*\w+\.ci\.n\s*>\s*0/g },
  { name: 'dispatchType template', re: /type=\$\{\w+\.dispatchType\}/g },
] as const;

const countIn = (src: string, re: RegExp): number => (src.match(re) || []).length;


describe('reporter helper extraction: the claim is bound to the CODE, not to a comment', () => {
  let reporterSrc: string;
  let reporterCode: string;

  beforeAll(() => {
    reporterSrc = readSrc('src/core/reporter.ts');
    reporterCode = stripComments(reporterSrc);
  });

  // ── F1 ⭐ the inversion. The parity suite's 7 arms all pass while the code
  // contains a fresh inline copy — i.e. the regression its own JSDoc forbids.
  it('A1: a planted inline copy is invisible to every arm of the parity suite', () => {
    // What the parity suite actually asserts: the comment still states 6 处.
    // Measured against the real file:
    const stated = reporterSrc.match(
      /集中实现避免\s*(\d+)\s*处 inline\s*`if \(!dim \|\| typeof dim\.average !== 'number'\)`/
    );
    expect(stated).not.toBeNull();
    expect(stated![1]).toBe('6');

    // Now simulate the forbidden regression: one inline copy appears in CODE.
    const polluted = reporterCode + '\nif (!dim || typeof dim.average !== \'number\') return null;';
    const pollutedCopies = polluted.split("if (!dim || typeof dim.average !== 'number')").length - 1;

    // The parity suite's arm is a pure comment match — unaffected by the copy.
    expect(pollutedCopies).toBeGreaterThan(stated![1] ? 1 : 1);
    expect(stated![1]).toBe('6');

    // ⇒ the stated number and the code can disagree arbitrarily while every
    // parity arm stays green. Only a code-level count can catch this.
    const codeCopiesNow = reporterCode.split("if (!dim || typeof dim.average !== 'number')").length - 1;
    expect(codeCopiesNow).toBe(1);
  });

  // ── F2 ⭐ the actual gate. One inline copy of any claimed expression, in code.
  // This is the arm the parity suite is missing; it is what would go red when the
  // extraction regresses.
  it('A2: every claimed-removed guard has at most one remaining copy in code', () => {
    const remaining: Record<string, number> = {};
    for (const p of INLINE_PATTERNS) {
      remaining[p.name] = countIn(reporterCode, p.re);
    }

    // Measured truth at this commit — 1, 0, 0. The extraction held.
    expect(remaining['dim.average existence guard']).toBe(1);
    expect(remaining['ci existence guard']).toBe(0);
    expect(remaining['dispatchType template']).toBe(0);

    // The gate itself: >1 means a copy was re-introduced.
    for (const p of INLINE_PATTERNS) {
      expect(remaining[p.name]).toBeLessThanOrEqual(1);
    }
  });

  // ── F3 the positive direction: each helper is still DECLARED exactly once and
  // is still CALLED. A helper that lost its last call site is dead code that the
  // comment-based suite reports as fully migrated.
  it('A3: every declared helper family has exactly one declaration and is still called', () => {
    const counts: Record<string, { decls: number; calls: number }> = {};
    for (const name of HELPER_FAMILIES) {
      const decls = (reporterCode.match(new RegExp(`function\\s+${name}\\s*\\(`)) || []).length;
      const total = (reporterCode.match(new RegExp(`\\b${name}\\s*\\(`, 'g')) || []).length;
      counts[name] = { decls, calls: total - decls };
    }

    for (const name of HELPER_FAMILIES) {
      expect(counts[name].decls).toBe(1);
      // Not a hard-coded per-helper number: any call site proves liveness, and a
      // duplicate DECLARATION (the shape a copy-paste regression takes) is caught
      // by the decls===1 arm above without needing this count pinned.
      expect(counts[name].calls).toBeGreaterThan(0);
    }

    // Parity with the one number the existing suite does pin, restated against
    // CODE rather than against comments: 8 regex hits in reporter.ts.
    const hits = (reporterCode.match(/\bgetDim(?:Value|Cell)\s*\(/g) || []).length;
    expect(hits).toBe(8);
  });

  // ── F4 non-vacuity: the stripComments step is load-bearing. Without it, the
  // three expressions in INLINE_EXPRESSIONS are found ONLY in the JSDoc prose
  // that describes them — a measurement that reads its own documentation.
  it('A4: the code measurement is not satisfied by the comments that describe it', () => {
    const rawCounts: Record<string, number> = {};
    for (const p of INLINE_PATTERNS) {
      rawCounts[p.name] = countIn(reporterSrc, p.re);
    }
    const codeCounts: Record<string, number> = {};
    for (const p of INLINE_PATTERNS) {
      codeCounts[p.name] = countIn(reporterCode, p.re);
    }

    // Measured: the name-agnostic dim.average guard pattern occurs 6 times in the
    // raw file and exactly ONCE in code, at the getDimValue declaration itself.
    // The 5 extra are prose: L40 (the JSDoc that describes the guard), L230/L258/
    // L377 (three `副本` comments), and one differently-spelled variant. A raw count
    // would report 6 inline copies of a 1-copy reality, and an "at most 1" gate
    // written against the raw file could never pass.
    expect(rawCounts['dim.average existence guard']).toBe(6);
    expect(codeCounts['dim.average existence guard']).toBe(1);

    // And for the other two the raw count is non-zero ONLY because of prose:
    for (const name of ['ci existence guard', 'dispatchType template'] as const) {
      expect(rawCounts[name]).toBeGreaterThan(0);
      expect(codeCounts[name]).toBe(0);
    }
  });
});
