// tests/evaluator-fetch-lm-eval-task-conflict-resolver-score.test.ts
// 钉住 src/core/evaluator.ts v0.6 chain #19 step 2: lm_eval_task_conflict_resolver
// 9th fetcher 的真实 fetch + parse + 3-mode switch + skip_tasks/report_yaml 摘要的
// runtime 行为 (沿 06-15 00:03 cron aa_omniscience 模式 + 06-12 06:03 cron
// webdev_arena 6-gate pattern).
//
// POST {api_base} body={api_base, model_id, tasks, mode, dependency_groups, timeout_ms, dispatch_type}
// 解析 {conflicts_detected: number; resolver_status: 'clean'|'partial_skip'|'fail';
//       skip_tasks: string[]; report_yaml: string; eval_id?: string; error?: string}
// 三段 try/catch: timeout / 4xx / 5xx
// 归一: clean/0-conflicts → 100; partial_skip/fail → 100 - conflicts*5 (clamp [0, 100])
// mode 透传 (dry_run / auto_resolve / report_only) — `[mode|dependencyGroups]` 嵌入 detail
// skip_tasks top-5 + ellipsis, report_yaml 80 char 截断 + ws 折叠.
//
// fetchLmEvalTaskConflictResolverScore 在 src/core/evaluator.ts L1323-1423 (private async),
// 之前 0 直接 runtime 单测, 仅 evaluator-lm-eval-task-conflict-resolver-skeleton.test.ts
// 静态 import + closure shape 断言 + evaluator-lm-eval-timer-cleanup.test.ts 1-case
// timer cleanup. 一旦 fetch + parse + 0-100 归一 + skip_tasks/report_yaml 摘要 +
// mode 透传 + error 分支任一回归, 之前会 silently 走 0 分兜底;
// 现在 8 cases 钉死所有 path (含 timeout 走 abort 后 detail 区分 timeout/fetch error).
//
// parallels woclaw c7bf0a6 openai_provider 8-case + 37f32db aa_omniscience 8-case pattern.

import { Evaluator } from '../src/core/evaluator';
import { LLMAdapter } from '../src/adapters/adapter';
import { BenchmarkConfig, ModelConfig } from '../src/types';

interface FetchLmEvalTaskConflictResolverSignature {
  fetchLmEvalTaskConflictResolverScore: (
    apiBase: string,
    modelConfig: ModelConfig,
    timeoutMs: number,
    anchorScore?: number,
    mode?: string,
    dependencyGroups?: string,
    dispatchType?: string,
  ) => Promise<{
    questionId: string;
    category: string;
    score: number;
    dimension: string;
    modelOutput: string;
    detail?: string;
    dispatchType?: string;
  }>;
}

