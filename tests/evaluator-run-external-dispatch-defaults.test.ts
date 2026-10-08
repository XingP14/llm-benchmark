// tests/evaluator-run-external-dispatch-defaults.test.ts
//
// WHY THIS FILE EXISTS
//
// src/core/evaluator.ts run() ends with 12 `await this.dispatchExternalCall(results, '<name>', ...)`
// sites. Each site's fetcher is a CLOSURE that curries per-benchmark config defaults into the
// private fetcher: `cfg.subset ?? defaultSubset('swe_bench_pro')`,
// `cfg.agentic_mode !== false`, `cfg.pass_fail_weight ?? 0.7`, `cfg.mode ?? 'all'`, ... Those are
// the exact bytes a third-party benchmark endpoint receives in the POST body.
//
// Measured 2026-10-09 (coverage run on 5f78d1c, coverage/coverage-final.json):
// 33 of 79 functions in core/evaluator.ts had count 0, and 31 of them are those closures
// (decl lines 477, 490, 503, 516, 538, 560, 579, 592, 625, 634, 711, 720, 800, 809, 892, 901,
// 985, 994, 1087, 1096, 1197, 1206, 1305, 1314, 1432, 1441, 1540, 1549, 1627, 1631, 1675, 1679),
// plus dispatchExternalBenchmark (1903, the 0-caller back-compat alias).
// Why they were dark: every existing suite that reaches run() (evaluator-fetch-webdev-arena-score,
// evaluator-livebench-2026-h1-quarterly-v3-real-fetch) enables exactly ONE benchmark, so the
// other 11 closures are declared-but-never-invoked. A second-order set of closures INSIDE the
// fetchers (`const timer = setTimeout(...)`, `await resp.text().catch(...)`) is dark for the
// benchmarks no run() test enables.
//
// PARALLELS / PITFALL #155
// tests/evaluator-dispatch-and-default-arms.test.ts proves the default ARMS of each fetcher by
// calling the fetcher DIRECTLY, bypassing the closure. That suite is correct about the fetcher and
// silent about the closure -- the same shape as pitfall #155 (a parity suite that drives only one
// caller hides the other's arm). This file drives the OTHER side: the closure, through the real
// run(), for all 12 benchmarks at once.
//
// WHAT IS ASSERTED
// For a config that enables a benchmark with NO optional fields (the minimal `{ enabled: true }`
// a user actually writes), every recorded POST body carries the documented default, and the URL is
// the DEFAULT_API_BASE entry. These defaults are shipped behaviour with no other execution path:
// nothing else in the repo constructs these bodies.
//
// 0 production changes.

import { Evaluator } from '../src/core/evaluator';
import { LLMAdapter } from '../src/adapters/adapter';
import { BenchmarkConfig, ModelConfig } from '../src/types';

const BENCHMARKS = [
  'webdev_arena',
  'cyberseceval3',
  'aa_omniscience',
  'terminal_bench',
  'benchlm_agentic',
  'swe_bench_pro',
  'process_aware_scoring',
  'long_context_cluster',
  'lm_eval_task_conflict_resolver',
  'livebench_2026_h1_quarterly_v3',
  'artificial_analysis_stirrup_agent_framework_v1',
  'aa_agentperf_v2_agentic_workloads',
] as const;

type BenchmarkName = (typeof BENCHMARKS)[number];

interface Recorded {
  url: string;
  body: Record<string, any>;
}

/**
 * The URLs the product is documented to POST to, written out here as LITERALS on purpose.
 *
 * This table used to be `DEFAULT_API_BASE[name]`, imported from the module under test. That made
 * the url assertion tautological: mutating an entry in DEFAULT_API_BASE moved the expectation to
 * match the mutation, and mutation arm M14 (webdev_arena url -> /eval-v2) survived 16/16 green.
 * A pin that reads its expected value from the code it pins cannot fail.
 *
 * Every value below was read off src/core/evaluator.ts DEFAULT_API_BASE on 2026-10-09 and is now
 * pinned independently. Parity with the map is additionally asserted by
 * tests/config-example-external-benchmarks-roadmap-parity.test.ts and this suite's own
 * `DEFAULT_API_BASE stays in step with this table` case, which fails if a new benchmark is added
 * to the map without being pinned here.
 */
