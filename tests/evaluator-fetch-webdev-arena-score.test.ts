// tests/evaluator-fetch-webdev-arena-score.test.ts
// 钉住 src/core/evaluator.ts v0.5.0 dispatch: webdev_arena 真实 fetch
// (06-14 03:23 cron, 沿 06-15 00:03 aa_omniscience 模式 + 06-13 lm_eval_harness_v4
// config YAML 加载 stub + 03-23 webdev_arena 6-gate pattern) 的 runtime 行为:
// POST {api_base} body={api_base, model_id, prompt, timeout_ms}
// 解析 {elo_score?: number (0-1000); pass_rate?: number (0-1); eval_id?: string; error?: string}
// 三段 try/catch: timeout / 4xx / 5xx
// 返回 QuestionScore: dimension=`coding` (v0.4.0 默认, webdev_arena 属编码赛道)
// score = elo_score * 0.09 + pass_rate * 10 (clamp [0, 100], 1 decimal rounded)
// detail = "webdev_arena elo=<e>, pass_rate=<p*100>%, score=<n>" + 可选 ", eval_id=<id>" +
//          可选 " (anchor ⚠️ <expected>)" suffix (drift >5).
// WebDevArena (lmarena.ai/webdev-arena, 2025-09 发布) 提供 public hosted API
// 默认端点 https://webdevarena.com/api/v1/eval, 部署者可接自托管适配层.
//
// fetchWebdevArenaScore 在 src/core/evaluator.ts L596-682 (private async),
// 之前 0 直接 runtime 单测, 仅 evaluator-v050-dispatch-return-injection.test.ts /
// evaluator-v050-dispatch-type-wiring.test.ts 等 closure 静态断言.
// 一旦 fetch + parse + 0-100 归一 + anchor drift suffix + error 分支任一回归,
// 之前会 silently 走 0 分兜底; 现在 8 cases 钉死所有 path.
//
// parallels woclaw c7bf0a6 openai_provider 8-case + 37f32db aa_omniscience 8-case
// + 761c00b lm_eval_task_conflict_resolver 8-case pattern.

import { Evaluator } from '../src/core/evaluator';
import { LLMAdapter } from '../src/adapters/adapter';
import { BenchmarkConfig, ModelConfig } from '../src/types';

