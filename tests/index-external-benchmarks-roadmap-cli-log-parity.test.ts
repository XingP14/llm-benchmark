// tests/index-external-benchmarks-roadmap-cli-log-parity.test.ts
// 钉住 src/index.ts L100-L108 cliLog 9/9 dispatch parity (chain #19 wiring-prep closure, e578634 9th fetcher
// lm_eval_task_conflict_resolver 07-10 04:43 cron real-fetch skeleton shipped 后, cliLog 仍 stale 8/8 漂移).
// 6 regression gates 闭合 stale-comment silent-drift detection pattern (parallels 4a634a8 6af9f47 stale-comment
// 6 处 closure + reporter 5-dim ordinal parity tests, 第 8 处 跨项目标准化):
// (1) cliLog message includes 'dispatch 9/9 真实化' (parity with DEFAULT_LOG_FORMAT 9-key map post chain #19)
// (2) cliLog message lists 9 fetchers in fixed order (webdev_arena/terminal_bench/aa_omniscience/benchlm_agentic/cyberseceval3/swe_bench_pro/long_context_cluster/process_aware_scoring/lm_eval_task_conflict_resolver)
// (3) JSDoc above cliLog (L100) reflects 'dispatch 9/9' (parity with L108 message)
// (4) DEFAULT_LOG_FORMAT in src/core/evaluator.ts declares 9 entries (regression gate — was 8 stale)
// (5) DEFAULT_DISPATCH_TYPE in src/core/evaluator.ts declares 9 entries (regression gate — was 8 stale)
// (6) src/index.ts L100-L108 section has 0 hits of 'dispatch 8/8' stale literal (regression gate — false-positive detection)
import * as fs from 'fs';
import * as path from 'path';

const INDEX_PATH = path.resolve(__dirname, '../src/index.ts');
const EVALUATOR_PATH = path.resolve(__dirname, '../src/core/evaluator.ts');

describe('index external-benchmarks-roadmap cliLog 9/9 parity (chain #19 wiring-prep closure)', () => {
  const indexSrc = fs.readFileSync(INDEX_PATH, 'utf-8');
  const evaluatorSrc = fs.readFileSync(EVALUATOR_PATH, 'utf-8');

  it('cliLog message includes "dispatch 9/9 真实化" (regression gate — was "8/8" stale)', () => {
    // 截取 _external_benchmarks_roadmap 段 (L100-L108)
    const section = indexSrc.match(/v0\.5\.0\+ 外部基准路线图提示[\s\S]{0,800}?\n    \}/);
    expect(section).not.toBeNull();
    expect(section![0]).toMatch(/dispatch 9\/9 真实化/);
  });

  it('cliLog message lists 9 fetchers in fixed order (incl. lm_eval_task_conflict_resolver 9th)', () => {
    const section = indexSrc.match(/v0\.5\.0\+ 外部基准路线图提示[\s\S]{0,800}?\n    \}/);
    expect(section).not.toBeNull();
    // 期望顺序: webdev_arena/terminal_bench/aa_omniscience/benchlm_agentic/cyberseceval3/swe_bench_pro/long_context_cluster/process_aware_scoring/lm_eval_task_conflict_resolver
    const expected9 = [
      'webdev_arena',
      'terminal_bench',
      'aa_omniscience',
      'benchlm_agentic',
      'cyberseceval3',
      'swe_bench_pro',
      'long_context_cluster',
      'process_aware_scoring',
      'lm_eval_task_conflict_resolver',
    ];
    let cursor = 0;
    for (const name of expected9) {
      const idx = section![0].indexOf(name, cursor);
      expect(idx).toBeGreaterThanOrEqual(cursor);
      cursor = idx + name.length;
    }
  });

  it('JSDoc above cliLog (L100) reflects "dispatch 9/9" (parity with message body)', () => {
    const section = indexSrc.match(/v0\.5\.0\+ 外部基准路线图提示[\s\S]{0,800}?\n    \}/);
    expect(section).not.toBeNull();
    // 注释 L100 必须含 'dispatch 9/9 ✅' (stale '8/8' → '9/9' closure)
    const jsdoc = section![0].split('\n').find(l => l.includes('外部基准路线图提示'));
    expect(jsdoc).toBeDefined();
    expect(jsdoc).toMatch(/dispatch 9\/9 ✅/);
  });

  it('DEFAULT_LOG_FORMAT in src/core/evaluator.ts declares 9 entries (regression gate — was 8 stale)', () => {
    const tableMatch = evaluatorSrc.match(/export const DEFAULT_LOG_FORMAT: Record<string, string> = \{([\s\S]+?)\};/);
    expect(tableMatch).not.toBeNull();
    const body = tableMatch![1];
    const entryCount = (body.match(/^\s*\w+:/gm) || []).length;
    expect(entryCount).toBe(9);
  });

  it('DEFAULT_DISPATCH_TYPE in src/core/evaluator.ts declares 9 entries (regression gate — was 8 stale)', () => {
    const tableMatch = evaluatorSrc.match(/export const DEFAULT_DISPATCH_TYPE: Record<string, ExternalDispatchType> = \{([\s\S]+?)\};/);
    expect(tableMatch).not.toBeNull();
    const body = tableMatch![1];
    const entryCount = (body.match(/^\s*\w+:/gm) || []).length;
    expect(entryCount).toBe(9);
  });

  it('src/index.ts L100-L108 section has 0 hits of "dispatch 8/8" stale literal (false-positive gate)', () => {
    const section = indexSrc.match(/v0\.5\.0\+ 外部基准路线图提示[\s\S]{0,800}?\n    \}/);
    expect(section).not.toBeNull();
    expect(section![0]).not.toMatch(/dispatch 8\/8/);
  });
});
