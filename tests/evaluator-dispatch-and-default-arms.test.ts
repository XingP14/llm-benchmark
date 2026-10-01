// tests/evaluator-dispatch-and-default-arms.test.ts
//
// Closes dark branch arms in src/core/evaluator.ts (5c9b248) in the two shapes the
// first line-level dark-arm map for this file identified, built this tick:
//
//   (a) dispatchV050External's model_id filter (L1971) -- the predicate that
//       decides WHICH models are scored for an external benchmark at all, and
//       (b) the per-fetcher DEFAULT PARAMETER arms (subset/nativeEvals/
//       tasksTotal/mode/weights/task/cadence/contamination/anchorScore).
//
// WHY THIS IS PRODUCT BEHAVIOUR, NOT DEFENSIVE PADDING
//
// (a) L1971 is the whole of llm-benchmark's model_id routing feature. The
//     README documents configuring `model_id` to score a single model out of a
//     N-model config; if either comparison operand regressed, a run would
//     silently score the wrong models (or none) and the only symptom would be a
//     report missing a model. No existing suite drives the filter: every
//     evaluator-fetch-* suite calls the fetcher directly and the dispatch
//     suites inject their own dispatchV050External.
//
// (b) Every default-parameter arm is dark because every existing suite passes
//     the full positional argument list. So the value a caller receives when it
//     OMITS an argument is shipped behaviour that has never been executed
//     anywhere in the repo. These defaults are read from config into the POST
//     body that a real external benchmark endpoint receives, which makes them
//     the exact bytes a third-party service would see.
//
// The tests below drive the REAL private methods (exposed through a cast, the
// pattern from tests/evaluator-fetch-webdev-arena-score.test.ts) and the REAL
// dispatchV050External. Nothing here reimplements the logic under test -- a
// reimplementation would assert the test's own copy of the predicate and would
// close no coverage at all.
//
// NOT COVERED ON PURPOSE
//   - the `?? defaultDispatchType(benchmarkName)` operand at L1974 and the
//     `score.detail ?? 'no detail'` operand at L1976. Both are already exercised
//     on their primary arm by the 87 existing suites; the remaining arm is only
//     reachable through dispatchV050External, which needs a full run() with a
//     configured roadmap. Left for a dedicated dispatch tick.
//   - bootstrap95CI's `rng` default arm (L2012). It needs module re-evaluation
//     to reach, and its two sibling gates are already pinned by
//     tests/reporter-log-gate.test.ts / tests/evaluator-log-helpers.test.ts.
//
// PARALLELS
//   tests/evaluator-fetch-webdev-arena-score.test.ts  -- 8-case private fetcher
//   tests/evaluator-v050-dispatch-return-injection.test.ts
//   tests/reporter-log-gate.test.ts
//
// 0 production changes: this file adds tests only.

import { Evaluator } from '../src/core/evaluator';
import { LLMAdapter } from '../src/adapters/adapter';
import { BenchmarkConfig, EvaluationResult, ModelConfig, QuestionScore } from '../src/types';

const model: ModelConfig = {
  name: 'probe-model',
  endpoint: 'https://model.invalid/v1',
  apiKey: 'test-key',
  type: 'openai',
  model: 'probe-model-1',
};

const baseConfig: BenchmarkConfig = {
  models: [model],
  benchmarks: { dialogue: false, coding: false },
};

const adapter = {} as LLMAdapter;

const makeResult = (m: ModelConfig): EvaluationResult =>
  ({
    modelName: m.name,
    model: m,
    scores: [],
    totalScore: 0,
    dimensions: {},
    timestamp: new Date(0),
    duration: 0,
  }) as unknown as EvaluationResult;

const okScore = (): QuestionScore => ({
  questionId: 'q',
  category: 'webdev_arena',
  score: 1,
  dimension: 'coding',
  modelOutput: '',
});

