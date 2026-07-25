import { Evaluator } from '../src/core/evaluator';
import { LLMAdapter } from '../src/adapters/adapter';
import { BenchmarkConfig, ExternalDispatchType, ModelConfig } from '../src/types';

interface StirrupFetcher {
  fetchArtificialAnalysisStirrupAgentFrameworkV1Score(
    apiBase: string, model: ModelConfig, timeoutMs: number, anchorScore?: number,
    language?: string, frameworkRole?: string, dispatchType?: ExternalDispatchType,
  ): Promise<{ questionId: string; category: string; score: number; dimension: string; modelOutput: string; detail?: string; dispatchType?: ExternalDispatchType }>;
}

describe('Artificial Analysis Stirrup agent framework v1 real fetch', () => {
  const model: ModelConfig = { name: 'stirrup-model', endpoint: 'https://model.invalid/v1', apiKey: 'test', type: 'openai', model: 'gpt-5.5' };
  const config: BenchmarkConfig = { models: [model], benchmarks: { dialogue: false, coding: false } };
  const originalFetch = global.fetch;
  const invoke = (anchor?: number, language?: string, role?: string, dispatchType?: ExternalDispatchType) =>
    (new Evaluator(config, {} as LLMAdapter) as unknown as StirrupFetcher)
      .fetchArtificialAnalysisStirrupAgentFrameworkV1Score(
        'https://api.artificialanalysis.ai/v1/stirrup/v1/agent',
        model,
        30000,
        anchor,
        language,
        role,
        dispatchType,
      );

  afterEach(() => { global.fetch = originalFetch; });

  it('posts framework request and parses capability score and cross-language metadata', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ framework_name: 'Stirrup', language: 'python', agent_capability_score: 86.27, cross_lang_compat: true, eval_model: 'gpt-5.5', release_date: '2026-06-09' }) });
    const result = await invoke(undefined, 'all', 'agent_builder');
    expect(result.score).toBe(86.3);
    expect(result.category).toBe('artificial_analysis_stirrup_agent_framework_v1');
    expect(result.detail).toContain('framework=Stirrup');
    expect(result.detail).toContain('cross_lang=true');
    const request = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(request).toEqual(expect.objectContaining({ api_base: model.endpoint, model_id: 'gpt-5.5', language: 'all', framework_role: 'agent_builder', cross_language: true, timeout_ms: 30000, dispatch_type: 'agentic_coding' }));
  });

  it('clamps score and reports anchor mismatch', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ framework_name: 'StirrupJS', language: 'typescript', agent_capability_score: 110, cross_lang_compat: false }) });
    const result = await invoke(80, 'typescript', 'both');
    expect(result.score).toBe(100);
    expect(result.detail).toContain('anchor ⚠️ 80');
  });

  it('uses an explicit dispatch type in the request and result', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ agent_capability_score: 75 }) });
    const result = await invoke(undefined, 'python', 'agent_evaluator', 'agentic_fullstack');
    const request = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(request.dispatch_type).toBe('agentic_fullstack');
    expect(result.dispatchType).toBe('agentic_fullstack');
  });

  it('returns zero for API error', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ error: 'evaluation failed' }) });
    expect((await invoke()).detail).toContain('API error: evaluation failed');
  });

  it('returns zero for HTTP errors', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503, text: async () => 'unavailable' });
    const result = await invoke();
    expect(result.score).toBe(0);
    expect(result.detail).toContain('HTTP 503');
  });

  it('returns zero for fetch rejection', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down'));
    const result = await invoke();
    expect(result.score).toBe(0);
    expect(result.detail).toContain('fetch error');
  });
});
