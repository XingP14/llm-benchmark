// tests/evaluator-fetch-terminal-bench-score.test.ts
// 钉住 src/core/evaluator.ts v0.5.0 dispatch: terminal_bench 真实 fetch
// (07-14 05:23 cron, 沿 06-14 03:23 webdev_arena 6-gate pattern + 06-14 22:23 cyberseceval3
// + 06-15 00:03 aa_omniscience + 06-15 04:03 benchlm_agentic + 06-15 05:23 swe_bench_pro
// + 06-15 06:43 process_aware_scoring + 07-14 01:03 cyberseceval3 eae0c60 8-case mode) 的
// runtime 行为:
// POST {api_base} body={api_base, model_id, timeout_ms, subset, dispatch_type}
// 解析 {task_pass_rate?: number (0-1); avg_duration_s?: number (秒); trajectory_id?: string; error?: string}
// 三段 try/catch: timeout / 4xx / 5xx
// 返回 QuestionScore: dimension=`coding` (v0.4.0 默认, terminal_bench 属 coding 维度)
// score = task_pass_rate * 70 + (1 - min(avg_duration_s, 3600) / 3600) * 30
//        (0-100 归一; 速度惩罚: 1h 满 cap, durSec 超过 3600 不增分)
// detail = "terminal_bench[<subset>] pass_rate=<p*100>%, avg_duration=<d>s, score=<n>" + 可选 ", trajectory_id=<id>"
// anchor mismatch 走 logWarn 但 **不追加到 detail** (与 benchlm_agentic/swe_bench_pro 不同,
// 那些 fetcher detail 尾部追加 "(anchor ⚠️ <n>)"; terminal_bench 仅 logWarn, detail 不变。
// 06-15 03:03 cron 设计选择 — terminal_bench 是 tbench.ai 真实跑 trajectory 的端点,
// 客户端无 anchor 兜底责任, 错配视为 provider 端 issue 而非 client bug)。
//
// fetchTerminalBenchScore 在 src/core/evaluator.ts L771-854 (private async),
// 之前 0 直接 runtime 单测, 仅 evaluator-v050-dispatch-return-injection.test.ts /
// evaluator-v050-dispatch-type-wiring.test.ts / evaluator-default-subset-helper.test.ts
// 等 closure 静态断言 (subset helper / type wiring 间接覆盖)。
// 一旦 fetch + parse + 0-100 归一 + avg_duration 3600 cap + subset 透传 + error 分支任一回归,
// 之前会 silently 走 0 分兜底; 现在 8 cases 钉死所有 path。
//
// parallels woclaw c7bf0a6 openai_provider 8-case + 37f32db aa_omniscience 8-case
// + 761c00b lm_eval_task_conflict_resolver 8-case + 26a83ef fetchWebdevArenaScore 8-case
// + eae0c60 fetchCyberseceval3Score 8-case pattern。

import { Evaluator } from '../src/core/evaluator';
import { LLMAdapter } from '../src/adapters/adapter';
import { BenchmarkConfig, ModelConfig } from '../src/types';

interface FetchTerminalBenchSignature {
  fetchTerminalBenchScore: (
    apiBase: string,
    modelConfig: ModelConfig,
    timeoutMs: number,
    anchorScore?: number,
    subset?: string,
    dispatchType?: string,
  ) => Promise<{
    questionId: string;
    category: string;
    score: number;
    dimension: string;
    modelOutput: string;
    detail?: string;
  }>;
}

