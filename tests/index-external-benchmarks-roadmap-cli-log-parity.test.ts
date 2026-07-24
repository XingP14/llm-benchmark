// tests/index-external-benchmarks-roadmap-cli-log-parity.test.ts
// 钉住 src/index.ts L100-L108 cliLog 10/10 dispatch parity (chain #20 livebench_2026_h1_quarterly_v3 10th fetcher
// 07-25 03:24 cron real-fetch closure).
// 6 regression gates 闭合 stale-comment silent-drift detection pattern:
// (1) cliLog message includes 'dispatch 10/10 真实化' (parity with DEFAULT_LOG_FORMAT 10-key map post chain #20)
// (2) cliLog message lists 10 fetchers in fixed order (webdev_arena/terminal_bench/aa_omniscience/benchlm_agentic/cyberseceval3/swe_bench_pro/long_context_cluster/process_aware_scoring/lm_eval_task_conflict_resolver/livebench_2026_h1_quarterly_v3)
// (3) JSDoc above cliLog reflects 'dispatch 10/10' (parity with message body)
// (4) DEFAULT_LOG_FORMAT in src/core/evaluator.ts declares 10 entries
// (5) DEFAULT_DISPATCH_TYPE in src/core/evaluator.ts declares 10 entries
// (6) src/index.ts section has 0 hits of 'dispatch 8/8' or 'dispatch 9/9' stale literals
import * as fs from 'fs';
import * as path from 'path';

const INDEX_PATH = path.resolve(__dirname, '../src/index.ts');
const EVALUATOR_PATH = path.resolve(__dirname, '../src/core/evaluator.ts');

describe('index external-benchmarks-roadmap cliLog 10/10 parity (chain #20 closure)', () => {
  const indexSrc = fs.readFileSync(INDEX_PATH, 'utf-8');
  const evaluatorSrc = fs.readFileSync(EVALUATOR_PATH, 'utf-8');

  it('cliLog message includes "dispatch 10/10 真实化" (regression gate)', () => {
    const section = indexSrc.match(/v0\.5\.0\+ 外部基准路线图提示[\s\S]{0,800}?\n    \}/);
    expect(section).not.toBeNull();
    expect(section![0]).toMatch(/dispatch 10\/10 真实化/);
  });

  it('cliLog message lists 10 fetchers in fixed order', () => {
    const section = indexSrc.match(/v0\.5\.0\+ 外部基准路线图提示[\s\S]{0,800}?\n    \}/);
    expect(section).not.toBeNull();
    const expected10 = [
      'webdev_arena',
      'terminal_bench',
      'aa_omniscience',
      'benchlm_agentic',
      'cyberseceval3',
      'swe_bench_pro',
      'long_context_cluster',
      'process_aware_scoring',
      'lm_eval_task_conflict_resolver',
      'livebench_2026_h1_quarterly_v3',
    ];
    let cursor = 0;
    for (const name of expected10) {
      const idx = section![0].indexOf(name, cursor);
      expect(idx).toBeGreaterThanOrEqual(cursor);
      cursor = idx + name.length;
    }
  });

  it('JSDoc above cliLog reflects "dispatch 10/10" (parity with message body)', () => {
    const section = indexSrc.match(/v0\.5\.0\+ 外部基准路线图提示[\s\S]{0,800}?\n    \}/);
    expect(section).not.toBeNull();
    const jsdoc = section![0].split('\n').find(l => l.includes('外部基准路线图提示'));
    expect(jsdoc).toBeDefined();
    expect(jsdoc).toMatch(/dispatch 10\/10 ✅/);
  });

  it('DEFAULT_LOG_FORMAT in src/core/evaluator.ts declares 10 entries', () => {
    const tableMatch = evaluatorSrc.match(/export const DEFAULT_LOG_FORMAT: Record<string, string> = \{([\s\S]+?)\};/);
    expect(tableMatch).not.toBeNull();
    const body = tableMatch![1];
    const entryCount = (body.match(/^\s*\w+:/gm) || []).length;
    expect(entryCount).toBe(10);
  });

  it('DEFAULT_DISPATCH_TYPE in src/core/evaluator.ts declares 10 entries', () => {
    const tableMatch = evaluatorSrc.match(/export const DEFAULT_DISPATCH_TYPE: Record<string, ExternalDispatchType> = \{([\s\S]+?)\};/);
    expect(tableMatch).not.toBeNull();
    const body = tableMatch![1];
    const entryCount = (body.match(/^\s*\w+:/gm) || []).length;
    expect(entryCount).toBe(10);
  });

  it('src/index.ts section has 0 hits of "dispatch 8/8" or "dispatch 9/9" stale literals', () => {
    const section = indexSrc.match(/v0\.5\.0\+ 外部基准路线图提示[\s\S]{0,800}?\n    \}/);
    expect(section).not.toBeNull();
    expect(section![0]).not.toMatch(/dispatch 8\/8/);
    expect(section![0]).not.toMatch(/dispatch 9\/9/);
  });
});