describe('fetchLmEvalTaskConflictResolverScore runtime coverage (v0.6 chain #19 step 2, 07-13 22:27 cron)', () => {
  const model: ModelConfig = {
    name: 'lm-eval-conflict-resolver-test-model',
    endpoint: 'https://model.invalid/v1',
    apiKey: 'test-dummy-key',
    type: 'openai',
    model: 'gpt-4o-mini',
  };

  const config: BenchmarkConfig = {
    models: [model],
    benchmarks: { dialogue: false, coding: false },
  };

  const adapter = {} as LLMAdapter;
  const originalFetch = global.fetch;

  // 与 tests/evaluator-fetch-aa-omniscience-score.test.ts 同模式:
  // fetchLmEvalTaskConflictResolverScore 是 Evaluator private method,
  // 通过 (evaluator as unknown as FetchLmEvalTaskConflictResolverSignature) 暴露。
  const invoke = async (
    apiBase: string,
    m: ModelConfig,
    timeoutMs: number,
    anchorScore?: number,
    mode?: string,
    dependencyGroups?: string,
    dispatchType?: string,
  ) => {
    const evaluator = new Evaluator(config, adapter) as unknown as FetchLmEvalTaskConflictResolverSignature;
    return evaluator.fetchLmEvalTaskConflictResolverScore(
      apiBase, m, timeoutMs, anchorScore, mode, dependencyGroups, dispatchType,
    );
  };

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // Case 1: happy path — clean/0-conflicts → score=100, detail 含 modePart + status + eval_id
  it('happy path: clean/0-conflicts -> score 100, detail has [mode|deps], status=clean, eval_id', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        conflicts_detected: 0,
        resolver_status: 'clean',
        skip_tasks: [],
        report_yaml: 'all_clean: true',
        eval_id: 'lm-eval-cr-98765',
      }),
    }) as typeof fetch;

    const result = await invoke(
      'https://resolver.invalid/v1', model, 30000, undefined,
      'dry_run', 'all', 'agentic_coding',
    );

    expect(result.questionId).toBe('lm_eval_task_conflict_resolver_lm-eval-conflict-resolver-test-model');
    expect(result.category).toBe('lm_eval_task_conflict_resolver');
    expect(result.dimension).toBe('coding');
    expect(result.score).toBe(100); // 100 - 0*5 = 100
    expect(result.dispatchType).toBe('agentic_coding');
    expect(result.detail).toContain('[dry_run|all]');
    expect(result.detail).toContain('score=100.0');
    expect(result.detail).toContain('conflicts=0');
    expect(result.detail).toContain('status=clean');
    expect(result.detail).toContain('eval_id=lm-eval-cr-98765');
    expect(result.modelOutput).toContain('lm-eval-cr-98765');
  });

  // Case 2: 请求 shape 验证 — POST application/json + basePayload
  // (api_base/model_id/tasks/mode/dependency_groups/timeout_ms/dispatch_type)
  it('request shape: POST {Content-Type: application/json} with full basePayload (api_base/model_id/tasks/mode/dependency_groups/timeout_ms/dispatch_type)', async () => {
    let capturedUrl: string | undefined;
    let capturedInit: RequestInit | undefined;
    global.fetch = jest.fn().mockImplementation((url: any, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedInit = init;
      return Promise.resolve({
        ok: true,
        json: async () => ({ conflicts_detected: 0, resolver_status: 'clean', skip_tasks: [], report_yaml: '' }),
      });
    }) as typeof fetch;

    await invoke(
      'https://resolver.invalid/v1', model, 15000, undefined,
      'auto_resolve', 'numpy,torch', 'agentic_coding',
    );

    expect(capturedUrl).toBe('https://resolver.invalid/v1');
    expect(capturedInit?.method).toBe('POST');
    const headers = capturedInit?.headers as Record<string, string> | undefined;
    expect(headers?.['Content-Type']).toBe('application/json');
    const body = JSON.parse(String(capturedInit?.body));
    expect(body).toEqual({
      api_base: 'https://model.invalid/v1',
      model_id: 'gpt-4o-mini',
      tasks: ['acpbench', 'math', 'gsm8k'],
      mode: 'auto_resolve',
      dependency_groups: 'numpy,torch',
      timeout_ms: 15000,
      dispatch_type: 'agentic_coding',
    });
  });

  // Case 3: partial_skip + skip_tasks top-5 + ellipsis — detail 含 `skipped=[a,b,c,d,e,…]`
  it('partial_skip with 7 skip_tasks: detail contains "skipped=[t1,t2,t3,t4,t5,…]" (top-5 + ellipsis)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        conflicts_detected: 3,
        resolver_status: 'partial_skip',
        skip_tasks: ['task-1', 'task-2', 'task-3', 'task-4', 'task-5', 'task-6', 'task-7'],
        report_yaml: 'partial\n  skip: t1-t7',
        eval_id: 'lm-eval-cr-11111',
      }),
    }) as typeof fetch;

    const result = await invoke(
      'https://resolver.invalid/v1', model, 30000, undefined,
      'dry_run', 'all',
    );

    // 100 - 3*5 = 85
    expect(result.score).toBe(85);
    expect(result.detail).toContain('status=partial_skip');
    expect(result.detail).toContain('skipped=[task-1,task-2,task-3,task-4,task-5,…]');
    expect(result.detail).toContain('yaml=partial skip: t1-t7'); // ws folded
    expect(result.detail).toContain('eval_id=lm-eval-cr-11111');
  });

  // Case 4: report_yaml 80 char 截断 + ws 折叠 — 长 yaml 摘要截断 + 多 whitespace 单空格化
  it('report_yaml 80-char truncation + whitespace folding: long yaml -> detail "yaml=<80char-ws-folded>"', async () => {
    const longYaml = 'a'.repeat(50) + '   ' + 'b'.repeat(50); // 50 + 3 ws + 50 = 103 chars
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        conflicts_detected: 0,
        resolver_status: 'clean',
        skip_tasks: [],
        report_yaml: longYaml,
      }),
    }) as typeof fetch;

    const result = await invoke('https://resolver.invalid/v1', model, 30000);

    // 80-char truncation + ws folding: 50 'a' + '   ' (3 ws) + 50 'b' = 103 chars
    // slice(0, 80) first: 50 'a' + '   ' + 27 'b' = 80 chars (truncates 23 'b')
    // then ws-fold on the 80-char slice: '   ' -> ' ' -> 50a + ' ' + 27b = 78 chars
    expect(result.detail).toContain('yaml=' + 'a'.repeat(50) + ' ' + 'b'.repeat(27));
    expect(result.detail).not.toContain('b'.repeat(28)); // 28th 'b' truncated
  });

  // Case 5: anchorScore 在 ±5 内 — 无 anchor warning, detail 不含 anchor suffix
  it('anchor within ±5: no anchor warning, detail does not contain anchor suffix', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ conflicts_detected: 0, resolver_status: 'clean', skip_tasks: [], report_yaml: '' }),
    }) as typeof fetch;

    const result = await invoke(
      'https://resolver.invalid/v1', model, 30000, 102, // ±5 内 (100±5)
      'dry_run', 'all',
    );

    expect(result.score).toBe(100);
    expect(result.detail).not.toContain('anchor');
  });

  // Case 6: anchorScore 偏离 >5 — detail 附加 anchor warning suffix (score=100 vs anchor=80 → drift 20)
  it('anchor drift >5: detail contains "(anchor ⚠️ 80)" suffix', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ conflicts_detected: 0, resolver_status: 'clean', skip_tasks: [], report_yaml: '' }),
    }) as typeof fetch;

    const result = await invoke(
      'https://resolver.invalid/v1', model, 30000, 80, // drift 20 > 5
      'dry_run', 'all',
    );

    expect(result.score).toBe(100);
    expect(result.detail).toContain('(anchor ⚠️ 80)');
  });

  // Case 7: API 返回 {error: "..."} 字段 — score:0, detail 含 "API error: ..."
  it('API error field: {error: "resolver_unavailable"} -> score 0, detail contains "API error: resolver_unavailable"', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ error: 'resolver_unavailable' }),
    }) as typeof fetch;

    const result = await invoke('https://resolver.invalid/v1', model, 30000);

    expect(result.score).toBe(0);
    expect(result.detail).toBe('lm_eval_task_conflict_resolver[dry_run|all] API error: resolver_unavailable');
  });

  // Case 8: HTTP 500 — score:0, detail 以 "lm_eval_task_conflict_resolver[dry_run|all] HTTP 500: " 开头
  it('HTTP 500: score 0, detail starts with "lm_eval_task_conflict_resolver[dry_run|all] HTTP 500: "', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'resolver backend down',
    }) as typeof fetch;

    const result = await invoke('https://resolver.invalid/v1', model, 30000);

    expect(result.score).toBe(0);
    expect(result.detail).toMatch(/^lm_eval_task_conflict_resolver\[dry_run\|all\] HTTP 500: /);
    expect(result.detail).toContain('resolver backend down');
  });
});