describe('fetchTerminalBenchScore runtime coverage (v0.5.0 dispatch, 07-14 05:23 cron)', () => {
  const model: ModelConfig = {
    name: 'terminal-bench-test-model',
    endpoint: 'https://model.invalid/v1',
    apiKey: 'sk-test-dummy-for-terminal-bench-coverage-only-not-real',
    type: 'openai',
    model: 'gpt-4o-mini',
  };

  const config: BenchmarkConfig = {
    models: [model],
    benchmarks: { dialogue: false, coding: false },
  };

  const adapter = {} as LLMAdapter;
  const originalFetch = global.fetch;
  const originalWarn = console.warn;

  // 与 tests/evaluator-fetch-cyberseceval3-score.test.ts 同模式:
  // fetchTerminalBenchScore 是 Evaluator private method,
  // 通过 (evaluator as unknown as FetchTerminalBenchSignature) 暴露。
  const invoke = async (
    apiBase: string,
    m: ModelConfig,
    timeoutMs: number,
    anchorScore?: number,
    subset?: string,
    dispatchType?: string,
  ) => {
    const evaluator = new Evaluator(config, adapter) as unknown as FetchTerminalBenchSignature;
    return evaluator.fetchTerminalBenchScore(apiBase, m, timeoutMs, anchorScore, subset, dispatchType);
  };

  beforeEach(() => {
    // 静音 anchor drift logWarn 以免污染测试输出 (实测 anchor mismatch 走 logWarn 分支)
    console.warn = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    console.warn = originalWarn;
  });

  // Case 1: happy path — 真实 fetch 成功 + parse 正常 + 0-100 归一正确
  // task_pass_rate=0.8, avg_duration_s=600 (10min): 0.8*70 + (1-600/3600)*30 = 56 + 25 = 81
  it('happy path: valid {task_pass_rate, avg_duration_s, trajectory_id} -> score = pass*70 + (1-dur/3600)*30 rounded', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ task_pass_rate: 0.8, avg_duration_s: 600, trajectory_id: 'tb-traj-abc-123' }),
    }) as typeof fetch;

    const result = await invoke('https://tb.invalid/v1', model, 30000);

    expect(result.questionId).toBe('terminal_bench_terminal-bench-test-model');
    expect(result.category).toBe('terminal_bench');
    expect(result.dimension).toBe('coding');
    // 0.8 * 70 + (1 - 600/3600) * 30 = 56 + 0.8333 * 30 = 56 + 25 = 81
    expect(result.score).toBe(81);
    expect(result.detail).toContain('pass_rate=80.0%');
    expect(result.detail).toContain('avg_duration=600s');
    expect(result.detail).toContain('score=81.0');
    expect(result.detail).toContain('trajectory_id=tb-traj-abc-123');
    expect(result.modelOutput).toContain('tb-traj-abc-123');
  });

  // Case 2: 请求 shape 验证 — POST /application/json + basePayload (api_base/model_id/timeout_ms/subset/dispatch_type)
  it('request shape: POST {Content-Type: application/json} with {api_base, model_id, timeout_ms, subset, dispatch_type} body', async () => {
    let capturedUrl: string | undefined;
    let capturedInit: RequestInit | undefined;
    global.fetch = jest.fn().mockImplementation((url: any, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedInit = init;
      return Promise.resolve({
        ok: true,
        json: async () => ({ task_pass_rate: 0.5, avg_duration_s: 1800 }),
      });
    }) as typeof fetch;

    await invoke('https://tb.invalid/v1', model, 15000, undefined, 'verified', 'native');

    expect(capturedUrl).toBe('https://tb.invalid/v1');
    expect(capturedInit?.method).toBe('POST');
    const headers = capturedInit?.headers as Record<string, string> | undefined;
    expect(headers?.['Content-Type']).toBe('application/json');
    const body = JSON.parse(String(capturedInit?.body));
    expect(body).toEqual({
      api_base: 'https://model.invalid/v1',
      model_id: 'gpt-4o-mini', // 优先 model.model
      timeout_ms: 15000,
      subset: 'verified',
      dispatch_type: 'native',
    });
  });

  // Case 3: 默认 subset='full' + 默认 dispatch_type=defaultDispatchType('terminal_bench')
  it('default subset: when subset omitted, defaults to "full" and dispatch_type to defaultDispatchType("terminal_bench")', async () => {
    let capturedInit: RequestInit | undefined;
    global.fetch = jest.fn().mockImplementation((_url: any, init?: RequestInit) => {
      capturedInit = init;
      return Promise.resolve({
        ok: true,
        json: async () => ({ task_pass_rate: 0.5, avg_duration_s: 1800 }),
      });
    }) as typeof fetch;

    await invoke('https://tb.invalid/v1', model, 30000);

    const body = JSON.parse(String(capturedInit?.body));
    expect(body.subset).toBe('full'); // 默认 subset
    // defaultDispatchType('terminal_bench') 来自 src/core/evaluator.ts L82-87 type 映射
    // 实际值由 defaultDispatchType helper 决定; 仅验证非空字符串
    expect(typeof body.dispatch_type).toBe('string');
    expect(body.dispatch_type.length).toBeGreaterThan(0);
  });

  // Case 4: avg_duration_s cap 在 3600 — 超过 3600 的值 clamp 到 3600, 速度分归 0
  // task_pass_rate=1.0, avg_duration_s=7200 (2h, 超过 cap): min(7200, 3600)=3600
  // score = 1.0 * 70 + (1 - 3600/3600) * 30 = 70 + 0 = 70 (速度分归 0, 不出现负数)
  it('duration cap: avg_duration_s=7200 clamps to 3600 -> speed component = 0, total = pass_rate*70 only', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ task_pass_rate: 1.0, avg_duration_s: 7200 }),
    }) as typeof fetch;

    const result = await invoke('https://tb.invalid/v1', model, 30000);

    // min(7200, 3600) = 3600, (1 - 3600/3600) = 0, 1.0 * 70 + 0 * 30 = 70
    expect(result.score).toBe(70);
    // detail 内显示 clamp 后的值 (3600), 不是原始 7200
    expect(result.detail).toContain('avg_duration=3600s');
    // 验证不是 7200 (clamp 已生效)
    expect(result.detail).not.toContain('avg_duration=7200s');
  });

  // Case 5: avg_duration_s 缺省 -> 走默认值 3600 (typeof !== 'number'), 速度分归 0
  // task_pass_rate=0.5, avg_duration_s undefined: durSec = 3600
  // score = 0.5 * 70 + (1 - 3600/3600) * 30 = 35 + 0 = 35
  it('duration missing: avg_duration_s undefined -> default to 3600 -> speed component = 0', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ task_pass_rate: 0.5 }), // avg_duration_s 缺省
    }) as typeof fetch;

    const result = await invoke('https://tb.invalid/v1', model, 30000);

    // typeof avg_duration_s === 'number' -> false -> durSec = 3600 (default)
    // 0.5 * 70 + (1 - 3600/3600) * 30 = 35 + 0 = 35
    expect(result.score).toBe(35);
    expect(result.detail).toContain('avg_duration=3600s');
  });

  // Case 6: API 返回 {error: "..."} 字段 — score:0, detail 含 "API error"
  it('API error field: {error: "agent_crashed"} -> score 0, detail contains "API error"', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ error: 'agent_crashed' }),
    }) as typeof fetch;

    const result = await invoke('https://tb.invalid/v1', model, 30000);

    expect(result.score).toBe(0);
    expect(result.detail).toBe('terminal_bench API error: agent_crashed');
  });

  // Case 7: HTTP 503 — score:0, detail 以 "terminal_bench HTTP 503:" 开头, 含 error body
  it('HTTP 503: score 0, detail starts with "terminal_bench HTTP 503:"', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'service unavailable - backoff 30s',
    }) as typeof fetch;

    const result = await invoke('https://tb.invalid/v1', model, 30000);

    expect(result.score).toBe(0);
    expect(result.detail).toMatch(/^terminal_bench HTTP 503: /);
    expect(result.detail).toContain('service unavailable');
  });

  // Case 8: fetch rejects (timeout abort) — score:0, detail 含 "timeout after <ms>ms"
  it('fetch rejection (abort/timeout): score 0, detail contains "timeout after <ms>ms"', async () => {
    jest.useFakeTimers();
    const abortError = new Error('The operation was aborted');
    global.fetch = jest.fn().mockRejectedValue(abortError) as typeof fetch;

    const result = await invoke('https://tb.invalid/v1', model, 5000);

    expect(result.score).toBe(0);
    // errorMessage(err) for Error('The operation was aborted') -> msg.toLowerCase() contains 'abort'
    // isTimeout branch -> "terminal_bench timeout after 5000ms"
    expect(result.detail).toBe('terminal_bench timeout after 5000ms');
    expect(jest.getTimerCount()).toBe(0);
    jest.useRealTimers();
  });
});