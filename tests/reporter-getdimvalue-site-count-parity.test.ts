/**
 * reporter-getdimvalue-site-count-parity.test.ts
 *
 * Closes v0.6.0 step-v6.0-12 stale-comment drift on getDimValue / getDimCell
 * site-count + ordinals. Pre-fix state of the working tree:
 *   - src/core/reporter.ts L40 JSDoc claimed "5 处 inline `if (!dim || typeof
 *     dim.average !== 'number')`" but the actual count is **6**:
 *       1. L216 markdown overall (getDimCell)
 *       2. L244 markdown detail (getDimCell)
 *       3. L364 html td (getDimValue, was "(3rd inline site closed)" in english)
 *       4. L410 html detail-card (getDimCell, pre-fix said "第 2 处" ordinal drift)
 *       5. L491+L497 csv (getDimValue, pre-fix said "第 4 处" — duplicate ordinal
 *          with L410)
 *   - src/index.ts L278 printSummary ordinal was "第 5 处" but should be "第 6 处"
 *     (ordinal 5 was already claimed by CSV L491+L497 — duplicate ordinal drift)
 *
 * 6 sites unique ordinals (1/2/3/4/5/6) + JSDoc claim "6 处" + 6 distinct
 * getDimCell + getDimValue call sites (4 in reporter.ts + 1 in index.ts + 1
 * inside getDimCell body) + 2 helper decls = 8 regex hits in reporter.ts +
 * 1 in index.ts. Test below gates all of these.
 *
 * Drift history:
 *   - 06-29 03:23 cron: refactor extracted getDimCell + getDimValue, migrated
 *     3 sites (markdown overall / markdown detail / html td) — JSDoc L40
 *     written as "3 处 inline"
 *   - 07-01 cron (buildDimEntry wire-through step-v6.0-2): added html
 *     detail-card getDimCell call site (4th site) — JSDoc L40 not refreshed
 *     → "3 处" silently under-counts
 *   - 07-04 01:33 cron (printSummary migration): added printSummary getDimCell
 *     call site (5th site) — JSDoc L40 not refreshed → "3 处" still
 *   - CSV getDimValue site added 06-29 03:23 cron but ordinal was hardcoded as
 *     "第 4 处" in inline-comment — duplicated ordinal 4 with html detail-card
 *     which was the actual 4th site
 *   - L410 (html detail-card) ordinal drifted to "第 2 处" — actual ordinal is 4
 *   - L278 printSummary ordinal drifted to "第 5 处" — actual ordinal is 6
 *
 * Parallels: 6af9f47 (5-dim defaults stale comment), ed3f996 (getDispatchTypeCell
 * site count 3→4 refresh), cd7f3ef (CSV header stale 固定 5 列), c8bba15
 * (avgOf() JSDoc 5→6 sites).
 */

import * as fs from 'fs';
import * as path from 'path';

function readSrc(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf-8');
}

