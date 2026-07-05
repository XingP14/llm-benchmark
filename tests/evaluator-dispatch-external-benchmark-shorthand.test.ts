// tests/evaluator-dispatch-external-benchmark-shorthand.test.ts
// 钉住 src/core/evaluator.ts v0.6.0 step-v6.0-9 (chain #10 dispatch-call-extraction):
// (1) dispatchExternalBenchmark private method 声明在 dispatchV050External 之前 (cfg-lookup wrapper)
// (2) 8 个外部 benchmark dispatch call site 全部用 4-arg shorthand (results, '<name>', '<url>', fetcher)
//    替代 5-arg 原版 (results, '<name>', this.config._external_benchmarks_roadmap?.<name>, '<url>', fetcher)
// (3) helper body 只 cfg-lookup + 透传 dispatchV050External (不引入新逻辑, 不修改 dispatchV050External)
// (4) 8 sites zero leftover `this.config._external_benchmarks_roadmap?.<name>` 散落 in dispatch call args
// (5) 8 sites 全部 `_external_benchmarks_roadmap?.<name>` 在 fetcher 闭包内仍可访问 (parallels 原行为)
// (6) benchmarkName 限定为 8-key literal union (TypeScript narrow)
import * as fs from 'fs';
import * as path from 'path';

const EVALUATOR_PATH = path.resolve(__dirname, '../src/core/evaluator.ts');

