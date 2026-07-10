// tests/evaluator-dispatch-external-call-helper.test.ts
// 钉住 src/core/evaluator.ts v0.6.0 step-v6.0-11 (chain #12 dispatch-call-extraction):
// (1) DEFAULT_API_BASE 导出 const 位于 DEFAULT_SUBSET 之后, 8-key map 含 8 个 entry
//    (webdev_arena + cyberseceval3 + aa_omniscience + terminal_bench + benchlm_agentic +
//     swe_bench_pro + process_aware_scoring + long_context_cluster)
// (2) DEFAULT_API_BASE[webdev_arena] = 'https://webdevarena.com/api/v1/eval' (公网 endpoint 唯一)
// (3) DEFAULT_API_BASE 其余 7 项均 'https://llm-benchmark.local/api/v1/<name>/vX' (本地 stub 模式)
// (4) dispatchExternalCall private method 声明为 3-arg 形式 (results, benchmarkName, fetcher)
// (5) dispatchExternalCall 内部从 DEFAULT_API_BASE[benchmarkName] ?? '(unset)' 查 defaultApiBase
// (6) dispatchExternalCall 内部从 _external_benchmarks_roadmap?.[benchmarkName] 查 cfg
// (7) dispatchExternalCall 透传给 dispatchV050External (无新逻辑, 纯 wrapper)
// (8) 8 sites 全部走 dispatchExternalCall(results, '<name>', fetcher), zero `await this.dispatchExternalBenchmark(`
// (9) 8 sites 全部无 'https://...' url 字面量 (URL 已集中到 DEFAULT_API_BASE, call site 只传 name + fetcher)
// (10) dispatchExternalBenchmark 4-arg helper 仍存在 (back-compat alias, 链上 chain #10 historical pin)
// (11) dispatchExternalCall 8-key union literal 同 chain #10 (TypeScript narrow)
// (12) chain #12 立项 JSDoc 包含 step-v6.0-11 + chain #12 + dispatch-call-extraction
// (13) helper body 中 defaultApiBase 兜底字符串 '(unset)' (与 logExternalBenchmarkEnabled 同)
// (14) dispatchV050External body UNCHANGED (helper 仅是 wrapper, 不修改 dispatch 逻辑)
import * as fs from 'fs';
import * as path from 'path';

const EVALUATOR_PATH = path.resolve(__dirname, '../src/core/evaluator.ts');