interface FetchWebdevArenaSignature {
  fetchWebdevArenaScore: (
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

describe('fetchWebdevArenaScore runtime coverage (v0.5.0 dispatch, 06-14 03:23 cron)', () => {
  const model: ModelConfig = {
    name: 'webdev-arena-test-model',
    endpoint: 'https://model.invalid/v1',
    apiKey: 'sk-test-placeholder-not-secret-1234567890',
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
  // fetchWebdevArenaScore 是 Evaluator private method,
  // 通过 (evaluator as unknown as FetchWebdevArenaSignature) 暴露。
  const invoke = async (
    apiBase: string,
    m: ModelConfig,
    timeoutMs: number,
    anchorScore?: number,
  ) => {
    const evaluator = new Evaluator(config, adapter) as unknown as FetchWebdevArenaSignature;
    return evaluator.fetchWebdevArenaScore(apiBase, m, timeoutMs, anchorScore);
  };

  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
  });

  // Case 1: happy path — 真实 fetch 成功 + parse 正常 + 0-100 归一正确
  // elo=900, pass_rate=0.8 -> 900 * 0.09 + 0.8 * 10 = 81 + 8 = 89, rounded 89.0
  it('happy path: valid {elo_score, pass_rate, eval_id} -> score = elo*0.09 + pass*10 rounded', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ elo_score: 900, pass_rate: 0.8, eval_id: 'wda-eval-12345' }),
    }) as typeof fetch;

    const result = await invoke('https://webdevarena.com/api/v1/eval', model, 30000);

    expect(result.questionId).toBe('webdev_arena_webdev-arena-test-model');
    expect(result.category).toBe('webdev_arena');
    expect(result.dimension).toBe('coding'); // distinctive: coding, not long_context
    expect(result.score).toBe(89);
    expect(result.detail).toContain('elo=900');
    expect(result.detail).toContain('pass_rate=80.0%');
    expect(result.detail).toContain('score=89.0');
    expect(result.detail).toContain('eval_id=wda-eval-12345');
    expect(result.modelOutput).toContain('wda-eval-12345');
  });

  // Case 2: 请求 shape 验证 — POST /application/json + basePayload (api_base/model_id/prompt/timeout_ms)
  it('request shape: POST {Content-Type: application/json} with {api_base, model_id, prompt, timeout_ms} body', async () => {
    let capturedUrl: string | undefined;
    let capturedInit: RequestInit | undefined;
    global.fetch = jest.fn().mockImplementation((url: any, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedInit = init;
      return Promise.resolve({
        ok: true,
        json: async () => ({ elo_score: 500, pass_rate: 0.5 }),
      });
    }) as typeof fetch;

    await invoke('https://webdevarena.com/api/v1/eval', model, 15000);

    expect(capturedUrl).toBe('https://webdevarena.com/api/v1/eval');
    expect(capturedInit?.method).toBe('POST');
    const headers = capturedInit?.headers as Record<string, string> | undefined;
    expect(headers?.['Content-Type']).toBe('application/json');
    const body = JSON.parse(String(capturedInit?.body));
    expect(body).toEqual({
      api_base: 'https://model.invalid/v1',
      model_id: 'gpt-4o-mini', // 优先 model.model
      prompt: expect.stringContaining('full-stack web application'), // webdev_arena 独有 prompt
      timeout_ms: 15000,
    });
  });

  // Case 3: model.model 缺省回退到 model.name (model_id routing)
  it('request shape: when model.model is absent, model_id falls back to model.name', async () => {
    const modelNoName: ModelConfig = {
      name: 'fallback-name',
      endpoint: 'https://model.invalid/v1',
      apiKey: 'sk-test-placeholder-not-secret-1234567890',
      type: 'openai',
      // model 字段缺省
    };

    let capturedInit: RequestInit | undefined;
    global.fetch = jest.fn().mockImplementation((_url: any, init?: RequestInit) => {
      capturedInit = init;
      return Promise.resolve({
        ok: true,
        json: async () => ({ elo_score: 500, pass_rate: 0.5 }),
      });
    }) as typeof fetch;

    await invoke('https://webdevarena.com/api/v1/eval', modelNoName, 15000);

    const body = JSON.parse(String(capturedInit?.body));
    expect(body.model_id).toBe('fallback-name'); // fallback path
  });

  // Case 4: anchorScore 在 ±5 内 — 无 anchor warning, detail 不含 anchor suffix
  // elo=600, pass=0.5 -> 600 * 0.09 + 5 = 54 + 5 = 59, anchor=62 -> |59-62|=3 ≤ 5
  it('anchor within ±5: no anchor warning, detail does not contain anchor suffix', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ elo_score: 600, pass_rate: 0.5 }),
    }) as typeof fetch;

    const result = await invoke('https://webdevarena.com/api/v1/eval', model, 30000, 62);

    expect(result.score).toBe(59);
    expect(result.detail).not.toContain('anchor');
  });

  // Case 5: anchorScore 偏离 >5 — detail 附加 anchor warning suffix
  // elo=100, pass=0.1 -> 9 + 1 = 10, anchor=95 -> |10-95|=85 > 5
  it('anchor drift >5: detail contains "(anchor ⚠️ <expected>)" suffix', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ elo_score: 100, pass_rate: 0.1 }),
    }) as typeof fetch;

    const result = await invoke('https://webdevarena.com/api/v1/eval', model, 30000, 95);

    expect(result.score).toBe(10); // 100 * 0.09 + 0.1 * 10 = 9 + 1 = 10
    expect(result.detail).toContain('(anchor ⚠️ 95)');
  });

  // Case 6: API 返回 {error: "..."} 字段 — score:0, detail 含 "API error"
  it('API error field: {error: "rate_limited"} -> score 0, detail contains "API error"', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ error: 'rate_limited' }),
    }) as typeof fetch;

    const result = await invoke('https://webdevarena.com/api/v1/eval', model, 30000);

    expect(result.score).toBe(0);
    expect(result.detail).toBe('webdev_arena API error: rate_limited');
  });

  // Case 7: HTTP 503 — score:0, detail 以 "webdev_arena HTTP 503:" 开头
  it('HTTP 503: score 0, detail starts with "webdev_arena HTTP 503:"', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'service unavailable',
    }) as typeof fetch;

    const result = await invoke('https://webdevarena.com/api/v1/eval', model, 30000);

    expect(result.score).toBe(0);
    expect(result.detail).toMatch(/^webdev_arena HTTP 503: /);
    expect(result.detail).toContain('service unavailable');
  });

  // Case 8: fetch rejects (network down) — score:0, detail 含 "fetch error: network down"
  it('fetch rejection (network down): score 0, detail contains "fetch error: network down" and clears the abort timer', async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as typeof fetch;

    const result = await invoke('https://webdevarena.com/api/v1/eval', model, 30000);

    expect(result.score).toBe(0);
    expect(result.detail).toContain('fetch error: network down');
    expect(jest.getTimerCount()).toBe(0);
  });
});