const EXPECTED_API_BASE: Record<BenchmarkName, string> = {
  webdev_arena: 'https://webdevarena.com/api/v1/eval',
  cyberseceval3: 'https://llm-benchmark.local/api/v1/cyberseceval3/v3',
  aa_omniscience: 'https://llm-benchmark.local/api/v1/aa_omniscience/v1',
  terminal_bench: 'https://llm-benchmark.local/api/v1/terminal_bench/v2',
  benchlm_agentic: 'https://llm-benchmark.local/api/v1/benchlm_agentic/v1',
  swe_bench_pro: 'https://llm-benchmark.local/api/v1/swe_bench_pro/v1',
  process_aware_scoring: 'https://llm-benchmark.local/api/v1/process_aware_scoring/v1',
  long_context_cluster: 'https://llm-benchmark.local/api/v1/long_context_cluster/v1',
  lm_eval_task_conflict_resolver:
    'https://llm-benchmark.local/api/v1/lm_eval_task_conflict_resolver/v1',
  livebench_2026_h1_quarterly_v3: 'https://api.livebench.ai/v1/refresh/v3',
  artificial_analysis_stirrup_agent_framework_v1:
    'https://api.artificialanalysis.ai/v1/stirrup/v1/agent',
  aa_agentperf_v2_agentic_workloads: 'https://api.artificialanalysis.ai/api/v1/agentperf/v2',
};

const model: ModelConfig = {
  name: 'run-defaults-model',
  endpoint: 'https://model.invalid/v1',
  apiKey: 'test-key',
  type: 'openai',
  model: 'run-defaults-1',
};

/** A config with NO benchmark questions: run() must reach the dispatch tail without touching the adapter. */
const baseConfig: BenchmarkConfig = {
  models: [model],
  benchmarks: { dialogue: false, coding: false },
};

const adapter = {} as LLMAdapter;

const originalFetch = global.fetch;
let recorded: Recorded[] = [];

const mockFetch = () => {
  recorded = [];
  global.fetch = jest.fn().mockImplementation(async (url: any, init: RequestInit) => {
    recorded.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return {
      ok: true,
      status: 200,
      json: async () => ({}),
      text: async () => '',
    };
  }) as unknown as typeof fetch;
};

/** Enable every external benchmark with the minimal `{ enabled: true }` a user would write. */
const allEnabledConfig = (models: ModelConfig[] = [model]): BenchmarkConfig =>
  ({
    ...baseConfig,
    models,
    _external_benchmarks_roadmap: Object.fromEntries(
      BENCHMARKS.map((name) => [name, { enabled: true }]),
    ),
  }) as unknown as BenchmarkConfig;

const runAll = async (config: BenchmarkConfig) => {
  const results = await new Evaluator(config, adapter).run();
  return {
    results,
    categories: results.flatMap((r) => r.scores.map((s) => s.category)).sort(),
  };
};

const bodyFor = (name: BenchmarkName): Record<string, any> => {
  const hit = recorded.find((r) => r.url === EXPECTED_API_BASE[name]);
  expect(hit).toBeDefined();
  return hit!.body;
};

afterEach(() => {
  global.fetch = originalFetch;
  recorded = [];
});

describe('run() dispatch closures: the minimal `{enabled:true}` config', () => {
  it('scores every one of the 12 benchmarks exactly once', async () => {
    mockFetch();
    const { categories } = await runAll(allEnabledConfig());
    expect(categories).toEqual([...BENCHMARKS].sort());
    expect(recorded).toHaveLength(BENCHMARKS.length);
  });

  it('uses the documented default url for every benchmark (cfg.api_base absent)', async () => {
    mockFetch();
    await runAll(allEnabledConfig());
    expect(recorded.map((r) => r.url).sort()).toEqual(
      BENCHMARKS.map((n) => EXPECTED_API_BASE[n]).sort(),
    );
  });

  it('DEFAULT_API_BASE in the module under test still matches the pinned table', async () => {
    // Guards the pin itself: a new benchmark added to the map but not to EXPECTED_API_BASE
    // fails here instead of silently escaping the per-benchmark bodies.
    const { DEFAULT_API_BASE } = require('../src/core/evaluator');
    expect(Object.keys(DEFAULT_API_BASE).sort()).toEqual([...BENCHMARKS].sort());
    for (const name of BENCHMARKS) {
      expect(DEFAULT_API_BASE[name]).toBe(EXPECTED_API_BASE[name]);
    }
  });

  it('forwards the unified 30000ms timeout default into every body', async () => {
    mockFetch();
    await runAll(allEnabledConfig());
    for (const name of BENCHMARKS) {
      expect(bodyFor(name).timeout_ms).toBe(30000);
    }
  });
});

