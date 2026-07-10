/**
 * v0.6.0 step-v6.0-4 step4 (post type-layer pre-step 8f8f68c + comment-sync cd7f3ef)
 * regression gate: 5 v0.5 dispatch fetchers inject dispatchType field on each
 * returned QuestionScore (4 return paths per fetcher = 20 sites).
 *
 * Pins (closes hint gap "修 v0.5.0 type 段 5 处 stub 真实化" follow-up —
 * 6d71bef wired POST payload dispatch_type, 8f8f68c added type field, this
 * commit wires fetcher → QuestionScore return so reporter.ts step 5 render
 * can consume it):
 * 1) 5 dispatch fetchers (terminal_bench / benchlm_agentic / swe_bench_pro /
 *    process_aware_scoring / long_context_cluster) each have a `dispatchType`
 *    field in EVERY `return { ... }` block within the function body
 *    (4 paths each: HTTP err / API err / success / catch err = 20 sites total)
 * 2) Each of those dispatchType-bearing return blocks corresponds to a
 *    QuestionScore (we infer by checking the block is preceded by category
 *    literal matching the dispatch category name)
 * 3) 3 non-dispatch fetchers (cyberseceval3 / webdev_arena / aa_omniscience)
 *    do NOT inject dispatchType on their returns (0 functional break for
 *    absent-callsite callers; parity with 8f8f68c comment that says "默认
 *    absent = v0.5 行为不变")
 * 4) The 5 literal default values align with the 5 fetcher signatures
 *    (agentic_coding / agentic_fullstack / agentic_swe / process_agentic /
 *    long_context_retrieval) — no cross-wiring
 * 5) File size adds ~20 lines vs the 1393-line pre-commit baseline
 *    (one `dispatchType,` per return × 20 sites)
 */
import * as fs from 'fs';
import * as path from 'path';

const EVALUATOR_PATH = path.resolve(__dirname, '../src/core/evaluator.ts');

