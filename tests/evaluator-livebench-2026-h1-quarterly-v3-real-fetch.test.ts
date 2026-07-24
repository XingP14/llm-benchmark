// tests/evaluator-livebench-2026-h1-quarterly-v3-real-fetch.test.ts
// 钉住 src/core/evaluator.ts v0.6 chain #20 step 1: livebench_2026_h1_quarterly_v3
// 10th fetcher 的真实 fetch + parse + task/refresh_cadence/contamination_check 摘要 + category_scores 摘要的
// runtime 行为 (沿 fetchLmEvalTaskConflictResolverScore 模式 + fetchLongContextClusterScore 6-gate pattern).
//
// POST {api_base} body={api_base, model_id, task, refresh_cadence, contamination_check, timeout_ms, dispatch_type}
// 解析 {livebench_score: number; category_scores: Record<string, number>; refresh_date: string;
//       eval_model: string; contamination_status: string; error?: string}
// 三段 try/catch: timeout / 4xx / 5xx
// 归一: livebench_score 0-100 (已是百分制, clamp [0, 100])
// category_scores top-3 + ellipsis, refresh_date + contamination_status + eval_model 摘要嵌入 detail.
//
// fetchLiveBench2026H1QuarterlyV3Score 在 src/core/evaluator.ts L1435-1542 (private async),
// 之前 0 直接 runtime 单测. 一旦 fetch + parse + 0-100 归一 + 摘要 +
// error 分支任一回归, 之前会 silently 走 0 分兜底;
// 现在 10 cases 钉死所有 path (含 timeout 走 abort 后 detail 区分 timeout/fetch error
// + 单独 catch 块非 abort/timeout 路径), chain #20 fetcher error-branch parity
// 闭合 (parallels 9-key fetchers 同模式 HTTP 503 + 单独 fetch rejection 双 case 覆盖).

import { Evaluator } from '../src/core/evaluator';
import { LLMAdapter } from '../src/adapters/adapter';
import { BenchmarkConfig, ModelConfig } from '../src/types';

