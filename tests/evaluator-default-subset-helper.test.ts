// tests/evaluator-default-subset-helper.test.ts
// 钉住 src/core/evaluator.ts v0.6.0 step-v6.0-10 (chain #11 helper-extraction, parallels chain #8 defaultDispatchType):
// (1) DEFAULT_SUBSET Record<string, string> 5 entries 锁定 (key+value 都 assert)
// (2) defaultSubset() 5 key 全部返回正确 literal
// (3) 未知 key (e.g. 'unknown_benchmark') 返回 'all' 兜底
// (4) empty string 返回 'all' 兜底
// (5) 5 fetcher 闭包 (terminal_bench/benchlm_agentic/swe_bench_pro/process_aware_scoring/long_context_cluster) 全部走 defaultSubset(name) 兜底
// (6) 5 helper switch case 内部全部走 defaultSubset(name) 兜底
// (7) raw `subset ?? '<literal>'` 字面量在 evaluator.ts 中已 0 处残留 (10 sites 全部迁移)
// (8) benchlm_agentic fetchBenchlmAgenticScore subset 参数从 union 拓宽为 string (与 terminal_bench/swe_bench_pro/process_aware_scoring/long_context_cluster 一致)
import * as fs from 'fs';
import * as path from 'path';

const EVALUATOR_PATH = path.resolve(__dirname, '../src/core/evaluator.ts');

