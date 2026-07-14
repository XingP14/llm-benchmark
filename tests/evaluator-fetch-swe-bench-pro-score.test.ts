import { Evaluator } from '../src/core/evaluator';
import { LLMAdapter } from '../src/adapters/adapter';
import { BenchmarkConfig, ModelConfig } from '../src/types';

interface FetchSweBenchProSignature {
  fetchSweBenchProScore: (
    apiBase: string,
    modelConfig: ModelConfig,
    timeoutMs: number,
    anchorScore?: number,
    subset?: string,
    agenticMode?: boolean,
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

describe('fetchSweBenchProScore runtime coverage', () => {
  const model: ModelConfig = {
    name: 'swe-bench-pro-test-model',
    endpoint: 'https://model.invalid/v1',
    apiKey: 'test-api-key',
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
    agenticMode?: boolean,
    dispatchType?: string,
  ) => {
    const evaluator = new Evaluator(config, adapter) as unknown as FetchSweBenchProSignature;
    return evaluator.fetchSweBenchProScore(
      apiBase,
      model,
      timeoutMs,
      anchorScore,
      subset,
      agenticMode,
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

  it('normalizes pass rate, patch score, and modified files in agentic mode', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        pass_rate: 0.6,
        patch_score: 80,
        files_modified: 25,
        eval_id: 'swe-eval-123',
      }),
    }) as typeof fetch;

    const result = await invoke('https://swe.invalid/v1');

    expect(result).toMatchObject({
      questionId: 'swe_bench_pro_swe-bench-pro-test-model',
      category: 'swe_bench_pro',
      dimension: 'coding',
      score: 63,
    });
    expect(result.detail).toContain('swe_bench_pro[verified]');
    expect(result.detail).toContain('pass_rate=60.0%');
    expect(result.detail).toContain('patch=80.0');
    expect(result.detail).toContain('files_modified=25');
    expect(result.detail).toContain('eval_id=swe-eval-123');
    expect(result.modelOutput).toContain('swe-eval-123');
  });

  it('posts the complete explicit dispatch payload', async () => {
    let capturedUrl: string | undefined;
    let capturedInit: RequestInit | undefined;
    global.fetch = jest.fn().mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = url.toString();
      capturedInit = init;
      return {
        ok: true,
        json: async () => ({ pass_rate: 0.5, patch_score: 50, files_modified: 10 }),
      };
    }) as typeof fetch;

    const result = await invoke('https://swe-shape.invalid/v1', 45000, undefined, 'lite', false, 'eval_harness');

    expect(capturedUrl).toBe('https://swe-shape.invalid/v1');
    expect(capturedInit?.method).toBe('POST');
    expect((capturedInit?.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(JSON.parse(capturedInit?.body as string)).toEqual({
      api_base: 'https://model.invalid/v1',
      model_id: 'gpt-4o-mini',
      timeout_ms: 45000,
      subset: 'lite',
      agentic_mode: false,
      dispatch_type: 'eval_harness',
    });
    expect(result.dispatchType).toBe('eval_harness');
  });

  it('uses verified subset, agentic mode, and a non-empty default dispatch type', async () => {
    let capturedInit: RequestInit | undefined;
    global.fetch = jest.fn().mockImplementation(async (_url: string | URL | Request, init?: RequestInit) => {
      capturedInit = init;
      return {
        ok: true,
        json: async () => ({ pass_rate: 0.5, patch_score: 50, files_modified: 10 }),
      };
    }) as typeof fetch;

    const result = await invoke('https://swe.invalid/v1');
    const body = JSON.parse(capturedInit?.body as string);

    expect(body.subset).toBe('verified');
    expect(body.agentic_mode).toBe(true);
    expect(typeof body.dispatch_type).toBe('string');
    expect(body.dispatch_type.length).toBeGreaterThan(0);
    expect(result.dispatchType).toBe(body.dispatch_type);
  });

  it('uses pass rate only when agentic mode is disabled', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ pass_rate: 0.83, patch_score: 5, files_modified: 1 }),
    }) as typeof fetch;

    const result = await invoke('https://swe.invalid/v1', 30000, undefined, 'verified', false);

    expect(result.score).toBe(83);
    expect(result.detail).toContain('verified (non-agentic)');
  });

  it('caps files_modified at 50 before applying its score component', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ pass_rate: 0.5, patch_score: 50, files_modified: 500 }),
    }) as typeof fetch;

    const result = await invoke('https://swe.invalid/v1');

    expect(result.score).toBe(55);
    expect(result.detail).toContain('files_modified=50');
    expect(result.detail).not.toContain('files_modified=500');
  });

  it('appends an anchor warning only when score drift exceeds five points', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ pass_rate: 0.5, patch_score: 50, files_modified: 25 }),
    }) as typeof fetch;

    const near = await invoke('https://swe.invalid/v1', 30000, 52);
    const far = await invoke('https://swe.invalid/v1', 30000, 90);

    expect(near.score).toBe(50);
    expect(near.detail).not.toContain('(anchor');
    expect(far.detail).toContain('(anchor ⚠️ 90)');
  });

  it('returns a zero score for a provider error payload', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ error: 'rate_limited' }),
    }) as typeof fetch;

    const result = await invoke('https://swe.invalid/v1');

    expect(result.score).toBe(0);
    expect(result.detail).toBe('swe_bench_pro API error: rate_limited');
    expect(result.modelOutput).toBe('');
  });

  it('returns a bounded HTTP error detail for non-success responses', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'service unavailable',
    }) as typeof fetch;

    const result = await invoke('https://swe.invalid/v1');

    expect(result.score).toBe(0);
    expect(result.detail).toBe('swe_bench_pro HTTP 503: service unavailable');
  });

  it('maps an aborted fetch to the timeout detail', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('The operation was aborted')) as typeof fetch;

    const result = await invoke('https://swe.invalid/v1', 1);

    expect(result.score).toBe(0);
    expect(result.detail).toBe('swe_bench_pro timeout after 1ms');
  });
});
