// tests/evaluator-fetch-cyberseceval3-score.test.ts
// 钉住 src/core/evaluator.ts v0.5.0 dispatch: cyberseceval3 真实 fetch
// (06-14 22:23 cron, 沿 06-15 00:03 aa_omniscience 模式 + 06-14 03:23 webdev_arena
// 6-gate pattern) 的 runtime 行为:
// POST {api_base} body={api_base, model_id, risk_categories, timeout_ms}
// 解析 {safety_score?: number (0-100); coverage_rate?: number (0-1); eval_id?: string; error?: string}
// 三段 try/catch: timeout / 4xx / 5xx
// 返回 QuestionScore: dimension=`safety` (v0.4.0 默认, cyberseceval3 属安全评测)
// score = safety_score * 0.7 + coverage_rate * 30 (clamp [0, 100], 1 decimal rounded)
// detail = "cyberseceval3 safety=<s>, coverage=<c*100>%, score=<n>, risks=<riskCategories>" + 可选 ", eval_id=<id>"
// WebDevArena/AA Omniscience 都有 anchor drift suffix; cyberseceval3 **无 anchor drift 检测**
// (config 上 anchor_score 字段未透到 fetcher, 06-14 22:23 cron 故意忽略)。
//
// fetchCyberseceval3Score 在 src/core/evaluator.ts L512-585 (private async),
// 之前 0 直接 runtime 单测, 仅 evaluator-v050-dispatch-return-injection.test.ts /
// evaluator-v050-dispatch-type-wiring.test.ts 等 closure 静态断言。
// 一旦 fetch + parse + 0-100 归一 + risk_categories 透传 + error 分支任一回归,
// 之前会 silently 走 0 分兜底; 现在 8 cases 钉死所有 path。
//
// parallels woclaw c7bf0a6 openai_provider 8-case + 37f32db aa_omniscience 8-case
// + 761c00b lm_eval_task_conflict_resolver 8-case + 26a83ef fetchWebdevArenaScore 8-case pattern。

import { Evaluator } from '../src/core/evaluator';
import { LLMAdapter } from '../src/adapters/adapter';
import { BenchmarkConfig, ModelConfig } from '../src/types';

interface FetchCyberseceval3Signature {
  fetchCyberseceval3Score: (
    apiBase: string,
    modelConfig: ModelConfig,
    timeoutMs: number,
    riskCategories: string,
  ) => Promise<{
    questionId: string;
    category: string;
    score: number;
    dimension: string;
    modelOutput: string;
    detail?: string;
  }>;
}

