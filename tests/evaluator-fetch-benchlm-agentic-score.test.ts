// tests/evaluator-fetch-benchlm-agentic-score.test.ts
// 钉住 src/core/evaluator.ts v0.5.0 dispatch: benchlm_agentic 真实 fetch
// (07-14 22:51 cron, 沿 06-14 03:23 webdev_arena 6-gate pattern + 06-14 22:23 cyberseceval3
// + 06-15 00:03 aa_omniscience + 06-15 04:03 benchlm_agentic + 06-15 05:23 swe_bench_pro
// + 06-15 06:43 process_aware_scoring + 07-14 01:03 cyberseceval3 eae0c60 8-case mode
// + 07-14 05:23 terminal_bench 8-case mode) 的 runtime 行为:
// POST {api_base} body={api_base, model_id, timeout_ms, native_evals, subset, dispatch_type}
// 解析 {agentic_pass_rate?: number (0-1); design2code_score?: number (0-100);
//       vision2web_score?: number (0-100); native_evals_score?: number; eval_id?: string;
//       error?: string}
// 三段 try/catch: timeout / 4xx / 5xx
// 返回 QuestionScore: dimension=`coding` (v0.4.0 默认, benchlm_agentic 属 coding 维度)
// score = passRate*50 + d2c*0.25 + v2w*0.25 (0-100 归一; +5 if native_evals|native_evals_only
//         && native_evals_score 存在; Math.min(100, ...) 上限 cap)
// detail = "benchlm_agentic pass_rate=<p*100>%, d2c=<d>, v2w=<w>, score=<n>"
//          + 可选 ", subset=<s>" + 可选 ", native_evals=<n> (启用+5)" + 可选 ", eval_id=<id>"
//          + 可选 "(anchor ⚠️ <n>)" 若 anchor drift >5 (与 swe_bench_pro / long_context_cluster
//          同模式, 与 terminal_bench 仅 logWarn 不追加 detail 不同)
// native_evals_score 字段: 仅当 nativeEvals=true 或 subset==='native_evals_only' 时参与 +5 触发;
//   数据存在但 subset='all' 时不触发 +5 (pitfall #59: native 触发是 subset/nativeEvals 控制,
//   不是 data 本身存在决定)。
//
// fetchBenchlmAgenticScore 在 src/core/evaluator.ts L865-958 (private async),
// 之前 0 直接 runtime 单测, 仅 evaluator-v050-dispatch-return-injection.test.ts /
// evaluator-v050-dispatch-type-wiring.test.ts / evaluator-default-subset-helper.test.ts
// 等 closure 静态断言 (subset helper / type wiring 间接覆盖)。
// 一旦 fetch + parse + 0-100 归一 + native_evals +5 + subset 透传 + anchor ⚠️ 追加 + error
// 分支任一回归, 之前会 silently 走 0 分兜底; 现在 8 cases 钉死所有 path。
//
// parallels woclaw c7bf0a6 openai_provider 8-case + 37f32db aa_omniscience 8-case
// + 761c00b lm_eval_task_conflict_resolver 8-case + 26a83ef fetchWebdevArenaScore 8-case
// + eae0c60 fetchCyberseceval3Score 8-case + 643f37d fetchTerminalBenchScore 8-case pattern。

import { Evaluator } from '../src/core/evaluator';
import { LLMAdapter } from '../src/adapters/adapter';
import { BenchmarkConfig, ModelConfig } from '../src/types';

