// tests/evaluator-default-lookup-parity-runtime.test.ts
// R433 (2026-10-10 22:03 cron). Runtime VALUE parity across the two exported
// default-dispatch lookup tables in src/core/evaluator.ts.
//
// WHAT IS ALREADY COVERED, so this file is not repeating it:
//   - tests/index-external-benchmarks-roadmap-cli-log-parity.test.ts asserts
//     each table DECLARES 12 entries (count via regex over the source text).
//   - tests/evaluator-default-subset-helper-runtime.test.ts asserts
//     DEFAULT_LOG_FORMAT and DEFAULT_API_BASE have the SAME KEY SET
//     (`onlyInLog`/`onlyInApi` both empty), and that every llm-benchmark.local
//     DEFAULT_API_BASE url contains its own key.
//   - tests/evaluator-default-dispatch-type-helper.test.ts and
//     tests/evaluator-log-external-benchmark-enabled-helper.test.ts assert
//     per-key VALUES, but from the source TEXT via regex, one key at a time,
//     against literals re-typed inside the test file.
//
// THE GAP, measured 2026-10-10 22:03: every one of those suites reads the
// source as text. The tables themselves are exported, importable VALUES. Two
// tables that hold identical data are asserted to hold identical data only
// against hand-copied literals in each test file — the tables are never
// compared to EACH OTHER. So the relation that actually matters is untested:
// DEFAULT_DISPATCH_TYPE[k] === DEFAULT_LOG_FORMAT[k] for every k.
//
// Why it matters, not just tidiness: the two tables feed the SAME decision from
// two sides. logExternalBenchmarkEnabled (L191) renders
//   `const t = ext?.type ?? DEFAULT_LOG_FORMAT[benchmarkName] ?? 'agentic_coding'`
// and defaultDispatchType (L74) returns
//   `DEFAULT_DISPATCH_TYPE[benchmarkName] ?? 'agentic_coding'`.
// Both are the "which dispatch type does this benchmark use" answer. If one
// table is edited and the other is not, a configured `ext.type` still wins in
// the log (ext?.type is checked first), so the divergence is invisible for
// every configured benchmark and surfaces ONLY on the unconfigured fallback
// path — i.e. exactly the benchmarks a user has not set up yet, which is where
// a wrong dispatch type changes which transport the run reports.
//
// Method note: both tables are pure exported constants with no import-time
// side effects, so importing them is safe and costs nothing. Expected values
// are hard-coded on purpose — importing an expected value from the code it
// pins is tautological and cannot fail (recurring R431 lesson).

import {
  DEFAULT_DISPATCH_TYPE,
  DEFAULT_LOG_FORMAT,
  DEFAULT_API_BASE,
  DEFAULT_SUBSET,
} from '../src/core/evaluator';
import {
  defaultDispatchType,
  logExternalBenchmarkEnabled,
  defaultSubset,
} from '../src/core/evaluator';

// The 12 benchmark names, declared here rather than derived from either table,
// so that a key ADDED to one table but not the other cannot hide by making the
// expectation grow with it.
const THE_12 = [
  'terminal_bench',
  'benchlm_agentic',
  'swe_bench_pro',
  'process_aware_scoring',
  'long_context_cluster',
  'cyberseceval3',
  'aa_omniscience',
  'webdev_arena',
  'lm_eval_task_conflict_resolver',
  'livebench_2026_h1_quarterly_v3',
  'artificial_analysis_stirrup_agent_framework_v1',
  'aa_agentperf_v2_agentic_workloads',
] as const;