describe('fetchCyberseceval3Score runtime coverage (v0.5.0 dispatch, 06-14 22:23 cron)', () => {
  const model: ModelConfig = {
    name: 'cyberseceval3-test-model',
    endpoint: 'https://model.invalid/v1',
    apiKey: '***',
    type: 'openai',
    model: 'gpt-4o-mini',
  };

  const config: BenchmarkConfig = {
    models: [model],
    benchmarks: { dialogue: false, coding: false },
  };

  const adapter = {} as LLMAdapter;
  const originalFetch = global.fetch;

  // 与 tests/evaluator-lm-eval-timer-cleanup.test.ts 同模式:
  // fetchCyberseceval3Score 是 Evaluator private method,
  // 通过 (evaluator as unknown as FetchCyberseceval3Signature) 暴露。
  const invoke = async (
    apiBase: string,
    m: ModelConfig,
    timeoutMs: number,
    riskCategories: string,
  ) => {
    const evaluator = new Evaluator(config, adapter) as unknown as FetchCyberseceval3Signature;
    return evaluator.fetchCyberseceval3Score(apiBase, m, timeoutMs, riskCategories);
  };

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // Case 1: happy path — 真实 fetch 成功 + parse 正常 + 0-100 归一正确
  it('happy path: valid {safety_score, coverage_rate, eval_id} -> score = safety*0.7 + coverage*30 rounded', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ safety_score: 80, coverage_rate: 0.5, eval_id: 'cse3-eval-67890' }),
    }) as typeof fetch;

    const result = await invoke('https://cse3.invalid/v1', model, 30000, 'all-8');

    expect(result.questionId).toBe('cyberseceval3_cyberseceval3-test-model');
    expect(result.category).toBe('cyberseceval3');
    expect(result.dimension).toBe('safety');
    // 80 * 0.7 + 0.5 * 30 = 56 + 15 = 71
    expect(result.score).toBe(71);
    expect(result.detail).toContain('safety=80.0');
    expect(result.detail).toContain('coverage=50.0%');
    expect(result.detail).toContain('eval_id=cse3-eval-67890');
    expect(result.detail).toContain('risks=all-8');
    expect(result.modelOutput).toContain('cse3-eval-67890');
  });

  // Case 2: 请求 shape 验证 — POST /application/json + basePayload (api_base/model_id/risk_categories/timeout_ms)
  it('request shape: POST {Content-Type: application/json} with {api_base, model_id, risk_categories, timeout_ms} body', async () => {
    let capturedUrl: string | undefined;
    let capturedInit: RequestInit | undefined;
    global.fetch = jest.fn().mockImplementation((url: any, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedInit = init;
      return Promise.resolve({
        ok: true,
        json: async () => ({ safety_score: 50, coverage_rate: 0.3 }),
      });
    }) as typeof fetch;

    await invoke('https://cse3.invalid/v1', model, 15000, 'automated_social_engineering,manual_offensive_cyber');

    expect(capturedUrl).toBe('https://cse3.invalid/v1');
    expect(capturedInit?.method).toBe('POST');
    const headers = capturedInit?.headers as Record<string, string> | undefined;
    expect(headers?.['Content-Type']).toBe('application/json');
    const body = JSON.parse(String(capturedInit?.body));
    expect(body).toEqual({
      api_base: 'https://model.invalid/v1',
      model_id: 'gpt-4o-mini', // 优先 model.model
      risk_categories: 'automated_social_engineering,manual_offensive_cyber',
      timeout_ms: 15000,
    });
  });

  // Case 3: model.model 缺省回退到 model.name (model_id routing)
  it('request shape: when model.model is absent, model_id falls back to model.name', async () => {
    const modelNoName: ModelConfig = {
      name: 'cse3-fallback-name',
      endpoint: 'https://model.invalid/v1',
      apiKey: '***',
      type: 'openai',
      // model 字段缺省
    };

    let capturedInit: RequestInit | undefined;
    global.fetch = jest.fn().mockImplementation((_url: any, init?: RequestInit) => {
      capturedInit = init;
      return Promise.resolve({
        ok: true,
        json: async () => ({ safety_score: 50, coverage_rate: 0.3 }),
      });
    }) as typeof fetch;

    await invoke('https://cse3.invalid/v1', modelNoName, 15000, 'all-8');

    const body = JSON.parse(String(capturedInit?.body));
    expect(body.model_id).toBe('cse3-fallback-name'); // fallback path
  });

  // Case 4: clamp 0 下限 — safety_score=0, coverage_rate=0 -> score=0 (lower bound)
  it('clamp lower: safety=0, coverage=0 -> score=0 (clamped to 0)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ safety_score: 0, coverage_rate: 0 }),
    }) as typeof fetch;

    const result = await invoke('https://cse3.invalid/v1', model, 30000, 'all-8');

    // 0 * 0.7 + 0 * 30 = 0
    expect(result.score).toBe(0);
    expect(result.detail).toContain('safety=0.0');
    expect(result.detail).toContain('coverage=0.0%');
  });

  // Case 5: clamp 100 上限 — safety_score=100, coverage_rate=1 -> score=100 (upper bound clamp)
  it('clamp upper: safety=100, coverage=1 -> score=100 (clamped to [0,100])', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ safety_score: 100, coverage_rate: 1 }),
    }) as typeof fetch;

    const result = await invoke('https://cse3.invalid/v1', model, 30000, 'all-8');

    // 100 * 0.7 + 1 * 30 = 100 (clamped to upper bound)
    expect(result.score).toBe(100);
    expect(result.detail).toContain('safety=100.0');
    expect(result.detail).toContain('coverage=100.0%');
  });

  // Case 6: API 返回 {error: "..."} 字段 — score:0, detail 含 "API error"
  it('API error field: {error: "model_not_authorized"} -> score 0, detail contains "API error"', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ error: 'model_not_authorized' }),
    }) as typeof fetch;

    const result = await invoke('https://cse3.invalid/v1', model, 30000, 'all-8');

    expect(result.score).toBe(0);
    expect(result.detail).toBe('cyberseceval3 API error: model_not_authorized');
  });

  // Case 7: HTTP 500 — score:0, detail 以 "cyberseceval3 HTTP 500:" 开头
  it('HTTP 500: score 0, detail starts with "cyberseceval3 HTTP 500:"', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'internal server error',
    }) as typeof fetch;

    const result = await invoke('https://cse3.invalid/v1', model, 30000, 'all-8');

    expect(result.score).toBe(0);
    expect(result.detail).toMatch(/^cyberseceval3 HTTP 500: /);
    expect(result.detail).toContain('internal server error');
  });

  // Case 8: fetch rejects (timeout abort) — score:0, detail 含 "timeout after"
  it('fetch rejection (abort/timeout): score 0, detail contains "timeout after <ms>ms"', async () => {
    const abortError = new Error('The operation was aborted');
    global.fetch = jest.fn().mockRejectedValue(abortError) as typeof fetch;

    const result = await invoke('https://cse3.invalid/v1', model, 5000, 'all-8');

    expect(result.score).toBe(0);
    // errorMessage(err) for Error('The operation was aborted') -> msg.toLowerCase() contains 'abort'
    // isTimeout branch -> "cyberseceval3 timeout after 5000ms"
    expect(result.detail).toBe('cyberseceval3 timeout after 5000ms');
  });

  // Case 9: HTTP 503 non-OK - score:0, detail 以 "cyberseceval3 HTTP 503:" 开头
  // 沿 7 sibling fetcher (webdev_arena / terminal_bench / swe_bench_pro / process_aware_scoring /
  // long_context_cluster / aa_omniscience / benchlm_agentic) 同模式 HTTP error path coverage,
  // 补齐 chain #20 fetcher error-branch parity (此前 06-14 22:23 cron 仅覆盖 4xx 500 路径).
  it('HTTP 503: score 0, detail starts with "cyberseceval3 HTTP 503:"', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'service unavailable',
    }) as typeof fetch;

    const result = await invoke('https://cse3.invalid/v1', model, 30000, 'all-8');

    expect(result.score).toBe(0);
    expect(result.dimension).toBe('safety');
    expect(result.modelOutput).toBe('');
    expect(result.detail).toMatch(/^cyberseceval3 HTTP 503: /);
    expect(result.detail).toContain('service unavailable');
  });

  // Case 10: fetch rejects (network down) - score:0, detail 含 "fetch error: network down"
  // catch 块走 buildFetcherErrorDetail('cyberseceval3', '', timeoutMs, err) helper,
  // 非 abort/timeout 路径 -> "<category> fetch error: <msg>"
  it('fetch rejection (network down): score 0, detail contains "fetch error: network down"', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as typeof fetch;

    const result = await invoke('https://cse3.invalid/v1', model, 30000, 'all-8');

    expect(result.score).toBe(0);
    expect(result.dimension).toBe('safety');
    expect(result.modelOutput).toBe('');
    expect(result.detail).toContain('fetch error: network down');
  });
});