/** Drive the real dispatchV050External through the real dispatchExternalCall. */
const dispatchThrough = async (
  cfg: Record<string, any>,
  results: EvaluationResult[],
  models: ModelConfig[],
): Promise<{ scored: string[]; fetchCalls: Array<{ model: string; dispatchType: string; apiBase: string; timeoutMs: number }> }> => {
  const config = {
    ...baseConfig,
    models,
    _external_benchmarks_roadmap: { webdev_arena: cfg },
  } as unknown as BenchmarkConfig;
  const ev = new Evaluator(config, adapter) as any;
  const fetchCalls: Array<{ model: string; dispatchType: string; apiBase: string; timeoutMs: number }> = [];
  await ev.dispatchExternalCall(results, 'webdev_arena', async (
    apiBase: string, m: ModelConfig, timeoutMs: number, dispatchType: string,
  ) => {
    fetchCalls.push({ model: m.name, dispatchType, apiBase, timeoutMs });
    return okScore();
  });
  return { scored: results.filter((r) => r.scores.length > 0).map((r) => r.modelName), fetchCalls };
};

describe('core/evaluator.ts (a) dispatchV050External model_id filter (L1971)', () => {
  const modelA: ModelConfig = { name: 'a', endpoint: 'https://a.invalid', apiKey: 'k', type: 'openai', model: 'a-v1' };
  const modelB: ModelConfig = { name: 'b', endpoint: 'https://b.invalid', apiKey: 'k', type: 'openai', model: 'b-v1' };

  it('model_id matching model.model: only that model is fetched and scored', async () => {
    const results = [makeResult(modelA), makeResult(modelB)];
    const { scored, fetchCalls } = await dispatchThrough({ enabled: true, model_id: 'a-v1' }, results, [modelA, modelB]);
    expect(fetchCalls.map((c) => c.model)).toEqual(['a']);
    expect(scored).toEqual(['a']);
    expect(results[0].scores).toHaveLength(1);
    expect(results[1].scores).toHaveLength(0);
  });

  it('model_id matching only modelName (model.model absent): still scored -- the second comparison operand', async () => {
    const nameOnly: ModelConfig = { name: 'named-only', endpoint: 'https://n.invalid', apiKey: 'k', type: 'openai' };
    const results = [makeResult(nameOnly)];
    const { fetchCalls } = await dispatchThrough({ enabled: true, model_id: 'named-only' }, results, [nameOnly]);
    expect(fetchCalls.map((c) => c.model)).toEqual(['named-only']);
    expect(results[0].scores).toHaveLength(1);
  });

  it('model_id matching nothing: no model is fetched or scored at all', async () => {
    const results = [makeResult(modelA), makeResult(modelB)];
    const { scored, fetchCalls } = await dispatchThrough({ enabled: true, model_id: 'nope' }, results, [modelA, modelB]);
    expect(fetchCalls).toHaveLength(0);
    expect(scored).toEqual([]);
    expect(results[0].scores).toHaveLength(0);
    expect(results[1].scores).toHaveLength(0);
  });

  it('model_id absent: every model is scored -- the first operand is a guard, not a filter', async () => {
    const results = [makeResult(modelA), makeResult(modelB)];
    const { scored, fetchCalls } = await dispatchThrough({ enabled: true }, results, [modelA, modelB]);
    expect(fetchCalls.map((c) => c.model).sort()).toEqual(['a', 'b']);
    expect(scored.sort()).toEqual(['a', 'b']);
    expect(results[0].scores).toHaveLength(1);
    expect(results[1].scores).toHaveLength(1);
  });

  it('model_id filter runs per result, and the api_base/timeout_ms defaults are applied on the scored path', async () => {
    const results = [makeResult(modelA)];
    const { fetchCalls } = await dispatchThrough({ enabled: true, model_id: 'a-v1' }, results, [modelA]);
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].apiBase).toBe('https://webdevarena.com/api/v1/eval');
    expect(fetchCalls[0].timeoutMs).toBe(30000);
  });
});