interface FetchLiveBenchSignature {
  fetchLiveBench2026H1QuarterlyV3Score: (
    apiBase: string,
    modelConfig: ModelConfig,
    timeoutMs: number,
    anchorScore?: number,
    task?: string,
    refreshCadence?: string,
    contaminationCheck?: string,
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

describe('fetchLiveBench2026H1QuarterlyV3Score runtime coverage (v0.6 chain #20 step 1, 07-25 03:24 cron)', () => {
  const model: ModelConfig = {
    name: 'livebench-test-model',
    endpoint: 'https://model.invalid/v1',
    apiKey: 'sk-fake-test-key',
    type: 'openai',
    model: 'gpt-4o-mini',
  };

  const config: BenchmarkConfig = {
    models: [model],
    benchmarks: { dialogue: false, coding: false },
  };

  const adapter = {} as unknown as LLMAdapter;
  const originalFetch = global.fetch;

  const invoke = async (
    apiBase: string,
    m: ModelConfig,
    timeoutMs: number,
    anchorScore?: number,
    task?: string,
    refreshCadence?: string,
    contaminationCheck?: string,
    dispatchType?: string,
  ) => {
    const evaluator = new Evaluator(config, adapter) as unknown as FetchLiveBenchSignature;
    return evaluator.fetchLiveBench2026H1QuarterlyV3Score(
      apiBase, m, timeoutMs, anchorScore, task, refreshCadence, contaminationCheck, dispatchType,
    );
  };

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // Case 1: happy path — livebench_score=88.67 → score=88.7 (rounded to 1dp), detail 含 taskPart + cats + date + contam
  it('happy path: livebench_score 88.67 -> score 88.7, detail has [task|cadence|contam], cats top-3, date, contam', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        livebench_score: 88.67,
        category_scores: { coding: 90.1, math: 85.3, reasoning: 82.7 },
        refresh_date: '2026-06-09',
        eval_model: 'gpt-5.5-thinking-xhigh',
        contamination_status: 'clean',
      }),
    });
    const r = await invoke('https://api.livebench.ai/v1/refresh/v3', model, 30000);
    expect(r.questionId).toBe('livebench_2026_h1_quarterly_v3_livebench-test-model');
    expect(r.category).toBe('livebench_2026_h1_quarterly_v3');
    expect(r.score).toBe(88.7);
    expect(r.dimension).toBe('coding');
    expect(r.detail).toContain('[all|quarterly_3_5_month|enabled]');
    expect(r.detail).toContain('score=88.7');
    expect(r.detail).toContain('coding=90.1');
    expect(r.detail).toContain('date=2026-06-09');
    expect(r.detail).toContain('contam=clean');
    expect(r.detail).toContain('eval=gpt-5.5-thinking-xhigh');
  });

  // Case 2: partial_skip with 4 category_scores (top-3 + ellipsis)
  it('category_scores 4 entries -> top-3 + ellipsis marker', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        livebench_score: 79.38,
        category_scores: { coding: 80, math: 75, reasoning: 78, safety: 82 },
        refresh_date: '2026-06-09',
        eval_model: 'kimi-k2.6-thinking',
        contamination_status: 'clean',
      }),
    });
    const r = await invoke('https://api.livebench.ai/v1/refresh/v3', model, 30000);
    expect(r.score).toBe(79.4);
    expect(r.detail).toContain('cats=[');
    expect(r.detail).toContain('coding=80');
    expect(r.detail).toContain('math=75');
    expect(r.detail).toContain('reasoning=78');
    expect(r.detail).toContain('…');
  });

  // Case 3: API error path → score=0, detail 含 "API error:"
  it('API error path: score 0, detail has "API error:"', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ error: 'contamination_detected: refresh rejected' }),
    });
    const r = await invoke('https://api.livebench.ai/v1/refresh/v3', model, 30000);
    expect(r.score).toBe(0);
    expect(r.detail).toContain('livebench_2026_h1_quarterly_v3');
    expect(r.detail).toContain('API error: contamination_detected: refresh rejected');
  });

  // Case 4: HTTP 503 → score=0, detail 含 HTTP 503
  it('HTTP 503: score 0, detail has HTTP 503', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'Service Unavailable',
    });
    const r = await invoke('https://api.livebench.ai/v1/refresh/v3', model, 30000);
    expect(r.score).toBe(0);
    expect(r.detail).toContain('HTTP 503');
  });

  // Case 5: HTTP 429 rate-limit → score=0, detail 含 HTTP 429
  it('HTTP 429: score 0, detail has HTTP 429', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'Rate limited',
    });
    const r = await invoke('https://api.livebench.ai/v1/refresh/v3', model, 30000);
    expect(r.score).toBe(0);
    expect(r.detail).toContain('HTTP 429');
  });

  // Case 6: timeout via AbortController → score=0, detail 含 "timeout"
  it('timeout via abort: score 0, detail has "timeout"', async () => {
    global.fetch = jest.fn().mockImplementation(() =>
      new Promise((_, reject) => {
        const err = new Error('Aborted');
        err.name = 'AbortError';
        reject(err);
      }),
    );
    const r = await invoke('https://api.livebench.ai/v1/refresh/v3', model, 50);
    expect(r.score).toBe(0);
    expect(r.detail).toContain('timeout');
  });

  // Case 7: anchor mismatch warning (|score - anchor| > 5)
  it('anchor mismatch: detail has "anchor ⚠️ 80" when anchor=80 and score=88.7', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        livebench_score: 88.67,
        category_scores: {},
        refresh_date: '2026-06-09',
        eval_model: 'gpt-5.5',
        contamination_status: 'clean',
      }),
    });
    const r = await invoke('https://api.livebench.ai/v1/refresh/v3', model, 30000, 80);
    expect(r.score).toBe(88.7);
    expect(r.detail).toContain('anchor ⚠️ 80');
  });

  // Case 8: clamp over 100 → 100
  it('clamp >100: score capped at 100', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        livebench_score: 150,
        category_scores: {},
        refresh_date: '2026-06-09',
        eval_model: 'test',
        contamination_status: 'clean',
      }),
    });
    const r = await invoke('https://api.livebench.ai/v1/refresh/v3', model, 30000);
    expect(r.score).toBe(100);
  });

  // Case 9: clamp negative → 0
  it('clamp negative: score floored at 0', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        livebench_score: -10,
        category_scores: {},
        refresh_date: '2026-06-09',
        eval_model: 'test',
        contamination_status: 'clean',
      }),
    });
    const r = await invoke('https://api.livebench.ai/v1/refresh/v3', model, 30000);
    expect(r.score).toBe(0);
  });

  // Case 10: custom task/refresh_cadence/contamination_check → detail 含自定义值
  it('custom task/cadence/contam: detail has custom values', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        livebench_score: 85.5,
        category_scores: {},
        refresh_date: '2026-06-09',
        eval_model: 'test',
        contamination_status: 'enabled',
      }),
    });
    const r = await invoke('https://api.livebench.ai/v1/refresh/v3', model, 30000, undefined, 'math_comp', 'monthly', 'enabled');
    expect(r.detail).toContain('[math_comp|monthly|enabled]');
  });
});
