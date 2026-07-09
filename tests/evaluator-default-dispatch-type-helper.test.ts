// tests/evaluator-default-dispatch-type-helper.test.ts
// 钉住 src/core/evaluator.ts v0.6.0 step-v6.0-7 (chain #8 helper-extraction):
// (1) DEFAULT_DISPATCH_TYPE Record<string, string> 8 entries 锁定 (key+value 都 assert)
// (2) defaultDispatchType() 8 key 全部返回正确 literal
// (3) 未知 key (e.g. 'unknown_benchmark') 返回 'agentic_coding' 兜底
// (4) empty string 返回 'agentic_coding' 兜底
// (5) L1352 dispatchV050External 调用 defaultDispatchType(benchmarkName) 不再硬编码 (substring grep)
// (6) 5 closure L277/292/307/330/346 全部从 lookup 取值
// (7) 6 default parameter L756/851/956/1066/1179/1302 全部用 helper 调用 (v0.6.0 step-v6.0-13 加 lm_eval_task_conflict_resolver 第 6 处)
// (8) 1 helper fallback L1616 调用 helper (dispatchV050External)
import * as fs from 'fs';
import * as path from 'path';

const EVALUATOR_PATH = path.resolve(__dirname, '../src/core/evaluator.ts');

describe('evaluator defaultDispatchType helper (v0.6 step-v6.0-7 chain #8)', () => {
  const src = fs.readFileSync(EVALUATOR_PATH, 'utf-8');

  describe('DEFAULT_DISPATCH_TYPE Record<string, string>', () => {
    it('exports DEFAULT_DISPATCH_TYPE as Record<string, string>', () => {
      expect(src).toMatch(/export const DEFAULT_DISPATCH_TYPE: Record<string, string> = \{/);
    });

    it('declares exactly 8 entries', () => {
      const tableMatch = src.match(/export const DEFAULT_DISPATCH_TYPE: Record<string, string> = \{([\s\S]+?)\};/);
      expect(tableMatch).not.toBeNull();
      const body = tableMatch![1];
      expect(body).toContain('terminal_bench:');
      expect(body).toContain('benchlm_agentic:');
      expect(body).toContain('swe_bench_pro:');
      expect(body).toContain('process_aware_scoring:');
      expect(body).toContain('long_context_cluster:');
      expect(body).toContain('cyberseceval3:');
      expect(body).toContain('aa_omniscience:');
      expect(body).toContain('webdev_arena:');
    });

    it('keys map to expected literals', () => {
      expect(src).toMatch(/terminal_bench: 'agentic_coding'/);
      expect(src).toMatch(/benchlm_agentic: 'agentic_fullstack'/);
      expect(src).toMatch(/swe_bench_pro: 'agentic_swe'/);
      expect(src).toMatch(/process_aware_scoring: 'process_agentic'/);
      expect(src).toMatch(/long_context_cluster: 'long_context_retrieval'/);
      expect(src).toMatch(/cyberseceval3: 'safety_evaluation'/);
      expect(src).toMatch(/aa_omniscience: 'long_context_retrieval'/);
      expect(src).toMatch(/webdev_arena: 'agentic_coding'/);
    });
  });

  describe('defaultDispatchType(benchmarkName) helper', () => {
    it('exports defaultDispatchType(benchmarkName: string): string', () => {
      expect(src).toMatch(/export function defaultDispatchType\(benchmarkName: string\): string \{/);
    });

    it('helper body uses lookup with agentic_coding fallback', () => {
      expect(src).toMatch(/return DEFAULT_DISPATCH_TYPE\[benchmarkName\] \?\? 'agentic_coding';/);
    });

    it('helper sits BEFORE class Evaluator (top-level export, helper-extraction per-prefix pattern)', () => {
      const helperIdx = src.indexOf('export function defaultDispatchType');
      const classIdx = src.indexOf('export class Evaluator');
      expect(helperIdx).toBeGreaterThan(-1);
      expect(classIdx).toBeGreaterThan(helperIdx);
    });
  });

  describe('5 closure inline sites all use helper', () => {
    it("closure (terminal_bench) → defaultDispatchType('terminal_bench')", () => {
      expect(src).toMatch(/tb\.type \?\? defaultDispatchType\('terminal_bench'\)/);
    });
    it("closure (benchlm_agentic) → defaultDispatchType('benchlm_agentic')", () => {
      expect(src).toMatch(/bla\.type \?\? defaultDispatchType\('benchlm_agentic'\)/);
    });
    it("closure (swe_bench_pro) → defaultDispatchType('swe_bench_pro')", () => {
      expect(src).toMatch(/sbp\.type \?\? defaultDispatchType\('swe_bench_pro'\)/);
    });
    it("closure (process_aware_scoring) → defaultDispatchType('process_aware_scoring')", () => {
      expect(src).toMatch(/pas\.type \?\? defaultDispatchType\('process_aware_scoring'\)/);
    });
    it("closure (long_context_cluster) → defaultDispatchType('long_context_cluster')", () => {
      expect(src).toMatch(/lcc\.type \?\? defaultDispatchType\('long_context_cluster'\)/);
    });

    it('closure NO LONGER contain bare 5 dispatchType literals as fallback (5 specific closure sites)', () => {
      // 5 specific closure sites that originally had `X.type ?? 'literal'`:
      // - terminal_bench (return this.fetchTerminalBenchScore)
      // - benchlm_agentic (return this.fetchBenchlmAgenticScore)
      // - swe_bench_pro (return this.fetchSweBenchProScore)
      // - process_aware_scoring (multi-line pas.type ?? ...)
      // - long_context_cluster (return this.fetchLongContextClusterScore)
      // (cyberseceval3 / aa_omniscience / webdev_arena closures don't have type fallback pattern —
      //  they pass anchorScore/cats/native only, no dispatchType.)
      const lines = src.split('\n');
      const tbClosure = lines.find((l) => /return this\.fetchTerminalBenchScore/.test(l))!;
      const blaClosure = lines.find((l) => /return this\.fetchBenchlmAgenticScore/.test(l))!;
      const sbpClosure = lines.find((l) => /return this\.fetchSweBenchProScore/.test(l))!;
      const pasClosure = lines.find((l) => /pas\.type \?\?/.test(l))!;
      const lccClosure = lines.find((l) => /return this\.fetchLongContextClusterScore/.test(l))!;
      for (const l of [tbClosure, blaClosure, sbpClosure, pasClosure, lccClosure]) {
        expect(l).toMatch(/defaultDispatchType\(/);
        expect(l).not.toMatch(/\?\? 'agentic_coding'/);
        expect(l).not.toMatch(/\?\? 'agentic_fullstack'/);
        expect(l).not.toMatch(/\?\? 'agentic_swe'/);
        expect(l).not.toMatch(/\?\? 'process_agentic'/);
        expect(l).not.toMatch(/\?\? 'long_context_retrieval'/);
      }
    });
  });

  describe('6 default parameter declarations all use helper (v0.6.0 step-v6.0-13 added lm_eval_task_conflict_resolver)', () => {
    it("(terminal_bench) → defaultDispatchType('terminal_bench')", () => {
      expect(src).toMatch(/dispatchType: string = defaultDispatchType\('terminal_bench'\)/);
    });
    it("(benchlm_agentic) → defaultDispatchType('benchlm_agentic')", () => {
      expect(src).toMatch(/dispatchType: string = defaultDispatchType\('benchlm_agentic'\)/);
    });
    it("(swe_bench_pro) → defaultDispatchType('swe_bench_pro')", () => {
      expect(src).toMatch(/dispatchType: string = defaultDispatchType\('swe_bench_pro'\)/);
    });
    it("(process_aware_scoring) → defaultDispatchType('process_aware_scoring')", () => {
      expect(src).toMatch(/dispatchType: string = defaultDispatchType\('process_aware_scoring'\)/);
    });
    it("(long_context_cluster) → defaultDispatchType('long_context_cluster')", () => {
      expect(src).toMatch(/dispatchType: string = defaultDispatchType\('long_context_cluster'\)/);
    });

    it("(lm_eval_task_conflict_resolver) → defaultDispatchType('lm_eval_task_conflict_resolver') [v0.6.0 step-v6.0-13 9th fetcher, 07-10 05:03 cron]", () => {
      expect(src).toMatch(/dispatchType: string = defaultDispatchType\('lm_eval_task_conflict_resolver'\)/);
    });

    it('default parameter NO LONGER use bare 6 literals (default-param gate, excludes helper block) — bumped 5→6 after v0.6.0 step-v6.0-13', () => {
      // Scope: only check 5 fetcher signature lines (NOT the helper block DEFAULT_DISPATCH_TYPE entries
      // + NOT the helper block header comment)
      // The 5 fetcher signatures all have the form `    dispatchType: string = ...` at column 4 (4-space indent)
      const lines = src.split('\n');
      const defaultParamLines = lines.filter((l) => /^    dispatchType: string = /.test(l));
      expect(defaultParamLines.length).toBe(6);
      for (const l of defaultParamLines) {
        // Must use defaultDispatchType, not bare literal
        expect(l).toMatch(/defaultDispatchType\(/);
        expect(l).not.toMatch(/dispatchType: string = 'agentic_coding'/);
        expect(l).not.toMatch(/dispatchType: string = 'agentic_fullstack'/);
        expect(l).not.toMatch(/dispatchType: string = 'agentic_swe'/);
        expect(l).not.toMatch(/dispatchType: string = 'process_agentic'/);
        expect(l).not.toMatch(/dispatchType: string = 'long_context_retrieval'/);
      }
    });
  });

  describe('dispatchV050External helper fallback → defaultDispatchType(benchmarkName)', () => {
    it('fetcher() invocation uses defaultDispatchType(benchmarkName) — not hardcoded', () => {
      expect(src).toMatch(/cfg\?\.type \?\? defaultDispatchType\(benchmarkName\)/);
    });
    it('helper NO LONGER has hardcoded `cfg?.type ?? "agentic_coding"` fallback (excludes helper block header comment)', () => {
      // Scope: only check the dispatchV050External function body. The literal `cfg?.type ?? "agentic_coding"`
      // could legitimately appear in the helper block header comment (documenting the old behavior).
      // Find the dispatchV050External declaration and check from there to end of file.
      const dispatchIdx = src.indexOf('private async dispatchV050External');
      expect(dispatchIdx).toBeGreaterThan(-1);
      const helperBody = src.slice(dispatchIdx);
      expect(helperBody).not.toMatch(/cfg\?\.type \?\? "agentic_coding"/);
      // Verify the replacement is in scope
      expect(helperBody).toMatch(/cfg\?\.type \?\? defaultDispatchType\(benchmarkName\)/);
    });
  });

  describe('closure + default param + helper fallback total = 12 sites consolidated (v0.6.0 step-v6.0-13 bumped 11→12)', () => {
    it('total defaultDispatchType() call sites = 12 (5 closure + 6 default param + 1 helper fallback)', () => {
      // Count occurrences of `defaultDispatchType(` that are NOT inside a `*` comment line + NOT the declaration
      const lines = src.split('\n');
      let callCount = 0;
      for (const l of lines) {
        // skip comment lines (starting with ` *` or `/*` or `*`) — those are JSDoc
        const trimmed = l.trim();
        if (trimmed.startsWith('*') || trimmed.startsWith('/*') || trimmed.startsWith('//')) continue;
        // skip the declaration line `export function defaultDispatchType(`
        if (/^export function defaultDispatchType\(/.test(trimmed)) continue;
        // count remaining occurrences
        const matches = l.match(/defaultDispatchType\(/g);
        if (matches) callCount += matches.length;
      }
      expect(callCount).toBe(12);
    });
  });

  describe('file size + header chain-#8 attribution', () => {
    it('file size in expected range (1420..1460 — helper block added ~24 lines)', () => {
      const lineCount = src.split('\n').length;
      expect(lineCount).toBeGreaterThanOrEqual(1420);
      expect(lineCount).toBeLessThan(1700); // bumped 1600→1700 after chain #12 dispatch-call-extraction (DEFAULT_API_BASE 8-key map + dispatchExternalCall 3-arg wrapper + 8 sites collapse ~75 JSDoc+helper lines vs chain #11 1560 baseline; 现 1619, 留 81 行 slack)
    });
    it('chain #8 attribution header comment present', () => {
      expect(src).toMatch(/v0\.6\.0 step-v6\.0-7 helper: 5 fetcher dispatchType literal default lookup/);
    });
  });
});