describe('core/evaluator.ts (b) per-fetcher default-argument arms', () => {
  const originalFetch = global.fetch;
  let lastBody: any = null;

  const mockOk = (body: Record<string, unknown>) => {
    global.fetch = jest.fn().mockImplementation(async (_url: any, init: RequestInit) => {
      lastBody = JSON.parse(String(init?.body));
      return { ok: true, json: async () => body };
    }) as unknown as typeof fetch;
  };

  afterEach(() => {
    global.fetch = originalFetch;
    lastBody = null;
    jest.useRealTimers();
  });

  const call = (fn: string, args: unknown[]) => {
    const ev = new Evaluator(baseConfig, adapter) as any;
    return ev[fn](...args);
  };

  it('swe_bench_pro: omitting subset and agenticMode yields "verified" and true in the POST body', async () => {
    mockOk({ pass_rate: 0.5, patch_score: 50, files_modified: 5 });
    const res = await call('fetchSweBenchProScore', ['https://swe.invalid', model, 30000, undefined]);
    expect(lastBody.subset).toBe('verified');
    expect(lastBody.agentic_mode).toBe(true);
    expect(res.detail).toContain('swe_bench_pro[verified]');
    expect(res.dispatchType).toBe('agentic_swe');
  });

  it('terminal_bench: omitting subset yields the default "full" in the POST body and the detail line', async () => {
    mockOk({ task_pass_rate: 0.4, avg_duration_s: 600 });
    const res = await call('fetchTerminalBenchScore', ['https://tb.invalid', model, 30000, undefined]);
    expect(lastBody.subset).toBe('full');
    expect(res.detail).toContain('terminal_bench[full]');
  });

  it('benchlm_agentic: omitting nativeEvals and subset yields false and "all"', async () => {
    mockOk({ agentic_pass_rate: 0.6, design2code_score: 40, vision2web_score: 40 });
    const res = await call('fetchBenchlmAgenticScore', ['https://bla.invalid', model, 30000, undefined]);
    expect(lastBody.subset).toBe('all');
    expect(lastBody.native_evals).toBe(false);
    expect(res.detail).not.toContain('subset=');
    expect(res.detail).not.toContain('native_evals=');
  });

  it('long_context_cluster: omitting tasksTotal yields the default 62 in the POST body', async () => {
    mockOk({ retrieval_accuracy: 0.7, context_recall: 0.8 });
    await call('fetchLongContextClusterScore', ['https://lcc.invalid', model, 30000, undefined]);
    expect(lastBody.tasks_total).toBe(62);
  });

  it('lm_eval_task_conflict_resolver: omitting mode and dependencyGroups yields dry_run and "all"', async () => {
    mockOk({ conflicts_detected: 2 });
    const res = await call('fetchLmEvalTaskConflictResolverScore', ['https://lmeval.invalid', model, 30000, undefined]);
    expect(lastBody.mode).toBe('dry_run');
    expect(lastBody.dependency_groups).toBe('all');
    expect(res.detail).toContain('conflicts=2');
  });

  it('livebench_2026_h1: omitting task, refreshCadence and contaminationCheck yields the documented defaults', async () => {
    mockOk({ livebench_score: 50 });
    const res = await call('fetchLiveBench2026H1QuarterlyV3Score', ['https://lb.invalid', model, 30000, undefined]);
    expect(lastBody.task).toBe('all');
    expect(lastBody.refresh_cadence).toBe('quarterly_3_5_month');
    expect(lastBody.contamination_check).toBe('enabled');
  });

  it('aa_omniscience: omitting anchorScore leaves the detail free of an anchor suffix', async () => {
    mockOk({ accuracy_score: 80, hallucination_rate: 0.1 });
    const res = await call('fetchAAOmniscienceScore', ['https://aa.invalid', model, 30000, undefined]);
    // 80 * 0.7 + (1 - 0.1) * 30 = 56 + 27 = 83
    expect(res.score).toBe(83);
    expect(res.detail).not.toContain('anchor');
  });

  it('process_aware_scoring: omitting the two weights yields 0.7 and 0.3 in the POST body', async () => {
    mockOk({ result_score: 50, process_score: 50 });
    await call('fetchProcessAwareScoringScore', ['https://pas.invalid', model, 30030000, undefined]);
    expect(lastBody.pass_fail_weight).toBe(0.7);
    expect(lastBody.process_weight).toBe(0.3);
  });
});

