import { Evaluator } from '../src/core/evaluator';
import { LLMAdapter } from '../src/adapters/adapter';
import { BenchmarkConfig, ModelConfig } from '../src/types';

interface FetchProcessAwareScoringSignature {
  fetchProcessAwareScoringScore: (
    apiBase: string,
    modelConfig: ModelConfig,
    timeoutMs: number,
    anchorScore?: number,
    subset?: string,
    mode?: string,
    agenticBenchmark?: string,
    passFailWeight?: number,
    processWeight?: number,
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

describe('fetchProcessAwareScoringScore runtime coverage', () => {
  const model: ModelConfig = {
    name: 'process-aware-test-model',
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
  const originalWarn = console.warn;

  const invoke = async (
    apiBase: string,
    timeoutMs = 30000,
    anchorScore?: number,
    subset?: string,
    mode?: string,
    agenticBenchmark?: string,
    passFailWeight?: number,
    processWeight?: number,
    dispatchType?: string,
  ) => {
    const evaluator = new Evaluator(config, adapter) as unknown as FetchProcessAwareScoringSignature;
    return evaluator.fetchProcessAwareScoringScore(
      apiBase,
      model,
      timeoutMs,
      anchorScore,
      subset,
      mode,
      agenticBenchmark,
      passFailWeight,
      processWeight,
      dispatchType,
    );
  };

  beforeEach(() => {
    console.warn = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    console.warn = originalWarn;
  });

  it('uses the server composite score and reports every process signal', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        process_score: 72.45,
        pass_rate: 0.8,
        commit_count: 4,
        test_run_count: 7,
        retry_count: 2,
        file_coverage: 0.875,
        trajectory_score: 55.5,
        eval_id: 'process-eval-123',
      }),
    }) as typeof fetch;

    const result = await invoke('https://process.invalid/v1');

    expect(result).toMatchObject({
      questionId: 'process_aware_scoring_process-aware-test-model',
      category: 'process_aware_scoring',
      dimension: 'coding',
      score: 72.5,
    });
    expect(result.detail).toContain('process_aware_scoring[all_process_signals|all@swe_bench_pro]');
    expect(result.detail).toContain('score=72.5');
    expect(result.detail).toContain('commit=4/tests=7/retries=2/cov=87.5%/traj=55.5');
    expect(result.detail).toContain('eval_id=process-eval-123');
    expect(result.modelOutput).toContain('process-eval-123');
  });

  it('posts the complete explicit scoring configuration', async () => {
    let capturedUrl: string | undefined;
    let capturedInit: RequestInit | undefined;
    global.fetch = jest.fn().mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = url.toString();
      capturedInit = init;
      return {
        ok: true,
        json: async () => ({ process_score: 60 }),
      };
    }) as typeof fetch;

    const result = await invoke(
      'https://process-shape.invalid/v1',
      45000,
      undefined,
      'trajectory_only',
      'weighted',
      'terminal_bench',
      0.6,
      0.4,
      'eval_harness',
    );

    expect(capturedUrl).toBe('https://process-shape.invalid/v1');
    expect(capturedInit?.method).toBe('POST');
    expect((capturedInit?.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(JSON.parse(capturedInit?.body as string)).toEqual({
      api_base: 'https://model.invalid/v1',
      model_id: 'gpt-4o-mini',
      subset: 'trajectory_only',
      mode: 'weighted',
      agentic_benchmark: 'terminal_bench',
      pass_fail_weight: 0.6,
      process_weight: 0.4,
      timeout_ms: 45000,
      dispatch_type: 'eval_harness',
    });
    expect(result.dispatchType).toBe('eval_harness');
  });

  it('uses stable defaults when optional scoring configuration is omitted', async () => {
    let capturedInit: RequestInit | undefined;
    global.fetch = jest.fn().mockImplementation(async (_url: string | URL | Request, init?: RequestInit) => {
      capturedInit = init;
      return {
        ok: true,
        json: async () => ({ process_score: 50 }),
      };
    }) as typeof fetch;

    const result = await invoke('https://process.invalid/v1');
    const body = JSON.parse(capturedInit?.body as string);

    expect(body).toMatchObject({
      subset: 'all_process_signals',
      mode: 'all',
      agentic_benchmark: 'swe_bench_pro',
      pass_fail_weight: 0.7,
      process_weight: 0.3,
      timeout_ms: 30000,
    });
    expect(typeof body.dispatch_type).toBe('string');
    expect(body.dispatch_type.length).toBeGreaterThan(0);
    expect(result.dispatchType).toBe(body.dispatch_type);
  });

  it('falls back to client-side weighted scoring when process_score is absent', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ pass_rate: 0.8, trajectory_score: 50 }),
    }) as typeof fetch;

    const result = await invoke(
      'https://process.invalid/v1',
      30000,
      undefined,
      undefined,
      undefined,
      undefined,
      0.7,
      0.3,
    );

    expect(result.score).toBe(71);
    expect(result.detail).toContain('score=71.0');
    expect(result.detail).toContain('traj=50.0');
  });

  it('clamps server and client composite scores to the zero-to-one-hundred range', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ process_score: 140 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ process_score: -20 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ pass_rate: 2, trajectory_score: 200 }) });

    const above = await invoke('https://process.invalid/v1');
    const below = await invoke('https://process.invalid/v1');
    const fallbackAbove = await invoke('https://process.invalid/v1');

    expect(above.score).toBe(100);
    expect(below.score).toBe(0);
    expect(fallbackAbove.score).toBe(100);
  });

  it('appends an anchor warning only when score drift exceeds five points', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ process_score: 75 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ process_score: 40 }) });

    const near = await invoke('https://process.invalid/v1', 30000, 72);
    const far = await invoke('https://process.invalid/v1', 30000, 85);

    expect(near.detail).not.toContain('(anchor');
    expect(far.detail).toContain('(anchor ⚠️ 85)');
  });

  it('returns a zero score for a provider error payload', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ error: 'trajectory_unavailable' }),
    }) as typeof fetch;

    const result = await invoke('https://process.invalid/v1');

    expect(result.score).toBe(0);
    expect(result.detail).toBe('process_aware_scoring API error: trajectory_unavailable');
    expect(result.modelOutput).toBe('');
  });

  it('returns a bounded HTTP error detail for non-success responses', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'service unavailable',
    }) as typeof fetch;

    const result = await invoke('https://process.invalid/v1');

    expect(result.score).toBe(0);
    expect(result.detail).toBe('process_aware_scoring HTTP 503: service unavailable');
  });

  it('distinguishes timeout failures from other fetch failures', async () => {
    global.fetch = jest.fn()
      .mockRejectedValueOnce(new Error('The operation was aborted'))
      .mockRejectedValueOnce(new Error('socket closed')) as typeof fetch;

    const timedOut = await invoke('https://process.invalid/v1', 1);
    const failed = await invoke('https://process.invalid/v1', 1);

    expect(timedOut.score).toBe(0);
    expect(timedOut.detail).toBe('process_aware_scoring timeout after 1ms');
    expect(failed.score).toBe(0);
    expect(failed.detail).toBe('process_aware_scoring fetch error: socket closed');
  });
});