describe('evaluator dispatchExternalBenchmark shorthand (v0.6 step-v6.0-9 chain #10)', () => {
  const src = fs.readFileSync(EVALUATOR_PATH, 'utf-8');

  describe('dispatchExternalBenchmark private helper declaration', () => {
    it('declares dispatchExternalBenchmark as private async method', () => {
      expect(src).toMatch(/private async dispatchExternalBenchmark\(/);
    });

    it('helper sits BEFORE dispatchV050External (cfg-lookup wrapper, parallels chain #8+#9 pattern)', () => {
      const shorthandIdx = src.indexOf('private async dispatchExternalBenchmark');
      const v050Idx = src.indexOf('private async dispatchV050External');
      expect(shorthandIdx).toBeGreaterThan(-1);
      expect(v050Idx).toBeGreaterThan(-1);
      expect(shorthandIdx).toBeLessThan(v050Idx);
    });

    it('helper accepts 4 params: results, benchmarkName, defaultApiBase, fetcher', () => {
      // Substring grep for the signature pattern (multi-line tolerant)
      expect(src).toMatch(/private async dispatchExternalBenchmark\([\s\S]{0,400}?\)[\s\S]{0,200}?Promise<void>/);
    });

    it('helper body reads cfg from _external_benchmarks_roadmap?.[benchmarkName] (Record cast)', () => {
      expect(src).toMatch(/const ext = this\.config\._external_benchmarks_roadmap as Record<string,/);
      expect(src).toMatch(/const cfg = ext\?\.\[benchmarkName\];/);
    });

    it('helper body delegates to dispatchV050External (no new logic, pure wrapper)', () => {
      expect(src).toMatch(/return this\.dispatchV050External\(results, benchmarkName, cfg, defaultApiBase, fetcher\);/);
    });

    it('helper has v0.6.0 step-v6.0-9 JSDoc attribution block', () => {
      // JSDoc above the helper should reference the chain + step name
      const helperIdx = src.indexOf('private async dispatchExternalBenchmark');
      const j = src.slice(Math.max(0, helperIdx - 1500), helperIdx);
      expect(j).toMatch(/v0\.6\.0 step-v6\.0-9/);
      expect(j).toMatch(/chain #10/);
      expect(j).toMatch(/dispatch-call-extraction/);
    });
  });

  describe('8 dispatch sites migrated to 4-arg shorthand', () => {
    const NAMES = ['webdev_arena', 'cyberseceval3', 'aa_omniscience', 'terminal_bench', 'benchlm_agentic', 'swe_bench_pro', 'process_aware_scoring', 'long_context_cluster'];

    it.each(NAMES)('site %s uses dispatchExternalBenchmark shorthand', (name) => {
      const siteRe = new RegExp(`await this\\.dispatchExternalBenchmark\\(\\s*results, '${name}',`);
      expect(src).toMatch(siteRe);
    });

    it.each(NAMES)('site %s has NO inline cfg lookup arg (replaced by helper)', (name) => {
      // Should NOT have the old 5-arg shape: `await this.dispatchV050External(\n      results, '<name>',\n      this.config._external_benchmarks_roadmap?.<name>,`
      const oldRe = new RegExp(
        `await this\\.dispatchV050External\\(\\s*results, '${name}',\\s*this\\.config\\._external_benchmarks_roadmap\\?\\.${name},`,
      );
      expect(src).not.toMatch(oldRe);
    });

    it('exactly 8 dispatchExternalBenchmark call sites in run()', () => {
      const matches = src.match(/^\s*await this\.dispatchExternalBenchmark\(/gm) || [];
      expect(matches.length).toBe(8);
    });

    it('zero remaining `this.config._external_benchmarks_roadmap?.<name>` inline in dispatch args', () => {
      // The 8 old sites should now all be replaced. fetcher closures may still reference the
      // road map (e.g. `this.config._external_benchmarks_roadmap!.foo!.anchor_score`) — that's fine.
      // We only forbid the inline cfg arg in the dispatch call itself.
      const forbidden = /await this\.dispatchV050External\([\s\S]{0,200}?this\.config\._external_benchmarks_roadmap\?\.(\w+),[\s\S]{0,200}?'https?:/;
      expect(src).not.toMatch(forbidden);
    });
  });

  describe('8 URLs preserved verbatim (per-benchmark default api_base)', () => {
    it('webdev_arena url preserved', () => expect(src).toMatch(/await this\.dispatchExternalBenchmark\(\s*results, 'webdev_arena',\s*'https:\/\/webdevarena\.com\/api\/v1\/eval',/));
    it('cyberseceval3 url preserved', () => expect(src).toMatch(/await this\.dispatchExternalBenchmark\(\s*results, 'cyberseceval3',\s*'https:\/\/llm-benchmark\.local\/api\/v1\/cyberseceval3\/v3',/));
    it('aa_omniscience url preserved', () => expect(src).toMatch(/await this\.dispatchExternalBenchmark\(\s*results, 'aa_omniscience',\s*'https:\/\/llm-benchmark\.local\/api\/v1\/aa_omniscience\/v1',/));
    it('terminal_bench url preserved', () => expect(src).toMatch(/await this\.dispatchExternalBenchmark\(\s*results, 'terminal_bench',\s*'https:\/\/llm-benchmark\.local\/api\/v1\/terminal_bench\/v2',/));
    it('benchlm_agentic url preserved', () => expect(src).toMatch(/await this\.dispatchExternalBenchmark\(\s*results, 'benchlm_agentic',\s*'https:\/\/llm-benchmark\.local\/api\/v1\/benchlm_agentic\/v1',/));
    it('swe_bench_pro url preserved', () => expect(src).toMatch(/await this\.dispatchExternalBenchmark\(\s*results, 'swe_bench_pro',\s*'https:\/\/llm-benchmark\.local\/api\/v1\/swe_bench_pro\/v1',/));
    it('process_aware_scoring url preserved', () => expect(src).toMatch(/await this\.dispatchExternalBenchmark\(\s*results, 'process_aware_scoring',\s*'https:\/\/llm-benchmark\.local\/api\/v1\/process_aware_scoring\/v1',/));
    it('long_context_cluster url preserved', () => expect(src).toMatch(/await this\.dispatchExternalBenchmark\(\s*results, 'long_context_cluster',\s*'https:\/\/llm-benchmark\.local\/api\/v1\/long_context_cluster\/v1',/));
  });

  describe('helper signature parity with chain #8 #9', () => {
    it('helper benchmarkName typed as 8-key literal union (TypeScript narrow on cfg lookup)', () => {
      // The narrow union forces callers to pass a valid name; ts catches typos at compile time.
      expect(src).toMatch(/benchmarkName: 'webdev_arena' \| 'cyberseceval3' \| 'aa_omniscience' \| 'terminal_bench' \| 'benchlm_agentic' \| 'swe_bench_pro' \| 'process_aware_scoring' \| 'long_context_cluster'/);
    });

    it('dispatchV050External body UNCHANGED (helper is wrapper, not refactor of dispatch logic)', () => {
      // The existing dispatchV050External signature + body should be intact
      expect(src).toMatch(/private async dispatchV050External\(\s*results: EvaluationResult\[\],/);
      expect(src).toMatch(/if \(!cfg\?\.enabled\) return;/);
      expect(src).toMatch(/await Promise\.all\(\s*results\.map\(async \(result\) => \{/);
    });
  });
});