describe('run() dispatch closures: per-benchmark config default arms', () => {
  beforeEach(() => mockFetch());

  it('cyberseceval3: risk_categories absent -> "all-8" in the body', async () => {
    await runAll(allEnabledConfig());
    expect(bodyFor('cyberseceval3').risk_categories).toBe('all-8');
  });

  it('terminal_bench: subset absent -> "full"', async () => {
    await runAll(allEnabledConfig());
    expect(bodyFor('terminal_bench').subset).toBe('full');
  });

  it('benchlm_agentic: native_evals absent -> false, subset absent -> "all"', async () => {
    await runAll(allEnabledConfig());
    expect(bodyFor('benchlm_agentic').native_evals).toBe(false);
    expect(bodyFor('benchlm_agentic').subset).toBe('all');
  });

  it('swe_bench_pro: subset absent -> "verified", agentic_mode absent -> true', async () => {
    await runAll(allEnabledConfig());
    expect(bodyFor('swe_bench_pro').subset).toBe('verified');
    expect(bodyFor('swe_bench_pro').agentic_mode).toBe(true);
  });

  it('process_aware_scoring: mode "all", agentic_benchmark, weights 0.7/0.3, subset "all_process_signals"', async () => {
    await runAll(allEnabledConfig());
    const body = bodyFor('process_aware_scoring');
    expect(body.subset).toBe('all_process_signals');
    expect(body.mode).toBe('all');
    expect(body.agentic_benchmark).toBe('swe_bench_pro');
    expect(body.pass_fail_weight).toBe(0.7);
    expect(body.process_weight).toBe(0.3);
  });

  it('long_context_cluster: subset "all", tasks_total 62', async () => {
    await runAll(allEnabledConfig());
    expect(bodyFor('long_context_cluster').subset).toBe('all');
    expect(bodyFor('long_context_cluster').tasks_total).toBe(62);
  });

  it('lm_eval_task_conflict_resolver: mode "dry_run", dependency_groups "all"', async () => {
    await runAll(allEnabledConfig());
    const body = bodyFor('lm_eval_task_conflict_resolver');
    expect(body.mode).toBe('dry_run');
    expect(body.dependency_groups).toBe('all');
  });

  it('livebench_2026_h1_quarterly_v3: task "all", quarterly cadence, contamination check on', async () => {
    await runAll(allEnabledConfig());
    const body = bodyFor('livebench_2026_h1_quarterly_v3');
    expect(body.task).toBe('all');
    expect(body.refresh_cadence).toBe('quarterly_3_5_month');
    expect(body.contamination_check).toBe('enabled');
  });

  it('artificial_analysis_stirrup: language "all", role "agent_builder", cross_language true', async () => {
    await runAll(allEnabledConfig());
    const body = bodyFor('artificial_analysis_stirrup_agent_framework_v1');
    expect(body.language).toBe('all');
    expect(body.framework_role).toBe('agent_builder');
    expect(body.cross_language).toBe(true);
  });

  it('aa_agentperf_v2: 32 agents, single session, blackwell_gb300, agentic_coding workload', async () => {
    await runAll(allEnabledConfig());
    const body = bodyFor('aa_agentperf_v2_agentic_workloads');
    expect(body.agent_count).toBe(32);
    expect(body.session_mode).toBe('single');
    expect(body.gpu_hardware).toBe('blackwell_gb300');
    expect(body.workload).toBe('agentic_coding');
  });

  it('every dispatch body names the model via model.model', async () => {
    await runAll(allEnabledConfig());
    for (const name of BENCHMARKS) {
      expect(bodyFor(name).model_id).toBe('run-defaults-1');
      expect(bodyFor(name).api_base).toBe('https://model.invalid/v1');
    }
  });
});

describe('run() dispatch closures: the `model.model ?? model.name` fallback', () => {
  it('a model configured without `model` posts its NAME as model_id', async () => {
    const nameOnly: ModelConfig = {
      name: 'name-only-model',
      endpoint: 'https://name-only.invalid/v1',
      apiKey: 'test-key',
      type: 'openai',
    };
    mockFetch();
    const { categories } = await runAll(allEnabledConfig([nameOnly]));
    expect(categories).toEqual([...BENCHMARKS].sort());
    for (const name of BENCHMARKS) {
      expect(bodyFor(name).model_id).toBe('name-only-model');
    }
  });
});

describe('run() dispatch closures: enabled=false keeps a benchmark dark', () => {
  it('one disabled benchmark is neither fetched nor scored, the other 11 are', async () => {
    mockFetch();
    const cfg = allEnabledConfig();
    (cfg._external_benchmarks_roadmap as Record<string, any>).aa_agentperf_v2_agentic_workloads = {
      enabled: false,
    };
    const { categories } = await runAll(cfg);
    expect(categories).not.toContain('aa_agentperf_v2_agentic_workloads');
    expect(categories).toHaveLength(BENCHMARKS.length - 1);
    expect(recorded.some((r) => r.url === EXPECTED_API_BASE.aa_agentperf_v2_agentic_workloads)).toBe(false);
  });
});