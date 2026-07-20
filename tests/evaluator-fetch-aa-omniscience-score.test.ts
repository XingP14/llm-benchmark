// tests/evaluator-fetch-aa-omniscience-score.test.ts
// 钉住 src/core/evaluator.ts v0.5.0 dispatch: aa_omniscience 真实 fetch
// (06-15 00:03 cron, 沿 06-14 03:23 webdev_arena 模式) 的 runtime 行为:
// POST {api_base} body={api_base, model_id, timeout_ms}
// 解析 {accuracy_score: number (0-100), hallucination_rate: number (0-1),
//        eval_id?: string, error?: string}
// 三段 try/catch: timeout / 4xx / 5xx
// 返回 QuestionScore: dimension=`long_context` (v0.4.0 默认)
// score = accuracy_score * 0.7 + (1 - hallucination_rate) * 30 (0-100 归一)
//
// fetchAAOmniscienceScore 在 src/core/evaluator.ts L684-768 (private async),
// 之前 0 直接 runtime 单测, 仅 evaluator-v050-dispatch-return-injection.test.ts /
// evaluator-v050-dispatch-type-wiring.test.ts 等 closure 静态断言。
// 一旦 fetch + parse + 0-100 归一 + 错误分支任一回归, 之前会 silently 走 0 分兜底;
// 现在 8 cases 钉死所有 path。
//
// parallels woclaw c7bf0a6 openai_provider 8-case runtime coverage pattern.

import { Evaluator } from '../src/core/evaluator';
import { LLMAdapter } from '../src/adapters/adapter';
import { BenchmarkConfig, ModelConfig } from '../src/types';

interface FetchAAOmniscienceSignature {
  fetchAAOmniscienceScore: (
    apiBase: string,
    modelConfig: ModelConfig,
    timeoutMs: number,
    anchorScore?: number,
  ) => Promise<{
    questionId: string;
    category: string;
    score: number;
    dimension: string;
    modelOutput: string;
    detail?: string;
  }>;
}

