// tests/evaluator-dispatch-v050-external-helper.test.ts
// 钉住 src/core/evaluator.ts:1305 dispatchV050External() helper 存在 + 8 v0.5.0 dispatch sites 全部走 helper:
// 1) helper declared as private async (single instance)
// 2) helper signature canonical: 5 params (results, benchmarkName, cfg, defaultApiBase, fetcher), returns Promise<void>
// 3) helper body canonical: enabled guard + api_base ?? defaultApiBase + timeout_ms ?? 30000 + Promise.all(results.map(model_id_filter + fetcher + scores.push + log))
// 4) 8 sites call this.dispatchV050External( at run() level (webdev_arena/cyberseceval3/aa_omniscience/terminal_bench/benchlm_agentic/swe_bench_pro/process_aware_scoring/long_context_cluster)
// 5) 0 inline `if (this.config._external_benchmarks_roadmap?.<NAME>?.enabled) {` dispatch-block patterns remain (regression gate — 8 sites collapsed)
// 6) helper file size + run() block range consistent (post-refactor 1326 lines, down from 1366)
// 7) each of 8 sites passes benchmarkName as lowercase_snake string literal (webdev_arena / cyberseceval3 / aa_omniscience / terminal_bench / benchlm_agentic / swe_bench_pro / process_aware_scoring / long_context_cluster)
// 8) default API base literals for 8 sites match v0.5.0 dispatch endpoints (no accidental rewriting)
import * as fs from 'fs';
import * as path from 'path';

const EVALUATOR_PATH = path.resolve(__dirname, '../src/core/evaluator.ts');

describe('evaluator dispatchV050External helper (8-site dedupe)', () => {
  const src = fs.readFileSync(EVALUATOR_PATH, 'utf-8');

  it('file size in expected range (1300..1420 — bootstrap95CI helper added 74 lines at v0.6.0 step-v6.0-2)', () => {
    expect(src).toBeDefined();
    const lineCount = src.split('\n').length;
    expect(lineCount).toBeGreaterThanOrEqual(1300);
    expect(lineCount).toBeLessThan(1420); // bootstrap95CI helper added 74 lines (v0.6.0 step-v6.0-2)
  });

  it('declares exactly one private async dispatchV050External helper', () => {
    const matches = src.match(/private async dispatchV050External\(/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(1);
  });

  it('helper signature canonical: 5 params (results, benchmarkName, cfg, defaultApiBase, fetcher)', () => {
    const m = src.match(/private async dispatchV050External\(\s*([\s\S]*?)\): Promise<void>/);
    expect(m).not.toBeNull();
    const params = m![1];
    expect(params).toMatch(/results:\s*EvaluationResult\[\]/);
    expect(params).toMatch(/benchmarkName:\s*string/);
    expect(params).toMatch(/cfg:\s*\{[^}]*enabled\?:\s*boolean/);
    expect(params).toMatch(/cfg:\s*\{[^}]*api_base\?:\s*string/);
    expect(params).toMatch(/cfg:\s*\{[^}]*timeout_ms\?:\s*number/);
    expect(params).toMatch(/cfg:\s*\{[^}]*model_id\?:\s*string/);
    expect(params).toMatch(/cfg:[\s\S]*\|\s*undefined/); // cfg: { ... } | undefined
    expect(params).toMatch(/defaultApiBase:\s*string/);
    expect(params).toMatch(/fetcher:\s*\(apiBase:\s*string,\s*model:\s*ModelConfig,\s*timeoutMs:\s*number\)\s*=>\s*Promise<QuestionScore>/);
  });

  it('helper body canonical: enabled guard + api_base ?? default + timeout_ms ?? 30000 + Promise.all + model_id filter + scores.push + log', () => {
    const helperStart = src.indexOf('private async dispatchV050External(');
    expect(helperStart).toBeGreaterThanOrEqual(0);
    const afterDecl = src.indexOf(': Promise<void> {', helperStart);
    expect(afterDecl).toBeGreaterThan(0);
    const bodyEnd = src.indexOf('\n  }\n', afterDecl);
    expect(bodyEnd).toBeGreaterThan(afterDecl);
    const body = src.slice(afterDecl, bodyEnd);
    expect(body).toMatch(/if\s*\(!cfg\?\.enabled\)\s*return/);
    expect(body).toMatch(/cfg\.api_base\s*\?\?\s*defaultApiBase/);
    expect(body).toMatch(/cfg\.timeout_ms\s*\?\?\s*30000/);
    expect(body).toMatch(/await Promise\.all\(\s*results\.map\(async \(result\)/);
    expect(body).toMatch(/cfg\.model_id\s*&&/);
    expect(body).toMatch(/result\.scores\.push\(score\)/);
    expect(body).toMatch(/log\(`\s*\[\$\{result\.modelName\}\]\s*\$\{benchmarkName\}\s*score:/);
    expect(body).toMatch(/\$\{score\.detail\s*\?\?\s*'no detail'\}/);
  });

  it('8 call sites at run() level use this.dispatchV050External( with lowercase_snake benchmarkName literal', () => {
    const expected = [
      'webdev_arena',
      'cyberseceval3',
      'aa_omniscience',
      'terminal_bench',
      'benchlm_agentic',
      'swe_bench_pro',
      'process_aware_scoring',
      'long_context_cluster',
    ];
    for (const name of expected) {
      const re = new RegExp(`await this\\.dispatchV050External\\(\\s*[\\s\\S]*?'${name}'`);
      expect(re.test(src)).toBe(true);
    }
    const totalCalls = (src.match(/await this\.dispatchV050External\(/g) || []).length;
    expect(totalCalls).toBe(8);
  });

  it('zero remaining inline `if (this.config._external_benchmarks_roadmap?.<NAME>?.enabled) {` dispatch-block patterns (regression gate)', () => {
    const lines = src.split('\n');
    const codeLineRe = /^\s*if \(this\.config\._external_benchmarks_roadmap\?/;
    const offenders = lines.filter(l => codeLineRe.test(l));
    expect(offenders).toEqual([]);
  });

  it('helper sits at class bottom (after calculateCategoryDetails, before class close `}\\n}`)', () => {
    const helperIdx = src.indexOf('private async dispatchV050External(');
    const calcIdx = src.indexOf('private calculateCategoryDetails(');
    const classCloseIdx = src.lastIndexOf('\n}\n');
    expect(helperIdx).toBeGreaterThan(calcIdx);
    expect(helperIdx).toBeLessThan(classCloseIdx);
  });

  it('default API base literals for 8 sites match v0.5.0 dispatch endpoints (no accidental rewriting)', () => {
    const expectations = [
      "'https://webdevarena.com/api/v1/eval'",
      "'https://llm-benchmark.local/api/v1/cyberseceval3/v3'",
      "'https://llm-benchmark.local/api/v1/aa_omniscience/v1'",
      "'https://llm-benchmark.local/api/v1/terminal_bench/v2'",
      "'https://llm-benchmark.local/api/v1/benchlm_agentic/v1'",
      "'https://llm-benchmark.local/api/v1/swe_bench_pro/v1'",
      "'https://llm-benchmark.local/api/v1/process_aware_scoring/v1'",
      "'https://llm-benchmark.local/api/v1/long_context_cluster/v1'",
    ];
    for (const endpoint of expectations) {
      expect(src).toContain(endpoint);
    }
  });
});
