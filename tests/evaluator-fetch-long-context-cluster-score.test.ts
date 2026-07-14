import { Evaluator } from '../src/core/evaluator';
import { LLMAdapter } from '../src/adapters/adapter';
import { BenchmarkConfig, ModelConfig } from '../src/types';

interface FetchLongContextClusterSignature {
  fetchLongContextClusterScore: (
    apiBase: string,
    modelConfig: ModelConfig,
    timeoutMs: number,
    anchorScore?: number,
    subset?: string,
    tasksTotal?: number,
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

describe('fetchLongContextClusterScore runtime coverage', () => {
  const model: ModelConfig = {
    name: 'long-context-cluster-test-model',
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
    tasksTotal?: number,
    dispatchType?: string,
  ) => {
    const evaluator = new Evaluator(config, adapter) as unknown as FetchLongContextClusterSignature;
    return evaluator.fetchLongContextClusterScore(
      apiBase,
      model,
      timeoutMs,
      anchorScore,
      subset,
      tasksTotal,
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

  it('combines pass rate and context efficiency and reports all benchmark anchors', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        subset_pass_rate: 0.8,
        tokens_used: 210000,
        task_count: 60,
        anchor_scores: {
          longbench_v2: 81.25,
          babilong: 72,
          infinitebench: 68.5,
          phonebook: 95,
        },
        eval_id: 'long-context-eval-123',
      }),
    }) as typeof fetch;

    const result = await invoke('https://long-context.invalid/v1');

    expect(result).toMatchObject({
      questionId: 'long_context_cluster_long-context-cluster-test-model',
      category: 'long_context_cluster',
      dimension: 'long_context',
      score: 80,
    });
    expect(result.detail).toContain('long_context_cluster[all] score=80.0');
    expect(result.detail).toContain('tasks=60/62');
    expect(result.detail).toContain('ctx=210000/1050000');
    expect(result.detail).toContain('[lb2=81.3/bab=72.0/inf=68.5/phb=95.0]');
    expect(result.detail).toContain('eval_id=long-context-eval-123');
    expect(result.modelOutput).toContain('long-context-eval-123');
  });

  it('posts the complete explicit dispatch payload', async () => {
    let capturedUrl: string | undefined;
    let capturedInit: RequestInit | undefined;
    global.fetch = jest.fn().mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = url.toString();
      capturedInit = init;
      return {
        ok: true,
        json: async () => ({ subset_pass_rate: 0.5, tokens_used: 525000, task_count: 20 }),
      };
    }) as typeof fetch;

    const result = await invoke(
      'https://long-context-shape.invalid/v1',
      45000,
      undefined,
      'longbench_v2',
      21,
      'eval_harness',
    );

    expect(capturedUrl).toBe('https://long-context-shape.invalid/v1');
    expect(capturedInit?.method).toBe('POST');
    expect((capturedInit?.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(JSON.parse(capturedInit?.body as string)).toEqual({
      api_base: 'https://model.invalid/v1',
      model_id: 'gpt-4o-mini',
      subset: 'longbench_v2',
      tasks_total: 21,
      timeout_ms: 45000,
      dispatch_type: 'eval_harness',
    });
    expect(result.dispatchType).toBe('eval_harness');
  });

  it('uses stable subset, task-count, and dispatch defaults', async () => {
    let capturedInit: RequestInit | undefined;
    global.fetch = jest.fn().mockImplementation(async (_url: string | URL | Request, init?: RequestInit) => {
      capturedInit = init;
      return {
        ok: true,
        json: async () => ({ subset_pass_rate: 0.5, tokens_used: 525000 }),
      };
    }) as typeof fetch;

    const result = await invoke('https://long-context.invalid/v1');
    const body = JSON.parse(capturedInit?.body as string);

    expect(body).toMatchObject({
      subset: 'all',
      tasks_total: 62,
      timeout_ms: 30000,
    });
    expect(typeof body.dispatch_type).toBe('string');
    expect(body.dispatch_type.length).toBeGreaterThan(0);
    expect(result.dispatchType).toBe(body.dispatch_type);
    expect(result.detail).toContain('tasks=62');
  });

  it('caps token usage at the 1.05M context limit for scoring', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ subset_pass_rate: 1, tokens_used: 2100000, task_count: 62 }),
    }) as typeof fetch;

    const result = await invoke('https://long-context.invalid/v1');

    expect(result.score).toBe(70);
    expect(result.detail).toContain('ctx=2100000/1050000');
  });

  it('uses zero-valued response defaults without producing an out-of-range score', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    }) as typeof fetch;

    const result = await invoke('https://long-context.invalid/v1');

    expect(result.score).toBe(30);
    expect(result.detail).toContain('ctx=0/1050000');
    expect(result.detail).toContain('tasks=62');
  });

  it('appends an anchor warning only when score drift exceeds five points', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ subset_pass_rate: 0.8, tokens_used: 210000 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ subset_pass_rate: 0.2, tokens_used: 1050000 }) });

    const near = await invoke('https://long-context.invalid/v1', 30000, 83);
    const far = await invoke('https://long-context.invalid/v1', 30000, 80);

    expect(near.score).toBe(80);
    expect(near.detail).not.toContain('(anchor');
    expect(far.score).toBe(14);
    expect(far.detail).toContain('(anchor ⚠️ 80)');
  });

  it('returns a zero score for a provider error payload', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ error: 'dataset_unavailable' }),
    }) as typeof fetch;

    const result = await invoke('https://long-context.invalid/v1');

    expect(result.score).toBe(0);
    expect(result.detail).toBe('long_context_cluster API error: dataset_unavailable');
    expect(result.modelOutput).toBe('');
  });

  it('returns a bounded HTTP error detail for non-success responses', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'service unavailable',
    }) as typeof fetch;

    const result = await invoke('https://long-context.invalid/v1');

    expect(result.score).toBe(0);
    expect(result.detail).toBe('long_context_cluster HTTP 503: service unavailable');
  });

  it('distinguishes timeout failures from other fetch failures', async () => {
    global.fetch = jest.fn()
      .mockRejectedValueOnce(new Error('The operation was aborted'))
      .mockRejectedValueOnce(new Error('socket closed')) as typeof fetch;

    const timedOut = await invoke('https://long-context.invalid/v1', 1);
    const failed = await invoke('https://long-context.invalid/v1', 1);

    expect(timedOut.score).toBe(0);
    expect(timedOut.detail).toBe('long_context_cluster timeout after 1ms');
    expect(failed.score).toBe(0);
    expect(failed.detail).toBe('long_context_cluster fetch error: socket closed');
  });
});
