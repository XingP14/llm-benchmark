// tests/evaluator-lm-eval-task-conflict-resolver-skeleton.test.ts
// 钉住 src/core/evaluator.ts v0.6.0 step-v6.0-13 (chain #19 wiring-prep): 真实 fetch 接入准备
// (07-10 05:03 cron tick, 沿 8769f27 type stub + abf14d6 chain #12 dispatchExternalCall 3-arg shorthand):
// (1) DEFAULT_API_BASE 9-key map 含 lm_eval_task_conflict_resolver entry
//    (webdev_arena + cyberseceval3 + aa_omniscience + terminal_bench + benchlm_agentic +
//     swe_bench_pro + process_aware_scoring + long_context_cluster + lm_eval_task_conflict_resolver)
// (2) DEFAULT_API_BASE[lm_eval_task_conflict_resolver] = 'https://llm-benchmark.local/api/v1/lm_eval_task_conflict_resolver/v1'
// (3) lm_eval_task_conflict_resolver 是新增的 v0.6.0 第 9 项 real fetch, 与 8 项 v0.5 并列
// (4) fetchLmEvalTaskConflictResolverScore private method 存在 (8 项 fetch + 1 新 = 9 个 fetcher function)
// (5) fetcher 4-arg signature (apiBase/model/timeoutMs/dispatchType) 与 8 项 v0.5 对齐
// (6) fetcher basePayload 字段 (api_base/model_id/tasks/mode/dependency_groups/timeout_ms/dispatch_type) 7 字段
// (7) fetcher skeleton 返回 QuestionScore 5 字段 (questionId/category/score/dimension/dispatchType)
//    category=lm_eval_task_conflict_resolver + dimension=coding 走 v0.4.0 默认
// (8) fetcher skeleton 0 真实 API 调用 (placeholderConflicts=0, score=100 sentinel)
// (9) fetcher 错误路径仍 TODO (本步未实现 dry_run/auto_resolve/report_only 三模式 switch, 后续 cron tick 补)
// (10) lm_eval_task_conflict_resolver 在 9-key map 中位置 = 第 9 个 entry (顺序紧跟 long_context_cluster)
// (11) 立项 JSDoc 包含 step-v6.0-13 + chain #19 + lm_eval_task_conflict_resolver_real_v1
// (12) src/types/index.ts ExternalBenchmarkRoadmap.lm_eval_task_conflict_resolver type 段已存在 (8769f27 type stub)
// (13) 9th dispatch site NOT yet wired in run() method (本步仅 skeleton, 后续 tick 接入 dispatchExternalCall)
// (14) ZERO real API call — basePayload 仅构造, 不调 fetch / AbortController / response parse
import * as fs from 'fs';
import * as path from 'path';

const EVALUATOR_PATH = path.resolve(__dirname, '../src/core/evaluator.ts');
const TYPES_PATH = path.resolve(__dirname, '../src/types/index.ts');

