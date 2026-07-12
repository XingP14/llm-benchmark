import { Evaluator } from '../src/core/evaluator';
import { LLMAdapter } from '../src/adapters/adapter';
import { BenchmarkConfig, ModelConfig } from '../src/types';

describe('fetchLmEvalTaskConflictResolverScore timer cleanup', () => {
  const model: ModelConfig = {
    name: 'timer-cleanup-model',
    endpoint: 'https://model.invalid/v1',
    apiKey: 'test-only',
    type: 'openai',
  };

  const config: BenchmarkConfig = {
    models: [model],
    benchmarks: { dialogue: false, coding: false },
  };

  const adapter = {} as LLMAdapter;
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('clears the abort timer when fetch rejects before a response exists', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as typeof fetch;
    const evaluator = new Evaluator(config, adapter) as unknown as {
      fetchLmEvalTaskConflictResolverScore: (
        apiBase: string,
        modelConfig: ModelConfig,
        timeoutMs: number,
      ) => Promise<{ score: number; detail?: string }>;
    };

    const result = await evaluator.fetchLmEvalTaskConflictResolverScore(
      'https://resolver.invalid/v1',
      model,
      30_000,
    );

    expect(result.score).toBe(0);
    expect(result.detail).toContain('fetch error: network down');
    expect(jest.getTimerCount()).toBe(0);
  });
});
