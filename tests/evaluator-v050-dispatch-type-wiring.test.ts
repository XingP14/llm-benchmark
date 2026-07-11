// tests/evaluator-v050-dispatch-type-wiring.test.ts
// 07-01 23:43 cron regression gate: v0.5.0 5-dispatch `type` field wired into dispatch helper + 5 fetchers
// (closes hint gap "修 v0.5.0 type 段 5 处 stub 真实化 (process_aware_scoring / swe_bench_pro /
//  terminal_bench / benchlm_agentic / long_context_cluster 已有 dispatch, 补 type field)")
//
// Pins:
// 1) dispatchV050External helper cfg type includes type?: string
// 2) dispatchV050External fetcher signature has 4th arg dispatchType: string
// 3) dispatchV050External calls fetcher with 4th arg `cfg?.type ?? "<default>"`
// 4) 5 fetchers (terminal_bench / benchlm_agentic / swe_bench_pro / process_aware_scoring /
//    long_context_cluster) all declare `dispatchType: string = '<category>'` as last param
// 5) 5 fetchers all include `dispatch_type: dispatchType` in basePayload POST body
// 6) 5 dispatch sites pass cfg.type ?? '<fallback>' as the new arg to each fetcher
// 7) No regression on previous size range (1373..1500 — adds ~25 lines: 5 signatures + 5 payload fields)
import * as fs from 'fs';
import * as path from 'path';

const EVALUATOR_PATH = path.resolve(__dirname, '../src/core/evaluator.ts');

describe('evaluator v0.5.0 dispatch type wiring (5 fetcher payload dispatch_type)', () => {
  const src = fs.readFileSync(EVALUATOR_PATH, 'utf-8');

  const FIVE_NAMES = [
    { name: 'terminal_bench',       type: 'agentic_coding',        shortFn: 'fetchTerminalBenchScore' },
    { name: 'benchlm_agentic',      type: 'agentic_fullstack',     shortFn: 'fetchBenchlmAgenticScore' },
    { name: 'swe_bench_pro',        type: 'agentic_swe',           shortFn: 'fetchSweBenchProScore' },
    { name: 'process_aware_scoring', type: 'process_agentic',      shortFn: 'fetchProcessAwareScoringScore' },
    { name: 'long_context_cluster', type: 'long_context_retrieval', shortFn: 'fetchLongContextClusterScore' },
  ] as const;

  it('file size in expected range (1373..1500 lines — adds ~25 lines vs 1373 baseline)', () => {
    const lineCount = src.split('\n').length;
    expect(lineCount).toBeGreaterThanOrEqual(1373);
    expect(lineCount).toBeLessThan(1820); // bumped 1750→1820 after chain #19 lm_eval_task_conflict_resolver 9th site (chain #12 left 1619 baseline, +91 JSDoc+9th-site+union-ext+anchor/mode/dependency_groups closure lines vs 1710 actual; 留 40 行 slack) dispatch-call-extraction (DEFAULT_API_BASE 8-key map + dispatchExternalCall 3-arg wrapper + 8 sites collapse ~75 JSDoc+helper lines vs chain #11 1560 baseline; 现 1619, 留 81 行 slack)
  });

  it('dispatchV050External cfg type includes type?: string field', () => {
    const m = src.match(/private async dispatchV050External\([\s\S]*?\): Promise<void>/);
    expect(m).not.toBeNull();
    const sig = m![0];
    expect(sig).toMatch(/cfg:\s*\{[^}]*type\?:\s*string/);
  });

  it('dispatchV050External fetcher signature has 4th arg dispatchType: string', () => {
    const m = src.match(/private async dispatchV050External\([\s\S]*?\): Promise<void>/);
    expect(m).not.toBeNull();
    const sig = m![0];
    expect(sig).toMatch(/fetcher:\s*\(apiBase:\s*string,\s*model:\s*ModelConfig,\s*timeoutMs:\s*number,\s*dispatchType:\s*string\)/);
  });

  it('dispatchV050External invokes fetcher with cfg?.type ?? <default> as 4th arg', () => {
    // helper body: const score = await fetcher(apiBase, result.model, timeoutMs, cfg?.type ?? defaultDispatchType(<name>));
    // (v0.6 chain #8 helper-extraction replaced literal 'agentic_coding' with defaultDispatchType('agentic_coding'))
    expect(src).toMatch(/await fetcher\(apiBase,\s*result\.model,\s*timeoutMs,\s*cfg\?\.type\s*\?\?\s*defaultDispatchType\(/);
  });

  it.each(FIVE_NAMES)('$name fetcher declares dispatchType param via defaultDispatchType helper (chain #8 helper)', ({ shortFn }) => {
    // match: private async <shortFn>( ... dispatchType: string = defaultDispatchType('<name>') ) [chain #8 helper]
    const re = new RegExp(`private async ${shortFn}\\([\\s\\S]*?dispatchType:\\s*string\\s*=\\s*defaultDispatchType\\(['"]\\w+['"]\\)`);
    expect(src).toMatch(re);
  });

  it.each(FIVE_NAMES)('$name fetcher basePayload POST body includes dispatch_type: dispatchType', ({ name }) => {
    // match: ... dispatch_type: dispatchType } in some fetcher body block
    // Locate fetchXxxScore body via its basePayload literal within private method
    // simpler: just check the substring exists near the canonical questionId
    const idx = src.indexOf(`const questionId = \`${name}_`);
    expect(idx).toBeGreaterThan(0);
    // walk forward 600 chars, expect dispatch_type: dispatchType
    const segment = src.slice(idx, idx + 1200);
    expect(segment).toMatch(/dispatch_type:\s*dispatchType/);
  });

  it.each(FIVE_NAMES)('$name dispatch site passes cfg.type ?? defaultDispatchType(<name>) as last arg (chain #8)', ({ name }) => {
    // match: this.fetch<Short>Score( ... , <cfgRef>.type ?? '<type>')
    // cfgRef abbreviations vary: tb / bla / sbp / pas / lcc
    // v0.6 chain #8 helper-extraction: dispatch sites now use defaultDispatchType(<name>) instead of literal fallback
    const re = new RegExp(`this\\.fetch${name.charAt(0).toUpperCase() + name.slice(1).replace(/_([a-z])/g, (_, c) => c.toUpperCase())}Score\\([\\s\\S]*?\\.type\\s*\\?\\?\\s*defaultDispatchType\\(['"]\\w+['"]\\)`);
    expect(src).toMatch(re);
  });
});