describe('evaluator dispatchExternalCall helper (v0.6 step-v6.0-11 chain #12)', () => {
  const src = fs.readFileSync(EVALUATOR_PATH, 'utf-8');

  describe('DEFAULT_API_BASE constant declaration', () => {
    it('declares DEFAULT_API_BASE as exported const Record<string, string>', () => {
      expect(src).toMatch(/export const DEFAULT_API_BASE: Record<string, string> = \{/);
    });

    it('DEFAULT_API_BASE sits AFTER defaultSubset() function declaration', () => {
      const defaultSubsetIdx = src.indexOf('export function defaultSubset(');
      const defaultApiBaseIdx = src.indexOf('export const DEFAULT_API_BASE:');
      expect(defaultSubsetIdx).toBeGreaterThan(-1);
      expect(defaultApiBaseIdx).toBeGreaterThan(-1);
      expect(defaultApiBaseIdx).toBeGreaterThan(defaultSubsetIdx);
    });

    it('DEFAULT_API_BASE has v0.6.0 step-v6.0-11 chain #12 JSDoc attribution', () => {
      const idx = src.indexOf('export const DEFAULT_API_BASE:');
      const j = src.slice(Math.max(0, idx - 2000), idx);
      expect(j).toMatch(/v0\.6\.0 step-v6\.0-11/);
      expect(j).toMatch(/chain #12/);
      expect(j).toMatch(/dispatch-call-extraction/);
    });

    it('DEFAULT_API_BASE has all 8 expected keys', () => {
      for (const name of ['webdev_arena', 'cyberseceval3', 'aa_omniscience', 'terminal_bench', 'benchlm_agentic', 'swe_bench_pro', 'process_aware_scoring', 'long_context_cluster']) {
        const re = new RegExp(`^  ${name}: 'https://`, 'm');
        expect(src).toMatch(re);
      }
    });

    it('DEFAULT_API_BASE[webdev_arena] = webdevarena.com public endpoint (only public URL)', () => {
      expect(src).toMatch(/^  webdev_arena: 'https:\/\/webdevarena\.com\/api\/v1\/eval',$/m);
    });

    it('DEFAULT_API_BASE[cyberseceval3] = local stub (matches v0.5.0 inline url)', () => {
      expect(src).toMatch(/^  cyberseceval3: 'https:\/\/llm-benchmark\.local\/api\/v1\/cyberseceval3\/v3',$/m);
    });

    it('DEFAULT_API_BASE[terminal_bench] = local stub v2 (matches v0.5.0 inline url)', () => {
      expect(src).toMatch(/^  terminal_bench: 'https:\/\/llm-benchmark\.local\/api\/v1\/terminal_bench\/v2',$/m);
    });

    it('DEFAULT_API_BASE[long_context_cluster] = local stub (matches v0.5.0 inline url)', () => {
      expect(src).toMatch(/^  long_context_cluster: 'https:\/\/llm-benchmark\.local\/api\/v1\/long_context_cluster\/v1',$/m);
    });
  });

  describe('dispatchExternalCall private method declaration', () => {
    it('declares dispatchExternalCall as private async method', () => {
      expect(src).toMatch(/private async dispatchExternalCall\(/);
    });

    it('helper sits AFTER dispatchExternalBenchmark (chain #12 layered on chain #10)', () => {
      const extBenchIdx = src.indexOf('private async dispatchExternalBenchmark');
      const extCallIdx = src.indexOf('private async dispatchExternalCall');
      const v050Idx = src.indexOf('private async dispatchV050External');
      expect(extBenchIdx).toBeGreaterThan(-1);
      expect(extCallIdx).toBeGreaterThan(-1);
      expect(v050Idx).toBeGreaterThan(-1);
      expect(extCallIdx).toBeGreaterThan(extBenchIdx);
    });

    it('helper accepts 3 params: results, benchmarkName, fetcher (NO defaultApiBase param)', () => {
      // dispatchExternalCall takes (results, name, fetcher) — url pulled from DEFAULT_API_BASE inside
      expect(src).toMatch(/private async dispatchExternalCall\(\s*results: EvaluationResult\[\],\s*\n\s*benchmarkName:/);
      // The signature should NOT have defaultApiBase: string param (since url is in DEFAULT_API_BASE)
      const sig = src.match(/private async dispatchExternalCall\([\s\S]{0,400}?\): Promise<void>/);
      expect(sig).not.toBeNull();
      expect(sig![0]).not.toMatch(/defaultApiBase: string/);
    });

    it('helper body reads cfg from _external_benchmarks_roadmap?.[benchmarkName]', () => {
      // Look inside dispatchExternalCall body (between its declaration and dispatchV050External)
      const startIdx = src.indexOf('private async dispatchExternalCall(');
      const endIdx = src.indexOf('private async dispatchV050External(');
      const body = src.slice(startIdx, endIdx);
      expect(body).toMatch(/const ext = this\.config\._external_benchmarks_roadmap as Record<string,/);
      expect(body).toContain('const cfg = ext?.[benchmarkName];')
    });

    it('helper body reads defaultApiBase from DEFAULT_API_BASE[benchmarkName] ?? \'(unset)\'', () => {
      const startIdx = src.indexOf('private async dispatchExternalCall(');
      const endIdx = src.indexOf('private async dispatchV050External(');
      const body = src.slice(startIdx, endIdx);
      expect(body).toMatch(/const defaultApiBase = DEFAULT_API_BASE\[benchmarkName\] \?\? '\(unset\)';/);
    });

    it('helper body delegates to dispatchV050External with (results, benchmarkName, cfg, defaultApiBase, fetcher)', () => {
      const startIdx = src.indexOf('private async dispatchExternalCall(');
      const endIdx = src.indexOf('private async dispatchV050External(');
      const body = src.slice(startIdx, endIdx);
      expect(body).toMatch(/return this\.dispatchV050External\(results, benchmarkName, cfg, defaultApiBase, fetcher\);/);
    });

    it('helper has v0.6.0 step-v6.0-11 chain #12 JSDoc attribution', () => {
      const idx = src.indexOf('private async dispatchExternalCall');
      const j = src.slice(Math.max(0, idx - 3000), idx);
      expect(j).toMatch(/v0\.6\.0 step-v6\.0-11/);
      expect(j).toMatch(/chain #12/);
      expect(j).toMatch(/dispatch-call-extraction/);
    });

    it('helper benchmarkName typed as 8-key literal union (TypeScript narrow on cfg lookup)', () => {
      expect(src).toMatch(/benchmarkName: 'webdev_arena' \| 'cyberseceval3' \| 'aa_omniscience' \| 'terminal_bench' \| 'benchlm_agentic' \| 'swe_bench_pro' \| 'process_aware_scoring' \| 'long_context_cluster'/);
    });
  });

  // see 9 dispatch sites below — chain #19 lm_eval_task_conflict_resolver 9th-site closure
  describe('9 dispatch sites migrated to 3-arg dispatchExternalCall', () => {
    const NAMES = ['webdev_arena', 'cyberseceval3', 'aa_omniscience', 'terminal_bench', 'benchlm_agentic', 'swe_bench_pro', 'process_aware_scoring', 'long_context_cluster'];

    it.each(NAMES)('site %s uses dispatchExternalCall 3-arg (results, name, fetcher)', (name) => {
                              const callSiteRe = new RegExp(`dispatchExternalCall[\\s\\S]*?results[\\s\\S]*?'${name}',`);
      expect(src).toMatch(callSiteRe);
    });

    it('exactly 9 dispatchExternalCall call sites in run()', () => {
      const matches = src.match(/^\s*await this\.dispatchExternalCall\(/gm) || [];
      expect(matches.length).toBe(9); // bumped 8→9 after chain #19 lm_eval_task_conflict_resolver 9th dispatch site (vs chain #12 8/8 closure; 现 9/9 full parity)
    });

    it('zero remaining `await this.dispatchExternalBenchmark(` call sites (all migrated)', () => {
      const matches = src.match(/^\s*await this\.dispatchExternalBenchmark\(/gm) || [];
      expect(matches.length).toBe(0);
    });

    it('zero inline https:// URL literals in dispatch call sites (URLs centralized in DEFAULT_API_BASE)', () => {
      // Each dispatch call should NOT have a 'https://...' string between name and fetcher
      const siteBlockRe = /await this\.dispatchExternalCall\(\s*results, '[a-z_0-9]+',\s*\n\s*'https:\/\/[^']+',\s*\n\s*\(/;
      expect(src).not.toMatch(siteBlockRe);
    });

    it('zero inline cfg lookup arg in dispatch call sites (chain #12 call sites only have results+name)', () => {
      const oldRe = /await this\.dispatchExternalCall\(\s*results, '[^']+',\s*\n\s*this\.config\._external_benchmarks_roadmap\?/;
      expect(src).not.toMatch(oldRe);
    });

    it('zero old 5-arg dispatchV050External inline cfg lookup (chain #10 already removed)', () => {
      const oldRe = /await this\.dispatchV050External\(\s*results, '[a-z_0-9]+',\s*\n\s*this\.config\._external_benchmarks_roadmap\?\.([a-z_0-9]+),/;
      expect(src).not.toMatch(oldRe);
    });
  });

  describe('chain #10 back-compat helper still exists (historical pin)', () => {
    it('dispatchExternalBenchmark 4-arg helper still declared (chain #10 layer preserved)', () => {
      expect(src).toMatch(/private async dispatchExternalBenchmark\(/);
      expect(src).toMatch(/private async dispatchExternalBenchmark\(\s*results: EvaluationResult\[\],/);
    });

    it('dispatchExternalBenchmark still has step-v6.0-9 JSDoc attribution (chain #10)', () => {
      const idx = src.indexOf('private async dispatchExternalBenchmark');
      const j = src.slice(Math.max(0, idx - 3000), idx);
      expect(j).toMatch(/v0\.6\.0 step-v6\.0-9/);
      expect(j).toMatch(/chain #10/);
    });
  });

  describe('dispatchV050External body UNCHANGED (helper is wrapper, not refactor of dispatch logic)', () => {
    it('dispatchV050External signature intact', () => {
      expect(src).toMatch(/private async dispatchV050External\(\s*results: EvaluationResult\[\],/);
    });
    it('dispatchV050External enabled-guard intact', () => {
      expect(src).toMatch(/if \(!cfg\?\.enabled\) return;/);
    });
    it('dispatchV050External Promise.all results.map intact', () => {
      expect(src).toMatch(/await Promise\.all\(\s*results\.map\(async \(result\) => \{/);
    });
  });
});