interface FetchBenchlmAgenticSignature {
  fetchBenchlmAgenticScore: (
    apiBase: string,
    modelConfig: ModelConfig,
    timeoutMs: number,
    anchorScore?: number,
    nativeEvals?: boolean,
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

describe('fetchBenchlmAgenticScore runtime coverage (v0.5.0 dispatch, 07-14 22:51 cron)', () => {
  const model: ModelConfig = {
    name: 'benchlm-agentic-test-model',
    endpoint: 'https://model.invalid/v1',
    apiKey: '«reda...…»',
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
  // fetchBenchlmAgenticScore 是 Evaluator private method,
  // 通过 (evaluator as unknown as FetchBenchlmAgenticSignature) 暴露。
  const invoke = async (
    apiBase: string,
    m: ModelConfig,
    timeoutMs: number,
    anchorScore?: number,
    nativeEvals?: boolean,
    subset?: string,
    dispatchType?: string,
  ) => {
    const evaluator = new Evaluator(config, adapter) as unknown as FetchBenchlmAgenticSignature;
    return evaluator.fetchBenchlmAgenticScore(apiBase, m, timeoutMs, anchorScore, nativeEvals, subset, dispatchType);
  };

  beforeEach(() => {
    // 静音 anchor drift logWarn 以免污染测试输出 (实测 anchor mismatch 走 logWarn 分支)
    console.warn = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    console.warn = originalWarn;
  });

  // Case 1: happy path — 真实 fetch 成功 + parse 正常 + 0-100 归一正确 (native 关闭)
  // passRate=0.6, d2c=80, v2w=70: 0.6*50 + 80*0.25 + 70*0.25 = 30 + 20 + 17.5 = 67.5 -> round 67.5
  it('happy path: valid {pass_rate, d2c, v2w} -> score = pass*50 + d2c*0.25 + v2w*0.25 (native off)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ agentic_pass_rate: 0.6, design2code_score: 80, vision2web_score: 70, eval_id: 'bla-eval-xyz-987' }),
    }) as typeof fetch;

    const result = await invoke('https://bla.invalid/v1', model, 30000);

    expect(result.questionId).toBe('benchlm_agentic_benchlm-agentic-test-model');
    expect(result.category).toBe('benchlm_agentic');
    expect(result.dimension).toBe('coding');
    // 0.6*50 + 80*0.25 + 70*0.25 = 30 + 20 + 17.5 = 67.5
    expect(result.score).toBe(67.5);
    expect(result.detail).toContain('pass_rate=60.0%');
    expect(result.detail).toContain('d2c=80.0');
    expect(result.detail).toContain('v2w=70.0');
    expect(result.detail).toContain('score=67.5');
    expect(result.detail).toContain('eval_id=bla-eval-xyz-987');
    expect(result.modelOutput).toContain('bla-eval-xyz-987');
    // native 关闭 -> detail 无 native_evals 部分
    expect(result.detail).not.toContain('native_evals=');
  });

  // Case 2: 请求 shape 验证 — POST /application/json + basePayload (api_base/model_id/timeout_ms/native_evals/subset/dispatch_type)
  it('request shape: POST {Content-Type: application/json} with {api_base, model_id, timeout_ms, native_evals, subset, dispatch_type} body', async () => {
    let capturedUrl: string | undefined;
    let capturedInit: RequestInit | undefined;
    global.fetch = jest.fn().mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = url.toString();
      capturedInit = init;
      return {
        ok: true,
        json: async () => ({ agentic_pass_rate: 0.5, design2code_score: 60, vision2web_score: 60 }),
      };
    }) as typeof fetch;

    await invoke('https://bla-shape.invalid/v1', model, 45000, undefined, true, 'native_evals_only', 'eval_harness');

    expect(capturedUrl).toBe('https://bla-shape.invalid/v1');
    expect(capturedInit?.method).toBe('POST');
    expect((capturedInit?.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    const body = JSON.parse(capturedInit?.body as string);
    expect(body.api_base).toBe('https://model.invalid/v1');
    expect(body.model_id).toBe('gpt-4o-mini');
    expect(body.timeout_ms).toBe(45000);
    expect(body.native_evals).toBe(true);
    expect(body.subset).toBe('native_evals_only');
    expect(body.dispatch_type).toBe('eval_harness');
  });

  // Case 3: native_evals=true + native_evals_score 存在 -> +5 触发
  // passRate=0.4, d2c=50, v2w=50: 0.4*50 + 50*0.25 + 50*0.25 = 20 + 12.5 + 12.5 = 45 + 5 = 50
  it('native_evals=true with native_evals_score: +5 bonus applied to normalized score', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ agentic_pass_rate: 0.4, design2code_score: 50, vision2web_score: 50, native_evals_score: 88 }),
    }) as typeof fetch;

    const result = await invoke('https://bla.invalid/v1', model, 30000, undefined, true);

    // 45 + 5 (native 触发) = 50, Math.min(100, ...) 上限保护
    expect(result.score).toBe(50);
    expect(result.detail).toContain('native_evals=88.0 (启用+5)');
  });

  // Case 4: subset='native_evals_only' (不显式传 native_evals) + native_evals_score 存在 -> +5 触发 (pitfall #59)
  it('subset=native_evals_only without explicit nativeEvals flag: +5 bonus still triggers when native_evals_score present', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ agentic_pass_rate: 0.5, design2code_score: 70, vision2web_score: 70, native_evals_score: 90 }),
    }) as typeof fetch;

    // 不传 nativeEvals (default false), 但 subset='native_evals_only' 触发 +5 分支
    const result = await invoke('https://bla.invalid/v1', model, 30000, undefined, undefined, 'native_evals_only');

    // 0.5*50 + 70*0.25 + 70*0.25 = 25 + 17.5 + 17.5 = 60 + 5 = 65
    expect(result.score).toBe(65);
    expect(result.detail).toContain('native_evals=90.0 (启用+5)');
    expect(result.detail).toContain('subset=native_evals_only');
  });

  // Case 5: subset != 'all' (e.g. 'core') -> detail 追加 ", subset=core"
  it('subset=core (custom subset != all): detail includes ", subset=core"', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ agentic_pass_rate: 0.7, design2code_score: 85, vision2web_score: 80 }),
    }) as typeof fetch;

    const result = await invoke('https://bla.invalid/v1', model, 30000, undefined, false, 'core');

    // 0.7*50 + 85*0.25 + 80*0.25 = 35 + 21.25 + 20 = 76.25
    expect(result.score).toBe(76.3);
    expect(result.detail).toContain('subset=core');
    expect(result.detail).not.toContain('subset=all');
  });

  // Case 6: anchor within +-5 (normalized=72, anchor=70, diff=2) - 不追加 anchor ⚠️
  it('anchor within ±5 (normalized=72, anchor=70, diff=2): no "(anchor ⚠️ ...)" suffix appended', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ agentic_pass_rate: 0.6, design2code_score: 90, vision2web_score: 90 }),
    }) as typeof fetch;

    // 0.6*50 + 90*0.25 + 90*0.25 = 30 + 22.5 + 22.5 = 75
    // anchor=72, diff=3 -> 无 anchor ⚠️ 追加
    const result = await invoke('https://bla.invalid/v1', model, 30000, 72);

    expect(result.score).toBe(75);
    expect(result.detail).not.toContain('anchor ⚠️');
    expect(result.detail).not.toContain('(anchor');
  });

  // Case 7: anchor drift >5 (normalized=45, anchor=85, diff=40) - 追加 "(anchor ⚠️ 85)"
  it('anchor drift >5 (normalized=45, anchor=85, diff=40): detail includes "(anchor ⚠️ 85)" suffix', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ agentic_pass_rate: 0.3, design2code_score: 40, vision2web_score: 50 }),
    }) as typeof fetch;

    // 0.3*50 + 40*0.25 + 50*0.25 = 15 + 10 + 12.5 = 37.5
    // anchor=85, diff=47.5 -> 追加 "(anchor ⚠️ 85)"
    const result = await invoke('https://bla.invalid/v1', model, 30000, 85);

    expect(result.score).toBe(37.5);
    expect(result.detail).toContain('(anchor ⚠️ 85)');
  });

  // Case 8: API {error: "rate_limited"} -> score 0, detail "benchlm_agentic API error: rate_limited"
  it('API {error: "rate_limited"}: score=0, detail includes "benchlm_agentic API error: rate_limited"', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ error: 'rate_limited' }),
    }) as typeof fetch;

    const result = await invoke('https://bla.invalid/v1', model, 30000);

    expect(result.score).toBe(0);
    expect(result.dimension).toBe('coding');
    expect(result.detail).toBe('benchlm_agentic API error: rate_limited');
    expect(result.modelOutput).toBe('');
  });

  // Case 9: HTTP 503 non-OK - score:0, detail 以 "benchlm_agentic HTTP 503:" 开头
  // 沿 7 sibling fetcher (webdev_arena / terminal_bench / swe_bench_pro / process_aware_scoring /
  // long_context_cluster / cyberseceval3 / aa_omniscience) 同模式 HTTP error path coverage.
  it('HTTP 503: score 0, detail starts with "benchlm_agentic HTTP 503:"', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'service unavailable',
    }) as typeof fetch;

    const result = await invoke('https://bla.invalid/v1', model, 30000);

    expect(result.score).toBe(0);
    expect(result.dimension).toBe('coding');
    expect(result.modelOutput).toBe('');
    expect(result.detail).toMatch(/^benchlm_agentic HTTP 503: /);
    expect(result.detail).toContain('service unavailable');
  });

  // Case 10: fetch rejects (network down) - score:0, detail 含 "fetch error: network down"
  // catch 块走 buildFetcherErrorDetail('benchlm_agentic', '', timeoutMs, err) helper,
  // 非 abort/timeout 路径 -> "<category> fetch error: <msg>"
  // 提升 (TDD RED-case): 加 fake timers + getTimerCount 断言, 钉住 catch 路径的 timer 清理回归
  it('fetch rejection (network down): score 0, detail contains "fetch error: network down", no timer leak (getTimerCount === 0)', async () => {
    jest.useFakeTimers();
    try {
      global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as typeof fetch;

      const result = await invoke('https://bla.invalid/v1', model, 30000);

      expect(result.score).toBe(0);
      expect(result.dimension).toBe('coding');
      expect(result.modelOutput).toBe('');
      expect(result.detail).toContain('fetch error: network down');
      // 关键回归断言: fetch 拒绝路径必须清理 abort timer, 否则每次网络掉线泄漏一个 setTimeout
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });
});