describe('fetchAAOmniscienceScore runtime coverage (v0.5.0 dispatch, 06-15 00:03 cron)', () => {
  const model: ModelConfig = {
    name: 'aa-omniscience-test-model',
    endpoint: 'https://model.invalid/v1',
    apiKey: 'test-key',
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
  // fetchAAOmniscienceScore 是 Evaluator private method,
  // 通过 (evaluator as unknown as FetchAAOmniscienceSignature) 暴露。
  const invoke = async (
    apiBase: string,
    m: ModelConfig,
    timeoutMs: number,
    anchorScore?: number,
  ) => {
    const evaluator = new Evaluator(config, adapter) as unknown as FetchAAOmniscienceSignature;
    return evaluator.fetchAAOmniscienceScore(apiBase, m, timeoutMs, anchorScore);
  };

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // Case 1: happy path — 真实 fetch 成功 + parse 正常 + 0-100 归一正确
  it('happy path: valid {accuracy_score, hallucination_rate, eval_id} -> score = accuracy*0.7 + (1-h)*30 rounded', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ accuracy_score: 80, hallucination_rate: 0.2, eval_id: 'aa-eval-12345' }),
    }) as typeof fetch;

    const result = await invoke('https://aa.invalid/v1', model, 30000);

    expect(result.questionId).toBe('aa_omniscience_aa-omniscience-test-model');
    expect(result.category).toBe('aa_omniscience');
    expect(result.dimension).toBe('long_context');
    // 80 * 0.7 + (1 - 0.2) * 30 = 56 + 24 = 80
    expect(result.score).toBe(80);
    expect(result.detail).toContain('accuracy=80.0');
    expect(result.detail).toContain('hallucination=20.0%');
    expect(result.detail).toContain('eval_id=aa-eval-12345');
    expect(result.modelOutput).toContain('aa-eval-12345');
  });

  // Case 2: 请求 shape 验证 — POST /application/json + basePayload (api_base/model_id/timeout_ms)
  it('request shape: POST {Content-Type: application/json} with {api_base, model_id, timeout_ms} body', async () => {
    let capturedUrl: string | undefined;
    let capturedInit: RequestInit | undefined;
    global.fetch = jest.fn().mockImplementation((url: any, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedInit = init;
      return Promise.resolve({
        ok: true,
        json: async () => ({ accuracy_score: 50, hallucination_rate: 0.1 }),
      });
    }) as typeof fetch;

    await invoke('https://aa.invalid/v1', model, 15000);

    expect(capturedUrl).toBe('https://aa.invalid/v1');
    expect(capturedInit?.method).toBe('POST');
    const headers = capturedInit?.headers as Record<string, string> | undefined;
    expect(headers?.['Content-Type']).toBe('application/json');
    const body = JSON.parse(String(capturedInit?.body));
    expect(body).toEqual({
      api_base: 'https://model.invalid/v1',
      model_id: 'gpt-4o-mini', // 优先 model.model
      timeout_ms: 15000,
    });
  });

  // Case 3: model.model 缺省回退到 model.name (model_id routing)
  it('request shape: when model.model is absent, model_id falls back to model.name', async () => {
    const modelNoName: ModelConfig = {
      name: 'fallback-name',
      endpoint: 'https://model.invalid/v1',
      apiKey: 'test-key',
      type: 'openai',
      // model 字段缺省
    };

    let capturedInit: RequestInit | undefined;
    global.fetch = jest.fn().mockImplementation((_url: any, init?: RequestInit) => {
      capturedInit = init;
      return Promise.resolve({
        ok: true,
        json: async () => ({ accuracy_score: 50, hallucination_rate: 0.1 }),
      });
    }) as typeof fetch;

    await invoke('https://aa.invalid/v1', modelNoName, 15000);

    const body = JSON.parse(String(capturedInit?.body));
    expect(body.model_id).toBe('fallback-name'); // fallback path
  });

  // Case 4: anchorScore 在 ±5 内 — 无 anchor warning, detail 不含 anchor suffix
  it('anchor within ±5: no anchor warning, detail does not contain anchor suffix', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ accuracy_score: 80, hallucination_rate: 0.2 }), // score=80
    }) as typeof fetch;

    const result = await invoke('https://aa.invalid/v1', model, 30000, 82); // ±5 内

    expect(result.score).toBe(80);
    expect(result.detail).not.toContain('anchor');
  });

  // Case 5: anchorScore 偏离 >5 — detail 附加 anchor warning suffix
  it('anchor drift >5: detail contains "(anchor ⚠️ <expected>)" suffix', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ accuracy_score: 50, hallucination_rate: 0.5 }), // score=50
    }) as typeof fetch;

    const result = await invoke('https://aa.invalid/v1', model, 30000, 95); // 45 分差

    expect(result.score).toBe(50);
    expect(result.detail).toContain('(anchor ⚠️ 95)');
  });

  // Case 6: API 返回 {error: "..."} 字段 — score:0, detail 含 "API error"
  it('API error field: {error: "rate_limited"} -> score 0, detail contains "API error"', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ error: 'rate_limited' }),
    }) as typeof fetch;

    const result = await invoke('https://aa.invalid/v1', model, 30000);

    expect(result.score).toBe(0);
    expect(result.detail).toBe('aa_omniscience API error: rate_limited');
  });

  // Case 7: HTTP 500 — score:0, detail 以 "aa_omniscience HTTP 500:" 开头
  it('HTTP 500: score 0, detail starts with "aa_omniscience HTTP 500:"', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'internal server error',
    }) as typeof fetch;

    const result = await invoke('https://aa.invalid/v1', model, 30000);

    expect(result.score).toBe(0);
    expect(result.detail).toMatch(/^aa_omniscience HTTP 500: /);
    expect(result.detail).toContain('internal server error');
  });

  // Case 8: fetch rejects (network down) — score:0, detail 含 "fetch error: network down"
  it('fetch rejection (network down): score 0, detail contains "fetch error: network down"', async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as typeof fetch;

    const result = await invoke('https://aa.invalid/v1', model, 30000);

    expect(result.score).toBe(0);
    expect(result.detail).toContain('fetch error: network down');
    expect(jest.getTimerCount()).toBe(0);
    jest.useRealTimers();
  });
});