describe('reporter getDimValue site-count parity (v0.6.0 step-v6.0-12)', () => {
  let reporterSrc: string;
  let indexSrc: string;

  beforeAll(() => {
    reporterSrc = readSrc('src/core/reporter.ts');
    indexSrc = readSrc('src/index.ts');
  });

  // 1. JSDoc L40 must claim 6 处 (not stale 3 处, not stale 5 处)
  test('getDimValue JSDoc site-count: 6 处 inline (rejects stale 3 处 + 5 处)', () => {
    expect(reporterSrc).toMatch(
      /从 EvaluationResult\.dimensions 取一个维度的原始平均分[\s\S]{0,800}集中实现避免\s*6\s*处 inline\s*`if \(!dim \|\| typeof dim\.average !== 'number'\)`/
    );
    expect(reporterSrc).not.toMatch(
      /从 EvaluationResult\.dimensions 取一个维度的原始平均分[\s\S]{0,800}集中实现避免\s*3\s*处 inline\s*`if \(!dim \|\| typeof dim\.average !== 'number'\)`/
    );
    expect(reporterSrc).not.toMatch(
      /从 EvaluationResult\.dimensions 取一个维度的原始平均分[\s\S]{0,800}集中实现避免\s*5\s*处 inline\s*`if \(!dim \|\| typeof dim\.average !== 'number'\)`/
    );
  });

  // 2. L410 (html detail-card) ordinal must be 4 (not stale 2)
  test('html detail-card ordinal: 闭合第 4 处 inline (rejects stale 第 2 处)', () => {
    expect(reporterSrc).toMatch(
      /detail-card 5-dim 走 getDimCell,\s*闭合第\s*4\s*处 inline/
    );
    expect(reporterSrc).not.toMatch(
      /detail-card 5-dim 走 getDimCell,\s*闭合第\s*2\s*处 inline/
    );
  });

  // 3. L491+L497 (CSV) ordinal must be 5 (not stale 4)
  test('CSV getDimValue ordinal: 闭合第 5 处 inline (rejects stale 第 4 处)', () => {
    // Two CSV comment blocks (5-dim 主列 + 10 列 ci sub) both should claim 第 5 处
    const csv5Occurrences = (reporterSrc.match(
      /5-dim CSV cell 走 getDimValue \(raw number\) \?\? '-',\s*闭合第\s*5\s*处/g
    ) || []).length;
    expect(csv5Occurrences).toBe(2);
    expect(reporterSrc).not.toMatch(
      /5-dim CSV cell 走 getDimValue \(raw number\) \?\? '-',\s*闭合第\s*4\s*处/
    );
  });

  // 4. src/index.ts printSummary ordinal must be 6 (not stale 5)
  test('src/index.ts printSummary ordinal: 闭合第 6 处 inline (rejects stale 第 5 处)', () => {
    expect(indexSrc).toMatch(
      /闭合第\s*6\s*处 inline/
    );
    expect(indexSrc).not.toMatch(
      /闭合第\s*5\s*处 inline/
    );
  });

  // 5. Cross-file parity: 6 ordinals 1-6 each present exactly once (except CSV 第 5 处 has
  //    2 copies for 5-dim 主列 + ci sub-block; so 第 5 处 has 2 occurrences)
  test('ordinal 1-6 unique distribution across reporter.ts + index.ts', () => {
    const ordinals = [1, 2, 3, 4, 5, 6];
    const allSrc = reporterSrc + '\n' + indexSrc;
    ordinals.forEach((n) => {
      const re = new RegExp(`闭合第\\s*${n}\\s*处[\\s\\S]{0,30}inline`, 'g');
      const hits = (allSrc.match(re) || []).length;
      // 第 5 处 has 2 copies in CSV (主列 + ci sub), others 1 each
      const expected = n === 5 ? 2 : 1;
      expect({ ordinal: n, hits, expected }).toEqual({ ordinal: n, hits: expected, expected });
    });
  });

  // 6. Helper call sites: reporter.ts has 2 decls + 4 distinct call sites (3 getDimCell + 1
  //    getDimValue in html td + 1 getDimValue in CSV + 1 getDimValue inside getDimCell body);
  //    index.ts has 1 call site (printSummary getDimCell). regex hits: reporter.ts = 8,
  //    index.ts = 1.
  test('helper call sites: 8 regex hits in reporter.ts + 1 in index.ts', () => {
    function stripComments(src: string): string {
      let s = src.replace(/\/\*[\s\S]*?\*\//g, '');
      s = s.replace(/\/\/[^\n]*/g, '');
      return s;
    }
    const reporterCode = stripComments(reporterSrc);
    const indexCode = stripComments(indexSrc);
    const re = /\bgetDim(?:Value|Cell)\s*\(/g;
    const reporterHits = (reporterCode.match(re) || []).length;
    const indexHits = (indexCode.match(re) || []).length;
    // Expected: 8 in reporter.ts (2 decls + 1 inside getDimCell body + 3 getDimCell
    // call sites md-overall/md-detail/html-detail-card + 1 getDimValue html-td +
    // 1 getDimValue CSV); 1 in index.ts (1 getDimCell printSummary call).
    expect(reporterHits).toBe(8);
    expect(indexHits).toBe(1);
  });

  // 7. Pre-fix verification gate: stale-fallback patterns strictly rejected
  test('regression gate: stale-fallback patterns strictly rejected', () => {
    const staleJSDoc = /从 EvaluationResult\.dimensions 取一个维度的原始平均分[\s\S]{0,800}集中实现避免\s*3\s*处 inline/;
    const staleJSDoc5 = /从 EvaluationResult\.dimensions 取一个维度的原始平均分[\s\S]{0,800}集中实现避免\s*5\s*处 inline/;
    const staleL410 = /detail-card 5-dim 走 getDimCell,\s*闭合第\s*2\s*处 inline/;
    const staleL491 = /5-dim CSV cell 走 getDimValue \(raw number\) \?\? '-',\s*闭合第\s*4\s*处/;
    const staleL278 = /闭合第\s*5\s*处 inline\s*`if \(!dim \|\| typeof dim\.average !== 'number'\)`/;
    expect(staleJSDoc.test(reporterSrc)).toBe(false);
    expect(staleJSDoc5.test(reporterSrc)).toBe(false);
    expect(staleL410.test(reporterSrc)).toBe(false);
    expect(staleL491.test(reporterSrc)).toBe(false);
    expect(staleL278.test(indexSrc)).toBe(false);
  });
});
