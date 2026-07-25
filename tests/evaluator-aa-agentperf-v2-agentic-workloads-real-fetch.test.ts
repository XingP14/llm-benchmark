import { Evaluator } from '../src/core/evaluator';
import { LLMAdapter } from '../src/adapters/adapter';
import { BenchmarkConfig, ExternalDispatchType, ModelConfig } from '../src/types';

interface AgentPerfV2Fetcher {
  fetchAaAgentperfV2AgenticWorkloadsScore(
    apiBase: string, model: ModelConfig, timeoutMs: number, anchorScore?: number,
    agentCount?: number, sessionMode?: string, gpuHardware?: string, workload?: string,
    dispatchType?: ExternalDispatchType,
  ): Promise<{ questionId: string; category: string; score: number; dimension: string; modelOutput: string; detail?: string; dispatchType?: ExternalDispatchType }>;
}

describe('AA-AgentPerf v2 agentic workloads real fetch (step-v6.0-16 chain #22 12th fetcher)', () => {
  const model: ModelConfig = { name: 'agentperf-model', endpoint: 'https://model.invalid/v1', apiKey: '***', type: 'openai', model: 'gpt-5.5' };
  const config: BenchmarkConfig = { models: [model], benchmarks: { dialogue: false, coding: false } };
  const originalFetch = global.fetch;
  const invoke = (anchor?: number, agentCount?: number, sessionMode?: string, gpu?: string, workload?: string, dispatchType?: ExternalDispatchType) =>
    (new Evaluator(config, {} as LLMAdapter) as unknown as AgentPerfV2Fetcher)
      .fetchAaAgentperfV2AgenticWorkloadsScore(
        'https://api.artificialanalysis.ai/api/v1/agentperf/v2',
        model,
        60000,
        anchor,
        agentCount,
        sessionMode,
        gpu,
        workload,
        dispatchType,
      );

  afterEach(() => { global.fetch = originalFetch; });

  it('posts agentperf request and parses active agents + perf/MW + Blackwell GB300 metadata', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ active_agents_supported: 32, concurrent_sessions: 64, gpu_utilization_pct: 95.5, perf_per_mw: 18.4, model_id: 'gpt-5.5', gpu_hardware: 'blackwell_gb300', eval_id: 'aa-agentperf-v2-2026-06' }) });
    const result = await invoke(undefined, 32, 'concurrent', 'blackwell_gb300', 'agentic_coding');
    // Score formula: 32/64 * 90 + min(10, 18.4/2) = 45 + 9.2 = 54.2
    expect(result.score).toBe(54.2);
    expect(result.category).toBe('aa_agentperf_v2_agentic_workloads');
    expect(result.dimension).toBe('coding');
    expect(result.detail).toContain('agents=32');
    expect(result.detail).toContain('gpu_util=95.5%');
    expect(result.detail).toContain('perf/MW=18.4');
    expect(result.detail).toContain('eval_id=aa-agentperf-v2-2026-06');
    const request = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(request).toEqual(expect.objectContaining({ api_base: model.endpoint, model_id: 'gpt-5.5', agent_count: 32, session_mode: 'concurrent', gpu_hardware: 'blackwell_gb300', workload: 'agentic_coding', timeout_ms: 60000, dispatch_type: 'agentic_coding' }));
  });

  it('clamps active_agents to 0..64 and caps score at 100', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ active_agents_supported: 100, perf_per_mw: 50 }) });
    const result = await invoke();
    // Score formula: min(64, 100)/64 * 90 + min(10, 50/2) = 90 + 10 = 100
    expect(result.score).toBe(100);
  });

  it('returns zero for API error', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ error: 'gpu hardware unavailable' }) });
    expect((await invoke()).detail).toContain('API error: gpu hardware unavailable');
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

  it('uses an explicit dispatch type in the request and result', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ active_agents_supported: 16, perf_per_mw: 9 }) });
    const result = await invoke(undefined, 16, 'single', 'hgx_h200', 'research_coding', 'agentic_swe');
    const request = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(request.dispatch_type).toBe('agentic_swe');
    expect(result.dispatchType).toBe('agentic_swe');
    // context shows the gpu and workload
    expect(result.detail).toContain('gpu=hgx_h200');
    expect(result.detail).toContain('workload=research_coding');
  });

  it('reports anchor mismatch when score diverges from anchor by >5', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ active_agents_supported: 4, perf_per_mw: 1 }) });
    // 4/64*90 + 1/2 = 5.625 + 0.5 = 6.1 — anchor 80 should mismatch
    const result = await invoke(80, 4);
    expect(result.detail).toContain('anchor ⚠️ 80');
  });
});