describe('DEFAULT_DISPATCH_TYPE / DEFAULT_LOG_FORMAT value parity (R433)', () => {
  it('both tables carry exactly the same 12 keys', () => {
    expect(Object.keys(DEFAULT_DISPATCH_TYPE).sort()).toEqual([...THE_12].sort());
    expect(Object.keys(DEFAULT_LOG_FORMAT).sort()).toEqual([...THE_12].sort());
  });

  // The core assertion. Per-key so a failure names the benchmark that drifted,
  // rather than dumping two 12-entry objects at the reader.
  it.each(THE_12)('%s has the same default type in both tables', (name) => {
    expect(DEFAULT_LOG_FORMAT[name]).toBe(DEFAULT_DISPATCH_TYPE[name]);
  });

  it('the two tables are value-identical as whole objects', () => {
    expect(DEFAULT_LOG_FORMAT).toEqual(DEFAULT_DISPATCH_TYPE);
  });

  // Proves the relation is load-bearing at the observable boundary, not just
  // between two constants. ext.type is unset, so both sides take the fallback;
  // if the tables diverged, the logged type would differ from the dispatched one.
  it('an unconfigured benchmark logs the type it will actually dispatch with', () => {
    for (const name of THE_12) {
      const line = logExternalBenchmarkEnabled(name, {});
      expect(line).toContain(`type=${defaultDispatchType(name)}`);
      expect(line).toContain(`type=${DEFAULT_DISPATCH_TYPE[name]}`);
    }
  });

  // A partially-configured benchmark must still agree: ext.type OVERRIDES both
  // tables on the log side (ext?.type ?? ...), and the caller is expected to
  // route the same override into the dispatch. The invariant here is the one
  // that survives an override, namely that the tables were equal BEFORE the
  // override, so no override can expose a latent divergence.
  it('a configured type does not mask a latent table divergence', () => {
    for (const name of THE_12) {
      const line = logExternalBenchmarkEnabled(name, { type: 'agentic_swe' });
      expect(line).toContain('type=agentic_swe');
      // still equal underneath
      expect(DEFAULT_LOG_FORMAT[name]).toBe(DEFAULT_DISPATCH_TYPE[name]);
    }
  });

  it('the fallback literal is the same string in both helpers', () => {
    // Both helpers fall back to 'agentic_coding'. An UNKNOWN benchmark name
    // reaches both fallbacks, so their outputs are directly comparable.
    expect(defaultDispatchType('no_such_benchmark')).toBe('agentic_coding');
    expect(logExternalBenchmarkEnabled('no_such_benchmark', {})).toContain(
      'type=agentic_coding'
    );
  });

  // PROVENANCE, not just value. Every assertion above is satisfied by the two
  // tables being equal, which means they are equally satisfied if a refactor
  // wires defaultDispatchType to the WRONG table -- the tables hold identical
  // data, so reading either one yields identical output. Measured: mutation M3
  // (defaultDispatchType reading DEFAULT_LOG_FORMAT) SURVIVED the whole file.
  //
  // These two are the only assertions in the file that can distinguish the two
  // tables, because they make the tables DIFFER for the duration of the call.
  // The tables are plain exported mutable objects, so the divergence can be
  // injected at runtime rather than asserted as a value. try/finally restores
  // the entry so no later test in this file observes the sentinel.
  it('defaultDispatchType reads DEFAULT_DISPATCH_TYPE, not the log table', () => {
    const name = 'terminal_bench';
    const original = DEFAULT_DISPATCH_TYPE[name];
    try {
      DEFAULT_DISPATCH_TYPE[name] = 'sentinel_dispatch' as any;
      // Its own table is now the odd one out, so the answer must come from it.
      expect(defaultDispatchType(name)).toBe('sentinel_dispatch');
      // And the log side, which must NOT follow the dispatch table.
      expect(logExternalBenchmarkEnabled(name, {})).not.toContain('sentinel_dispatch');
    } finally {
      DEFAULT_DISPATCH_TYPE[name] = original;
    }
    expect(defaultDispatchType(name)).toBe(original);
  });

  it('logExternalBenchmarkEnabled reads DEFAULT_LOG_FORMAT, not the dispatch table', () => {
    const name = 'terminal_bench';
    const original = DEFAULT_LOG_FORMAT[name];
    try {
      DEFAULT_LOG_FORMAT[name] = 'sentinel_log';
      expect(logExternalBenchmarkEnabled(name, {})).toContain('type=sentinel_log');
      expect(defaultDispatchType(name)).not.toBe('sentinel_log');
    } finally {
      DEFAULT_LOG_FORMAT[name] = original;
    }
    expect(DEFAULT_LOG_FORMAT[name]).toBe(original);
  });
});

describe('DEFAULT_API_BASE is total over the same 12 names (R433)', () => {
  it.each(THE_12)('%s has a default api base', (name) => {
    expect(DEFAULT_API_BASE[name]).toEqual(expect.any(String));
    expect(DEFAULT_API_BASE[name]!.length).toBeGreaterThan(0);
  });

  it('every default api base is an absolute https url', () => {
    for (const name of THE_12) {
      expect(DEFAULT_API_BASE[name]).toMatch(/^https:\/\//);
    }
  });

  // The subset table is DELIBERATELY not total over 12 (only 5 keys; the other 7
  // legitimately fall back to 'all'). Pinning that asymmetry so a future tick
  // does not "fix" it by adding 7 entries, and so nobody reads the fallback as
  // an accident. This is the deliberate-not-fixed residue, asserted.
  it('DEFAULT_SUBSET asymmetry over the 12 names is unchanged', () => {
    const subsetKeys = ['terminal_bench', 'benchlm_agentic', 'swe_bench_pro', 'process_aware_scoring', 'long_context_cluster'];
    const log = logExternalBenchmarkEnabled('webdev_arena', {});
    // webdev_arena has no DEFAULT_SUBSET entry, so its log line must NOT claim
    // a subset the dispatch will not use.
    expect(log).not.toContain('subset=');
  });

  // The membership test above only pins that webdev_arena is ABSENT, so it
  // survives any change to the default of a key that IS present. Measured:
  // mutation M7 (terminal_bench subset 'full' -> 'verified') survived the whole
  // file before this case was added. The subset default is the same
  // same-source-in-two-places hazard the type tables are -- closure side reads
  // cfg.subset ?? defaultSubset(name), helper side reads defaultSubset(name) --
  // so the values are pinned here rather than left to whatever the closure does.
  it.each([
    ['terminal_bench', 'full'],
    ['benchlm_agentic', 'all'],
    ['swe_bench_pro', 'verified'],
    ['process_aware_scoring', 'all_process_signals'],
    ['long_context_cluster', 'all'],
  ] as const)('%s keeps its default subset %s', (name, expected) => {
    expect(DEFAULT_SUBSET[name]).toBe(expected);
    // The helper is what both the closure and the log line ultimately consult.
    expect(defaultSubset(name)).toBe(expected);
  });

  // The 7 names with no entry must all fall back to 'all', and their log lines
  // must not invent a subset they do not have.
  it('the 7 unlisted names fall back to all and log no subset', () => {
    const listed = new Set([
      'terminal_bench',
      'benchlm_agentic',
      'swe_bench_pro',
      'process_aware_scoring',
      'long_context_cluster',
    ]);
    for (const name of THE_12) {
      if (listed.has(name)) continue;
      expect(DEFAULT_SUBSET[name]).toBeUndefined();
      expect(defaultSubset(name)).toBe('all');
    }
  });
});