describe('core/evaluator.ts (c) typeof-number score-normalisation fallbacks', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
  });

  const mockOk = (body: Record<string, unknown>) => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => body }) as unknown as typeof fetch;
  };

  const call = (fn: string, args: unknown[]) => {
    const ev = new Evaluator(baseConfig, adapter) as any;
    return ev[fn](...args);
  };

  it('cyberseceval3: a missing safety_score defaults to 0 rather than NaN', async () => {
    mockOk({ coverage_rate: 0.5 });
    const res = await call('fetchCyberseceval3Score', ['https://cse.invalid', model, 30000, 'all-8', 'safety_evaluation']);
    // safety 0 * 0.7 + coverage 0.5 * 30 = 15
    expect(res.score).toBe(15);
    expect(res.detail).toContain('safety=0.0');
    expect(res.detail).toContain('coverage=50.0%');
  });

  it('cyberseceval3: a string-typed safety_score is rejected by the typeof guard and falls back to 0', async () => {
    mockOk({ safety_score: '80', coverage_rate: 0.5 });
    const res = await call('fetchCyberseceval3Score', ['https://cse.invalid', model, 30000, 'all-8', 'safety_evaluation']);
    // '80' is not a number -> 0, so 0 * 0.7 + 0.5 * 30 = 15
    expect(res.score).toBe(15);
    expect(res.detail).toContain('safety=0.0');
    expect(res.detail).toContain('coverage=50.0%');
  });

  it('cyberseceval3: a missing coverage_rate defaults to 0, dropping the score to zero', async () => {
    mockOk({ safety_score: 100 });
    const res = await call('fetchCyberseceval3Score', ['https://cse.invalid', model, 30000, 'all-8', 'safety_evaluation']);
    // 100 * 0.7 + 0 * 30 = 70
    expect(res.score).toBe(70);
    expect(res.detail).toContain('coverage=0.0%');
  });

  it('aa_omniscience: a null accuracy_score falls back to 0 instead of poisoning the sum', async () => {
    mockOk({ accuracy_score: null, hallucination_rate: 0.25 });
    const res = await call('fetchAAOmniscienceScore', ['https://aa.invalid', model, 30000, undefined]);
    // 0 * 0.7 + (1 - 0.25) * 30 = 22.5
    expect(res.score).toBe(22.5);
    expect(res.detail).toContain('accuracy=0.0');
    expect(res.detail).toContain('hallucination=25.0%');
  });

  it('aa_omniscience: a string-typed hallucination_rate falls back to 0, which is the optimistic direction', async () => {
    mockOk({ accuracy_score: 100, hallucination_rate: 'low' });
    const res = await call('fetchAAOmniscienceScore', ['https://aa.invalid', model, 30000, undefined]);
    // hallucination 0 -> (1 - 0) * 30 = 30, so 100 * 0.7 + 30 = 100, clamped at 100
    expect(res.score).toBe(100);
    expect(res.detail).toContain('hallucination=0.0%');
  });

  it('aa_omniscience: a string-typed accuracy_score falls back to 0, not to a string that would poison the arithmetic', async () => {
    mockOk({ accuracy_score: '80', hallucination_rate: 0.1 });
    const res = await call('fetchAAOmniscienceScore', ['https://aa.invalid', model, 30000, undefined]);
    // typeof guard rejects '80' -> 0, so 0 * 0.7 + 0.9 * 30 = 27.
    // A naive `|| 0` / `?? 0` rewrite would let '80' through and produce
    // 56 + 27 = 83, i.e. a fabricated score from a non-numeric field.
    expect(res.score).toBe(27);
    expect(res.detail).toContain('accuracy=0.0');
    expect(res.detail).toContain('hallucination=10.0%');
  });

  it('terminal_bench: a missing avg_duration_s defaults to the 3600s cap, zeroing the speed component', async () => {
    mockOk({ task_pass_rate: 1, avg_duration_s: undefined });
    const res = await call('fetchTerminalBenchScore', ['https://tb.invalid', model, 30000, undefined]);
    // 1 * 70 + (1 - 3600/3600) * 30 = 70
    expect(res.score).toBe(70);
    expect(res.detail).toContain('avg_duration=3600s');
  });
});