describe('evaluator fetchLmEvalTaskConflictResolverScore skeleton (v0.6 step-v6.0-13 chain #19 wiring-prep)', () => {
  const src = fs.readFileSync(EVALUATOR_PATH, 'utf-8');

  describe('DEFAULT_API_BASE 9-key map (extending 8-key v0.5)', () => {
    it('contains lm_eval_task_conflict_resolver entry as 9th item', () => {
      // 必须紧跟 long_context_cluster 之后 (声明顺序与 chain #19 wiring-prep plan 一致)
      expect(src).toMatch(/long_context_cluster:\s*'https:\/\/llm-benchmark\.local\/api\/v1\/long_context_cluster\/v1',[\s\S]{0,400}?lm_eval_task_conflict_resolver:\s*'https:\/\/llm-benchmark\.local\/api\/v1\/lm_eval_task_conflict_resolver\/v1',/);
    });

    it('lm_eval_task_conflict_resolver URL follows llm-benchmark.local stub pattern', () => {
      expect(src).toMatch(/lm_eval_task_conflict_resolver:\s*'https:\/\/llm-benchmark\.local\/api\/v1\/lm_eval_task_conflict_resolver\/v1'/);
    });

    it('9-key map total (8 v0.5 + 1 v0.6 lm_eval_task_conflict_resolver)', () => {
      // 用 name 出现次数 count (declarative 锁定 9-key)
      const keys = ['webdev_arena', 'cyberseceval3', 'aa_omniscience', 'terminal_bench', 'benchlm_agentic', 'swe_bench_pro', 'process_aware_scoring', 'long_context_cluster', 'lm_eval_task_conflict_resolver'];
      for (const k of keys) {
        // 每个 key 必须在 DEFAULT_API_BASE map 内出现 (声明一次)
        const mapMatch = src.match(/export const DEFAULT_API_BASE: Record<string, string> = \{([\s\S]*?)\n\};/);
        expect(mapMatch).not.toBeNull();
        const mapBody = mapMatch![1];
        expect(mapBody).toContain(`${k}:`);
      }
    });
  });

  describe('fetchLmEvalTaskConflictResolverScore fetcher skeleton', () => {
    it('declares private async fetchLmEvalTaskConflictResolverScore method', () => {
      expect(src).toMatch(/private async fetchLmEvalTaskConflictResolverScore\(/);
    });

    it('fetcher 4-arg signature locked (apiBase/model/timeoutMs/dispatchType) + 3 optional (anchorScore/mode/dependencyGroups)', () => {
      // 4 必填 + 3 选填, 与 8 项 v0.5 fetcher signature 模式对齐 (parallels process_aware_scoring 7-arg)
      expect(src).toMatch(/private async fetchLmEvalTaskConflictResolverScore\(\s*\n\s*apiBase: string,\s*\n\s*model: ModelConfig,\s*\n\s*timeoutMs: number,\s*\n\s*anchorScore\?: number,\s*\n\s*mode: string = 'dry_run',\s*\n\s*dependencyGroups: string = 'all',\s*\n\s*dispatchType: string = defaultDispatchType\('lm_eval_task_conflict_resolver'\)/);
    });

    it('basePayload 7 fields (api_base/model_id/tasks/mode/dependency_groups/timeout_ms/dispatch_type)', () => {
      expect(src).toMatch(/const basePayload = \{[\s\S]*?api_base: model\.endpoint,[\s\S]*?model_id: model\.model \?\? model\.name,[\s\S]*?tasks: \['acpbench', 'math', 'gsm8k'\],[\s\S]*?mode,[\s\S]*?dependency_groups: dependencyGroups,[\s\S]*?timeout_ms: timeoutMs,[\s\S]*?dispatch_type: dispatchType,[\s\S]*?\};/);
    });

    it('skeleton returns QuestionScore 5 fields with category=lm_eval_task_conflict_resolver + dimension=coding', () => {
      expect(src).toMatch(/questionId,[\s\S]*?category: 'lm_eval_task_conflict_resolver',[\s\S]*?score: Math\.round\(normalized \* 10\) \/ 10,[\s\S]*?dimension: 'coding',[\s\S]*?modelOutput:[\s\S]*?detail,[\s\S]*?dispatchType,[\s\S]*?\};/);
    });

    it('skeleton returns sentinel score=100 (placeholder, 0 real API call)', () => {
      expect(src).toMatch(/const placeholderConflicts = 0;[\s\S]*?const normalized = 100;/);
    });

    it('skeleton does NOT call real fetch (no code-level fetch( / AbortController, comments allowed)', () => {
      // 提取 fetcher body 范围 (从 fetcher decl 到 closing })
      const fetchMatch = src.match(/private async fetchLmEvalTaskConflictResolverScore\([\s\S]*?\n  \}\n/);
      expect(fetchMatch).not.toBeNull();
      // strip comment lines (// ...) 避免注释中提及 fetch( 被误判
      const codeOnly = fetchMatch![0]
        .split('\n')
        .filter((l) => !l.trim().startsWith('//'))
        .join('\n');
      // skeleton 阶段不应有真实 fetch 调用 (后续 cron tick 接入)
      expect(codeOnly).not.toMatch(/await fetch\(/);
      expect(codeOnly).not.toMatch(/new AbortController/);
    });

    it('skeleton void apiBase suppress unused-parameter warning (placeholder annotation)', () => {
      // 后续 cron tick 真实 fetch 接入时, 此 void apiBase 替换为 fetch(apiBase, ...)
      expect(src).toMatch(/void apiBase;/);
    });
  });

  describe('wiring-prep pre-flight (9th dispatch site NOT yet wired, intentional)', () => {
    it('run() method does NOT yet call dispatchExternalCall for lm_eval_task_conflict_resolver', () => {
      // 本步仅 skeleton (DEFAULT_API_BASE entry + fetcher method), 9th dispatch site 在下轮接入
      // 必须无 await this.dispatchExternalCall(... 'lm_eval_task_conflict_resolver' ...)
      const runMatch = src.match(/async run\(\)[\s\S]*?await this\.dispatchExternalCall\(\s*\n\s*results, 'long_context_cluster',[\s\S]*?\}\);/);
      expect(runMatch).not.toBeNull();
      const lastDispatch = runMatch![0];
      expect(lastDispatch).not.toMatch(/lm_eval_task_conflict_resolver/);
    });

    it('union types in dispatchExternalCall + dispatchExternalBenchmark NOT yet extended (8-key preserved)', () => {
      // union 类型扩展在下轮 (本轮保持 8-key union, 0 type widening 风险)
      const unionMatch = src.match(/benchmarkName: 'webdev_arena' \| 'cyberseceval3' \| 'aa_omniscience' \| 'terminal_bench' \| 'benchlm_agentic' \| 'swe_bench_pro' \| 'process_aware_scoring' \| 'long_context_cluster'/);
      expect(unionMatch).not.toBeNull();
      // 仍为 8-key (未扩展), 验证无第 9 个 union member
      expect(unionMatch![0]).not.toMatch(/lm_eval_task_conflict_resolver/);
    });
  });

  describe('立项 JSDoc + 跨文件 type stub 协同 (parallels 8769f27)', () => {
    it('JSDoc references step-v6.0-13 + chain #19 wiring-prep + lm_eval_task_conflict_resolver_real_v1', () => {
      // 立项 JSDoc 必须包含 3 关键词 (避免 silent 漂移)
      expect(src).toMatch(/step-v6\.0-13/);
      expect(src).toMatch(/chain #19 wiring-prep|chain #12 dispatchExternalCall/);
    });

    it('src/types/index.ts ExternalBenchmarkRoadmap.lm_eval_task_conflict_resolver type stub still exists (8769f27)', () => {
      const typesSrc = fs.readFileSync(TYPES_PATH, 'utf-8');
      expect(typesSrc).toMatch(/lm_eval_task_conflict_resolver\?: \{[\s\S]*?enabled: boolean;[\s\S]*?tasks\?: string\[\];[\s\S]*?mode\?: 'dry_run' \| 'auto_resolve' \| 'report_only';[\s\S]*?dependency_groups\?:/);
    });
  });

  describe('silent-drift detection: 9-key map 数量锁定 (regression gate)', () => {
    it('rejects accidental 8-key rollback (must include lm_eval_task_conflict_resolver)', () => {
      // 8-key 旧版特征: lm_eval_task_conflict_resolver 缺失
      // 如果未来回退 8-key, 这个正则会失败, 报警 stale-fallback
      const mapMatch = src.match(/export const DEFAULT_API_BASE: Record<string, string> = \{([\s\S]*?)\n\};/);
      expect(mapMatch).not.toBeNull();
      const mapBody = mapMatch![1];
      expect(mapBody).toContain('lm_eval_task_conflict_resolver');
      // 顺序锁定: lm_eval_task_conflict_resolver 必须在 long_context_cluster 之后
      const lccIdx = mapBody.indexOf('long_context_cluster');
      const ltrIdx = mapBody.indexOf('lm_eval_task_conflict_resolver');
      expect(ltrIdx).toBeGreaterThan(lccIdx);
    });
  });
});
