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
// (8) fetcher 真实 fetch + 5-field decode (conflicts_detected / resolver_status / skip_tasks / report_yaml / eval_id, 07-12 01:23 cron round 2 closure)
// (9) fetcher 错误路径三段 try/catch (timeout / 4xx / 5xx, parallels fetchLongContextClusterScore 6-gate pattern); 失败路径返回 0 分 QuestionScore, 不阻塞主评测
// (10) lm_eval_task_conflict_resolver 在 9-key map 中位置 = 第 9 个 entry (顺序紧跟 long_context_cluster)
// (11) 立项 JSDoc 包含 step-v6.0-13 + chain #19 + lm_eval_task_conflict_resolver_real_v1
// (12) src/types/index.ts ExternalBenchmarkRoadmap.lm_eval_task_conflict_resolver type 段已存在 (8769f27 type stub)
// (13) 9th dispatch site wired in run() method (07-11 00:23 cron tick, chain #19 closure; 沿 e578634 skeleton + abf14d6 dispatchExternalCall 3-arg shorthand)
// (14) REAL fetch + parse — basePayload 走 JSON.stringify(body) + AbortController + response.json() 5-field decode (round 2 closure, 07-12 01:23 cron)

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
      expect(src).toMatch(/private async fetchLmEvalTaskConflictResolverScore\(\s*\n\s*apiBase: string,\s*\n\s*model: ModelConfig,\s*\n\s*timeoutMs: number,\s*\n\s*anchorScore\?: number,\s*\n\s*mode: string = 'dry_run',\s*\n\s*dependencyGroups: string = 'all',\s*\n\s*dispatchType: ExternalDispatchType = defaultDispatchType\('lm_eval_task_conflict_resolver'\)/);
    });

    it('basePayload 7 fields (api_base/model_id/tasks/mode/dependency_groups/timeout_ms/dispatch_type)', () => {
      expect(src).toMatch(/const basePayload = \{[\s\S]*?api_base: model\.endpoint,[\s\S]*?model_id: model\.model \?\? model\.name,[\s\S]*?tasks: \['acpbench', 'math', 'gsm8k'\],[\s\S]*?mode,[\s\S]*?dependency_groups: dependencyGroups,[\s\S]*?timeout_ms: timeoutMs,[\s\S]*?dispatch_type: dispatchType,[\s\S]*?\};/);
    });

    it('skeleton returns QuestionScore 5 fields with category=lm_eval_task_conflict_resolver + dimension=coding', () => {
      expect(src).toMatch(/questionId,[\s\S]*?category: 'lm_eval_task_conflict_resolver',[\s\S]*?score: Math\.round\(normalized \* 10\) \/ 10,[\s\S]*?dimension: 'coding',[\s\S]*?modelOutput:[\s\S]*?detail,[\s\S]*?dispatchType,[\s\S]*?\};/);
    });

    it('real fetch 5-field decode + normalized=100-conflicts*5 (round 2 closure, replaces sentinel)', () => {
      // 5 字段 parse: conflicts_detected / resolver_status / skip_tasks / report_yaml / eval_id
      expect(src).toMatch(/const data = \(await resp\.json\(\)\) as \{[\s\S]*?conflicts_detected\?: number;[\s\S]*?resolver_status\?:/);
      // 归一公式: 100 - conflicts*5 clamp [0, 100]
      expect(src).toMatch(/const conflicts = typeof data\.conflicts_detected === 'number' \? data\.conflicts_detected : 0;/);
      expect(src).toMatch(/const normalized = Math\.max\(0, Math\.min\(100, 100 - conflicts \* 5\)\);/);
    });

    it('real fetch + AbortController + 3-segment try/catch (timeout / 4xx / 5xx, parallels fetchLongContextClusterScore 6-gate)', () => {
      const fetchMatch = src.match(/private async fetchLmEvalTaskConflictResolverScore\([\s\S]*?\n  \}\n/);
      expect(fetchMatch).not.toBeNull();
      const codeOnly = fetchMatch![0]
        .split('\n')
        .filter((l) => !l.trim().startsWith('//'))
        .join('\n');
      // real fetch call present (与 8 项 v0.5 fetcher 完全对齐)
      expect(codeOnly).toMatch(/await fetch\(apiBase,/);
      expect(codeOnly).toMatch(/new AbortController/);
      // 4xx 分支
      expect(codeOnly).toMatch(/if \(!resp\.ok\)/);
      expect(codeOnly).toMatch(/HTTP \$\{resp\.status\}: \$\{errText\.slice\(0, 200\)\}/);
      // catch 分支 (timeout / generic fetch error)
      expect(codeOnly).toMatch(/catch \(err: unknown\) \{/);
      expect(codeOnly).toMatch(/timeout after \$\{timeoutMs\}ms/);
      expect(codeOnly).toMatch(/fetch error: \$\{msg\.slice\(0, 200\)\}/);
    });

    it('real-fetch fetcher uses modePart inline for detail label (replaces skeleton void apiBase)', () => {
      // modePart = `[${mode}|${dependencyGroups}]` 必须在 fetcher body 内出现 (用于 detail 三段 error/timout/HTTP 分支)
      expect(src).toMatch(/const modePart = `\[\$\{mode\}\|\$\{dependencyGroups\}\]`;/);
      // 确认 void apiBase (skeleton 阶段) 已移除 — 真实 fetch 接入后, apiBase 必须实际被 fetch() 使用, 不再 void 抹平
      const voidApiBaseCount = src.split('void apiBase;').length - 1;
      expect(voidApiBaseCount).toBe(0);
    });

    it('9th fetcher real-fetch body uses basePayload via JSON.stringify (chain #19 closure round 2)', () => {
      // round 2 closure: basePayload 不再 void 抹平, 而是走 real fetch: `body: JSON.stringify(basePayload)`
      // (沿 8 项 v0.5 fetcher 同样模式). 错误路径 modelOutput 必须 echo request echo + 5-field decode:
      expect(src).toMatch(/body: JSON\.stringify\(basePayload\),[\s\S]{0,200}?signal: controller\.signal,/);
      // modelOutput 包含 spread data + request echo (replaces skeleton dry-run echo)
      expect(src).toMatch(/modelOutput: JSON\.stringify\(\{ \.\.\.data, request: basePayload \}\)\.slice\(0, 500\)/);
      // basePayload 声明 shape preserved verbatim
      expect(src).toContain('api_base: model.endpoint');
      expect(src).toContain("tasks: ['acpbench', 'math', 'gsm8k']");
      expect(src).toContain('dispatch_type: dispatchType');
      // anti-regression: void basePayload / void apiBase 都被移除 (skeleton 阶段抹平)
      const voidBaseCount = src.split('void basePayload;').length - 1;
      const voidApiBaseCount = src.split('void apiBase;').length - 1;
      expect(voidBaseCount).toBe(0);
      expect(voidApiBaseCount).toBe(0);
    });

    it('skip_tasks + report_yaml 摘要嵌入 detail (top-5 + ellipsis, 80 char truncate + ws-fold)', () => {
      // skip_tasks 摘要: top-5 + ellipsis
      expect(src).toContain('skipped=[');
      expect(src).toContain('skipArr.slice(0, 5)');
      expect(src).toContain("skipArr.length > 5 ? ',…' : ''");
      // report_yaml 摘要: 80 char 截断 + ws 折叠
      // report_yaml 摘要: 80 char 截断 + ws 折叠 (避免冗长 yaml 撑爆 detail 字段, 同时保留诊断信息)
      expect(src).toContain('yamlReport.slice(0, 80)');
      expect(src).toContain("replace(/\\s+/g, ' ')");
      // status (resolver_status) 嵌入 detail
      expect(src).toContain('status=${data.resolver_status}');
      // eval_id 嵌入 detail (与 8 项 v0.5 一致)
      expect(src).toContain('eval_id=${data.eval_id}');
    });

  });

  describe('wiring-prep chain #19 closure (9th dispatch site wired, 07-11 00:23 cron tick)', () => {
    // chain #19 wiring-prep 闭合: 9th dispatch site 已接入 run() 方法
    // (沿 e578634 9th fetcher skeleton + a444d46 9-key DEFAULT_DISPATCH_TYPE/DEFAULT_LOG_FORMAT + ca4c33f test ceiling 11→12 closure +
    //  2c140a8 9-key interface type field parity). 8/8 → 9/9 real fetch dispatch sites 全部走 dispatchExternalCall 3-arg shorthand.

    it('run() method calls dispatchExternalCall for lm_eval_task_conflict_resolver (9th site wired)', () => {
      // chain #19 closure: 9th site 必须在 long_context_cluster 之后接入
      // 必须含 await this.dispatchExternalCall(... 'lm_eval_task_conflict_resolver' ...)
      const runMatch = src.match(/async run\(\)[\s\S]*?await this\.dispatchExternalCall\(\s*\n\s*results, 'long_context_cluster',[\s\S]*?lm_eval_task_conflict_resolver[\s\S]*?\}\);/);
      expect(runMatch).not.toBeNull();
      const lastDispatch = runMatch![0];
      expect(lastDispatch).toMatch(/'lm_eval_task_conflict_resolver'/);
    });

    it('9th dispatch site uses fetchLmEvalTaskConflictResolverScore fetcher (closure parity)', () => {
      // 9th site 闭包必须调 fetchLmEvalTaskConflictResolverScore (沿 8 项 v0.5 fetcher closure 模式)
      expect(src).toMatch(/await this\.dispatchExternalCall\([\s\S]*?'lm_eval_task_conflict_resolver',[\s\S]*?this\.fetchLmEvalTaskConflictResolverScore\(/);
    });

    it('union types in dispatchExternalCall + dispatchExternalBenchmark extended to 9-key (lm_eval_task_conflict_resolver added)', () => {
      // 9-key union: 8 v0.5 + 1 v0.6 lm_eval_task_conflict_resolver
      const unionMatch = src.match(/benchmarkName: 'webdev_arena' \| 'cyberseceval3' \| 'aa_omniscience' \| 'terminal_bench' \| 'benchlm_agentic' \| 'swe_bench_pro' \| 'process_aware_scoring' \| 'long_context_cluster' \| 'lm_eval_task_conflict_resolver'/);
      expect(unionMatch).not.toBeNull();
      // 验证 union 含 9 个 member (含 lm_eval_task_conflict_resolver)
      const unionBody = unionMatch![0];
      expect(unionBody.split('|').length).toBe(9);
    });

    it('9th site 闭包透传 anchorScore + mode + dependencyGroups 3 字段 (沿 8 项 v0.5 fetcher 模式)', () => {
      // 9th site fetcher 闭包必须读 cfg.lm_eval_task_conflict_resolver.anchor_score + mode + dependency_groups (skeleton 阶段 mode=dry_run, dependency_groups=all)
      expect(src).toMatch(/this\.config\._external_benchmarks_roadmap!\.lm_eval_task_conflict_resolver!\.anchor_score/);
      expect(src).toMatch(/\.lm_eval_task_conflict_resolver!\.mode \?\? 'dry_run'/);
      expect(src).toMatch(/\.lm_eval_task_conflict_resolver!\.dependency_groups \?\? 'all'/);
    });

    it('9 dispatch sites total: 8 v0.5 + 1 v0.6 (lm_eval_task_conflict_resolver, full 9-key chain #19 closure)', () => {
      // run() 方法内 await this.dispatchExternalCall 总数 = 9 (8 + 1)
      // 用 name (单引号 string literal 形式) 计数
      const matches = src.match(/await this\.dispatchExternalCall\(\s*\n\s*results, '([^']+)'/g);
      expect(matches).not.toBeNull();
      expect(matches!.length).toBe(9);
      // 第 9 个必须是 lm_eval_task_conflict_resolver
      expect(matches![8]).toContain("'lm_eval_task_conflict_resolver'");
    });

    it('8-key union regression gate (rejects accidental 8-key rollback)', () => {
      // 如未来误删 union 中 'lm_eval_task_conflict_resolver', 这个正则会失败
      const unionMatch = src.match(/benchmarkName: 'webdev_arena' \| 'cyberseceval3' \| 'aa_omniscience' \| 'terminal_bench' \| 'benchlm_agentic' \| 'swe_bench_pro' \| 'process_aware_scoring' \| 'long_context_cluster' \| 'lm_eval_task_conflict_resolver'/);
      expect(unionMatch).not.toBeNull();
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

  describe('9th fetcher ExternalDispatchType type field parity (07-10 22:03 cron tick closure)', () => {
    // 钉住 9/9 dispatch type 字段完整 (含 9th fetcher lm_eval_task_conflict_resolver e578634)
    // 沿 06-30 06:13 cron 8/8 parity 模式 — 9th entry 漏更 closure, parallels 5 字段补齐 (process_aware_scoring / swe_bench_pro / terminal_bench / benchlm_agentic / long_context_cluster)
    const typesSrc = fs.readFileSync(TYPES_PATH, 'utf-8');

    it('lm_eval_task_conflict_resolver interface declares type?: ExternalDispatchType (9th entry parity)', () => {
      // 9-key interface entry 含 type 字段 (沿 webdev_arena / terminal_bench / aa_omniscience / benchlm_agentic / cyberseceval3 / swe_bench_pro / long_context_cluster / process_aware_scoring 8 项同模式)
      // 必须严格匹配 interface field declaration `lm_eval_task_conflict_resolver?: {` (而非 JSDoc 注释里的引用)
      expect(typesSrc).toMatch(/lm_eval_task_conflict_resolver\?: \{\s*enabled: boolean;[\s\S]{0,800}?type\?: ExternalDispatchType;/);
    });

    it('rejects stale 9-key without type field (e578634 era was missing type)', () => {
      // 9-key type 字段缺失检测: 9th entry 仅有 enabled + api_base + tasks + mode + dependency_groups + anchor_score + timeout_ms 时, 应失败
      // 8-key 旧版特征: lm_eval_task_conflict_resolver interface entry 不含 type?: ExternalDispatchType
      const lmEvalBlockMatch = typesSrc.match(/lm_eval_task_conflict_resolver\?: \{([\s\S]*?)\n  \};/);
      expect(lmEvalBlockMatch).not.toBeNull();
      const blockBody = lmEvalBlockMatch![1];
      expect(blockBody).toContain('type?: ExternalDispatchType');
    });

    it('9-key interface ordering parity (lm_eval_task_conflict_resolver 9th entry, after long_context_cluster cluster段)', () => {
      // 顺序锁定: lm_eval_task_conflict_resolver interface entry 必须在 long_context_cluster cluster 段之后
      // (与 e578634 step-v6.0-13 立 chain #19 wiring-prep plan 一致 — 9-key interface 顺序与 9-key DEFAULT_API_BASE 顺序同步)
      const lmEvalIdx = typesSrc.indexOf('lm_eval_task_conflict_resolver?:');
      const longContextClusterIdx = typesSrc.lastIndexOf('long_context_cluster?:');
      expect(lmEvalIdx).toBeGreaterThan(longContextClusterIdx);
    });
  });
});