// ---------------------------------------------------------------------------
// timer cleanup parity (chain #20 step-v6.0-14 extension — mirrors
// cyberseceval3 + swe_bench_pro + lm_eval_task_conflict_resolver pattern +
// 4d45a8b source fix + e2d5814 pilot).
//
// benchlm_agentic specifically: the `case 10` (network down) path above runs
// without fake timers so it observes the real setTimeout leak in the original
// implementation (clearTimeout was inside the try block, only reachable when
// fetch resolved, NOT on the rejection path). This new describe block pins
// the fix (controller/timer moved above try + finally { clearTimeout(timer) })
// across all 4 branches: HTTP 503, API error payload, happy path, fetch
// reject. Each test asserts jest.getTimerCount() === 0 after invocation,
// which fails (RED) on the unfixed code with "Expected 0, Received 1" on
// the fetch-reject branch.
// ---------------------------------------------------------------------------

describe('fetchBenchlmAgenticScore timer cleanup (chain #20 step-v6.0-14 timer parity)', () => {
  const cleanupModel: ModelConfig = {
    name: 'benchlm-agentic-cleanup-model',
    endpoint: 'https://model.invalid/v1',
    apiKey: 'test-...key',
    type: 'openai',
    model: 'gpt-4o-mini',
  };
  const cleanupConfig: BenchmarkConfig = {
    models: [cleanupModel],
    benchmarks: { dialogue: false, coding: false },
  };
  const cleanupAdapter = {} as LLMAdapter;
  const originalFetchRef = global.fetch;

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    global.fetch = originalFetchRef;
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  const invokeCleanup = async (apiBase: string, timeoutMs = 30_000) => {
    const evaluator = new Evaluator(cleanupConfig, cleanupAdapter) as unknown as FetchBenchlmAgenticSignature;
    return evaluator.fetchBenchlmAgenticScore(apiBase, cleanupModel, timeoutMs);
  };

  // Branch 1 of 4: HTTP 503 (resp.ok === false path) — verifies clearTimeout is called before return.
  it('clears the abort timer when HTTP response fails (503 Service Unavailable)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'service unavailable',
    }) as typeof fetch;

    const result = await invokeCleanup('https://bla.invalid/v1');

    expect(result.score).toBe(0);
    expect(result.dimension).toBe('coding');
    expect(result.detail).toMatch(/^benchlm_agentic HTTP 503: /);
    expect(jest.getTimerCount()).toBe(0);
  });

  // Branch 2 of 4: API error payload (data.error path) — verifies clearTimeout is called before return.
  it('clears the abort timer when API payload returns error field (rate_limited)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ error: 'rate_limited' }),
    }) as typeof fetch;

    const result = await invokeCleanup('https://bla.invalid/v1');

    expect(result.score).toBe(0);
    expect(result.dimension).toBe('coding');
    expect(result.detail).toBe('benchlm_agentic API error: rate_limited');
    expect(jest.getTimerCount()).toBe(0);
  });

  // Branch 3 of 4: happy path success — verifies clearTimeout is called after JSON parse OK.
  // passRate=0.6, d2c=80, v2w=70: 0.6*50 + 80*0.25 + 70*0.25 = 30 + 20 + 17.5 = 67.5 -> round 67.5
  it('clears the abort timer on happy path success (no timer leak when fetch resolves cleanly)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ agentic_pass_rate: 0.6, design2code_score: 80, vision2web_score: 70, eval_id: 'bla-eval-cleanup-001' }),
    }) as typeof fetch;

    const result = await invokeCleanup('https://bla.invalid/v1');

    expect(result.score).toBe(67.5);
    expect(result.detail).toContain('pass_rate=60.0%');
    expect(result.detail).toContain('score=67.5');
    expect(jest.getTimerCount()).toBe(0);
  });

  // Branch 4 of 4: network down (catch path) — REGRESSION for the timer leak that
  // previously occurred because clearTimeout(timer) only ran after fetch resolved.
  // This is the strict TDD RED case that fails on unfixed code with
  // "Expected 0, Received 1" — it pins the fetch-rejection path which was the
  // original bug (chain #20 step-v6.0-14 pilot + 4d45a8b swe_bench_pro fix pattern).
  it('clears the abort timer when fetch rejects before a response arrives (network down)', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as typeof fetch;

    const result = await invokeCleanup('https://bla.invalid/v1');

    expect(result.score).toBe(0);
    expect(result.dimension).toBe('coding');
    expect(result.modelOutput).toBe('');
    expect(result.detail).toContain('fetch error: network down');
    expect(jest.getTimerCount()).toBe(0);
  });
});