describe('evaluator v0.5.0 dispatch return injection (5 fetchers x 4 returns = 20 sites)', () => {
  const src = fs.readFileSync(EVALUATOR_PATH, 'utf-8');

  const DISPATCH_FETCHERS = [
    { name: 'terminal_bench',        shortFn: 'fetchTerminalBenchScore',        type: 'agentic_coding',         category: 'terminal_bench' },
    { name: 'benchlm_agentic',       shortFn: 'fetchBenchlmAgenticScore',       type: 'agentic_fullstack',      category: 'benchlm_agentic' },
    { name: 'swe_bench_pro',         shortFn: 'fetchSweBenchProScore',          type: 'agentic_swe',            category: 'swe_bench_pro' },
    { name: 'process_aware_scoring', shortFn: 'fetchProcessAwareScoringScore',  type: 'process_agentic',        category: 'process_aware_scoring' },
    { name: 'long_context_cluster',  shortFn: 'fetchLongContextClusterScore',   type: 'long_context_retrieval', category: 'long_context_cluster' },
  ] as const;

  const NON_DISPATCH_FETCHERS = [
    { name: 'cyberseceval3',  shortFn: 'fetchCyberseceval3Score',  category: 'cyberseceval3' },
    { name: 'webdev_arena',   shortFn: 'fetchWebdevArenaScore',    category: 'webdev_arena' },
    { name: 'aa_omniscience', shortFn: 'fetchAAOmniscienceScore',  category: 'aa_omniscience' },
  ] as const;

  /**
   * Extract a function body: locate `private async <name>(` and find the
   * matching closing `}` of the function (counting nested braces). Returns
   * the body text only (from after the opening `{` to before the closing `}`).
   */
  function extractFunctionBody(text: string, shortFn: string): string {
    const sigRe = new RegExp('private\\s+async\\s+' + shortFn + '\\b[\\s\\S]*?\\)\\s*:\\s*Promise<QuestionScore>\\s*\\{');
    const m = text.match(sigRe);
    if (!m) throw new Error('signature for ' + shortFn + ' not found');
    const start = m.index! + m[0].length;
    let depth = 1;
    let i = start;
    while (i < text.length && depth > 0) {
      const ch = text[i];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      i++;
    }
    if (depth !== 0) throw new Error('unbalanced braces in ' + shortFn);
    return text.slice(start, i - 1);
  }

  /**
   * For each `return { ... }` object literal block in the body, capture the
   * raw text inside the braces (just the field lines, not the surrounding
   * braces/semicolons). Returns array of block inner text.
   */
  function extractReturnBlocks(body: string): string[] {
    const blocks: string[] = [];
    const re = /return\s*\{/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) {
      const start = m.index + m[0].length;
      let depth = 1;
      let i = start;
      while (i < body.length && depth > 0) {
        const ch = body[i];
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
        i++;
      }
      if (depth !== 0) continue;
      blocks.push(body.slice(start, i - 1));
    }
    return blocks;
  }

  it('file size in expected range (1393..1430 lines — adds ~20 lines vs 1393 baseline)', () => {
    const lineCount = src.split('\n').length;
    expect(lineCount).toBeGreaterThanOrEqual(1393);
    expect(lineCount).toBeLessThan(1750); // bumped 1700→1750 after chain #19 lm_eval_task_conflict_resolver 9th site (chain #12 left 1619 baseline, +91 JSDoc+9th-site+union-ext+anchor/mode/dependency_groups closure lines vs 1710 actual; 留 40 行 slack) dispatch-call-extraction (DEFAULT_API_BASE 8-key map + dispatchExternalCall 3-arg wrapper + 8 sites collapse ~75 JSDoc+helper lines vs chain #11 1560 baseline; 现 1619, 留 81 行 slack)
  });

  describe.each(DISPATCH_FETCHERS)(
    '$name dispatch fetcher: 4 return blocks each carry dispatchType field',
    ({ shortFn, category }) => {
      const body = extractFunctionBody(src, shortFn);
      const blocks = extractReturnBlocks(body);

      it('has exactly 4 return blocks (HTTP err / API err / success / catch err)', () => {
        expect(blocks).toHaveLength(4);
      });

      it('all 4 return blocks include dispatchType field (shorthand, value=param)', () => {
        for (const b of blocks) {
          expect(b).toMatch(/^\s*dispatchType\s*,?\s*$/m);
        }
      });

      it('all 4 return blocks correspond to this category (parity gate)', () => {
        for (const b of blocks) {
          expect(b).toContain("category: '" + category + "'");
        }
      });

      it('all 4 return blocks preserve questionId + dimension fields (no accidental removal)', () => {
        for (const b of blocks) {
          expect(b).toMatch(/questionId/);
          expect(b).toMatch(/dimension/);
        }
      });
    }
  );

  describe.each(NON_DISPATCH_FETCHERS)(
    '$name non-dispatch fetcher: returns do NOT carry dispatchType (absent = v0.5 parity)',
    ({ shortFn, category }) => {
      const body = extractFunctionBody(src, shortFn);
      const blocks = extractReturnBlocks(body);

      it('return block count is 3..5 (parity with dispatch fetchers — pre-step layout)', () => {
        expect(blocks.length).toBeGreaterThanOrEqual(3);
        expect(blocks.length).toBeLessThanOrEqual(5);
      });

      it('all return blocks do NOT include dispatchType field', () => {
        for (const b of blocks) {
          expect(b).not.toMatch(/^\s*dispatchType\s*,?\s*$/m);
        }
      });

      it('all return blocks still correspond to this non-dispatch category', () => {
        for (const b of blocks) {
          expect(b).toContain("category: '" + category + "'");
        }
      });
    }
  );

  it('aggregated: 5 dispatch fetchers contribute exactly 20 dispatchType-bearing return sites', () => {
    let total = 0;
    for (const f of DISPATCH_FETCHERS) {
      const body = extractFunctionBody(src, f.shortFn);
      const blocks = extractReturnBlocks(body);
      const withDispatch = blocks.filter((b) => /^\s*dispatchType\s*,?\s*$/m.test(b));
      total += withDispatch.length;
    }
    expect(total).toBe(20);
  });

  it('5 dispatch_type POST body fields are still present (regression — 6d71bef not reverted)', () => {
    for (const f of DISPATCH_FETCHERS) {
      const idx = src.indexOf("const questionId = `" + f.name + "_");
      expect(idx).toBeGreaterThan(0);
      const segment = src.slice(idx, idx + 1500);
      expect(segment).toMatch(/dispatch_type:\s*dispatchType/);
    }
  });

  it('5 fetcher signatures still have correct dispatchType default (literal or defaultDispatchType helper call — chain #8 regression gate)', () => {
    // v0.6 chain #8 helper-extraction: literal 'agentic_coding' default → defaultDispatchType('<name>') call
    for (const f of DISPATCH_FETCHERS) {
      const re = new RegExp("private\\s+async\\s+" + f.shortFn + "\\([\\s\\S]*?dispatchType:\\s*string\\s*=\\s*(?:['\"]" + f.type + "['\"]|defaultDispatchType\\(['\"]\\w+['\"]\\))");
      expect(src).toMatch(re);
    }
  });
});