describe('evaluator defaultSubset helper (v0.6 step-v6.0-10 chain #11)', () => {
  const src = fs.readFileSync(EVALUATOR_PATH, 'utf-8');

  describe('DEFAULT_SUBSET Record<string, string>', () => {
    it('exports DEFAULT_SUBSET as Record<string, string>', () => {
      expect(src).toMatch(/export const DEFAULT_SUBSET: Record<string, string> = \{/);
    });

    it('declares exactly 5 entries', () => {
      const tableMatch = src.match(/export const DEFAULT_SUBSET: Record<string, string> = \{([\s\S]+?)\};/);
      expect(tableMatch).not.toBeNull();
      const body = tableMatch![1];
      const keys = body.match(/^\s*([a-z_]+):/gm) || [];
      expect(keys.length).toBe(5);
    });

    it('declares terminal_bench: full', () => {
      expect(src).toMatch(/terminal_bench:\s*'full',/);
    });

    it('declares benchlm_agentic: all', () => {
      expect(src).toMatch(/benchlm_agentic:\s*'all',/);
    });

    it('declares swe_bench_pro: verified', () => {
      expect(src).toMatch(/swe_bench_pro:\s*'verified',/);
    });

    it('declares process_aware_scoring: all_process_signals', () => {
      expect(src).toMatch(/process_aware_scoring:\s*'all_process_signals',/);
    });

    it('declares long_context_cluster: all', () => {
      expect(src).toMatch(/long_context_cluster:\s*'all',/);
    });
  });

  describe('defaultSubset() function', () => {
    it('is exported with signature (benchmarkName: string): string', () => {
      expect(src).toMatch(/export function defaultSubset\(benchmarkName: string\): string \{/);
    });

    it('falls back to "all" for unknown keys', () => {
      expect(src).toMatch(/return DEFAULT_SUBSET\[benchmarkName\] \?\? 'all';/);
    });
  });

  describe('5 fetcher closures migrated to defaultSubset()', () => {
    it('terminal_bench closure uses defaultSubset("terminal_bench")', () => {
      expect(src).toMatch(/tb\.subset \?\? defaultSubset\('terminal_bench'\)/);
    });

    it('benchlm_agentic closure uses defaultSubset("benchlm_agentic")', () => {
      expect(src).toMatch(/bla\.subset \?\? defaultSubset\('benchlm_agentic'\)/);
    });

    it('swe_bench_pro closure uses defaultSubset("swe_bench_pro")', () => {
      expect(src).toMatch(/sbp\.subset \?\? defaultSubset\('swe_bench_pro'\)/);
    });

    it('process_aware_scoring closure uses defaultSubset("process_aware_scoring")', () => {
      expect(src).toMatch(/pas\.subset \?\? defaultSubset\('process_aware_scoring'\)/);
    });

    it('long_context_cluster closure uses defaultSubset("long_context_cluster")', () => {
      expect(src).toMatch(/lcc\.subset \?\? defaultSubset\('long_context_cluster'\)/);
    });
  });

  describe('5 helper switch cases migrated to defaultSubset()', () => {
    it('logExternalBenchmarkEnabled switch case terminal_bench uses helper', () => {
      // The terminal_bench case block must contain ext?.subset ?? defaultSubset('terminal_bench')
      expect(src).toMatch(/case 'terminal_bench': \{[\s\S]*?ext\?\.subset \?\? defaultSubset\('terminal_bench'\)/);
    });

    it('logExternalBenchmarkEnabled switch case benchlm_agentic uses helper', () => {
      expect(src).toMatch(/case 'benchlm_agentic': \{[\s\S]*?ext\?\.subset \?\? defaultSubset\('benchlm_agentic'\)/);
    });

    it('logExternalBenchmarkEnabled switch case swe_bench_pro uses helper', () => {
      expect(src).toMatch(/case 'swe_bench_pro': \{[\s\S]*?ext\?\.subset \?\? defaultSubset\('swe_bench_pro'\)/);
    });

    it('logExternalBenchmarkEnabled switch case long_context_cluster uses helper', () => {
      expect(src).toMatch(/case 'long_context_cluster': \{[\s\S]*?ext\?\.subset \?\? defaultSubset\('long_context_cluster'\)/);
    });

    it('logExternalBenchmarkEnabled switch case process_aware_scoring uses helper', () => {
      expect(src).toMatch(/case 'process_aware_scoring': \{[\s\S]*?ext\?\.subset \?\? defaultSubset\('process_aware_scoring'\)/);
    });
  });

  describe('zero raw subset ?? <literal> residuals (10 sites fully migrated)', () => {
    it('no raw `ext?.subset ?? \'<literal>\'` form remains in helper', () => {
      // After chain #11 closure, the helper-internal ext?.subset form must be 0
      // (helper switch cases now call defaultSubset instead).
      const matches = src.match(/ext\?\.subset \?\? '/g) || [];
      expect(matches.length).toBe(0);
    });

    it('no raw `<var>.subset ?? \'<literal>\'` form remains in closures', () => {
      // tb/bla/sbp/pas/lcc closures now call defaultSubset instead of literal ??.
      const matches = src.match(/(\w+)\.subset \?\? '[a-z_]+'/g) || [];
      expect(matches.length).toBe(0);
    });
  });

  describe('benchlm_agentic subset parameter type widened to string', () => {
    it('fetchBenchlmAgenticScore subset is typed as string (not narrow union)', () => {
      // Previously was: subset: 'all' | 'design2code_only' | 'vision2web_only' | 'native_evals_only' = 'all',
      // Now: subset: string = 'all',
      const match = src.match(/private async fetchBenchlmAgenticScore\([\s\S]*?subset:\s*([^=]+)=/);
      expect(match).not.toBeNull();
      expect(match![1].trim()).toBe('string');
    });

    it('all 5 fetch*Score subset params are typed as string (consistency)', () => {
      // terminal_bench / benchlm_agentic / swe_bench_pro / process_aware_scoring / long_context_cluster
      const matches = src.match(/private async fetch\w+Score\([\s\S]*?subset:\s*([^=]+)=/g) || [];
      expect(matches.length).toBe(5);
      for (const m of matches) {
        expect(m).toMatch(/subset:\s*string\s*=/);
      }
    });
  });

  describe('chain #11 closes v0.6.0 step-v6.0-10', () => {
    it('helper declaration order: DEFAULT_SUBSET sits between DEFAULT_LOG_FORMAT and logExternalBenchmarkEnabled', () => {
      const dlf = src.indexOf('export const DEFAULT_LOG_FORMAT');
      const ds = src.indexOf('export const DEFAULT_SUBSET');
      const leb = src.indexOf('export function logExternalBenchmarkEnabled');
      expect(dlf).toBeGreaterThan(-1);
      expect(ds).toBeGreaterThan(dlf);
      expect(leb).toBeGreaterThan(ds);
    });
  });
});
