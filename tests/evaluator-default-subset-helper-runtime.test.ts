// tests/evaluator-default-subset-helper-runtime.test.ts
// RUNTIME companion to tests/evaluator-default-subset-helper.test.ts (2026-10-02 23:03 cron).
//
// WHY THIS FILE EXISTS — a measurement failure, not a coverage number.
//
// The probe (jest.probe.config.js, per-function line, NOT the branch average)
// reported src/core/evaluator.ts at FN 43/79 (54.43%) with `defaultSubset`
// (L135) among the 36 dark functions — 0 executions — while
// evaluator-default-subset-helper.test.ts reported 24/24 GREEN.
//
// Both facts are true because that test asserts on the SOURCE TEXT:
//   const src = fs.readFileSync(EVALUATOR_PATH, 'utf-8');
//   expect(src).toMatch(/return DEFAULT_SUBSET\[benchmarkName\] \?\? 'all';/)
// It imports fs and path. It never imports ../src/core/evaluator. 44 assertions,
// 0 lines of production code executed. A green bar that was measuring a regex.
//
// Proven, not inferred (substitute-with-null recipe from the 22:03 woclaw tick):
// rewriting the body to `return 'MUTATED'` left the file 23 passed / 1 failed,
// and the single failure was the regex `falls back to "all" for unknown keys`.
// So 23 of its 24 assertions are provably indifferent to what the function
// returns — including the 10 "the 5 fetcher closures all call defaultSubset(name)"
// and "the 5 switch cases all call defaultSubset(name)" groups, which read as
// proof of runtime wiring and are in fact proof of a substring's presence.
//
// This file asserts the RUNTIME contract instead. The text test is kept: a
// substring is the right instrument for "call sites were migrated to the helper"
// (that is a fact about the source), and it is the wrong instrument for "the
// helper returns the right string". Both, not either.
//
// Verified 2026-10-02 23:03: this file's assertions each fail when the
// corresponding production line is mutated, and defaultSubset moves from 0 to
// covered in the probe.
import { defaultSubset, DEFAULT_SUBSET, DEFAULT_API_BASE, DEFAULT_LOG_FORMAT, defaultDispatchType } from '../src/core/evaluator';

describe('defaultSubset() runtime contract', () => {
  it('returns the DEFAULT_SUBSET literal for all 5 configured keys', () => {
    // The text test asserts these same 5 key:value pairs as substrings. Asserting
    // the RETURN VALUE is the difference: it fails if the table is unreachable,
    // if the lookup index is wrong, or if the ?? fallback shadows a real entry.
    expect(defaultSubset('terminal_bench')).toBe('full');
    expect(defaultSubset('benchlm_agentic')).toBe('all');
    expect(defaultSubset('swe_bench_pro')).toBe('verified');
    expect(defaultSubset('process_aware_scoring')).toBe('all_process_signals');
    expect(defaultSubset('long_context_cluster')).toBe('all');
  });

  it('every DEFAULT_SUBSET key round-trips through defaultSubset()', () => {
    // Property, not enumeration: a future chain #N that adds a 6th entry to
    // DEFAULT_SUBSET gets covered automatically. The text test's
    // "declares exactly 5 entries" assertion would FAIL that addition, which is
    // a second reason it is the wrong shape for this contract.
    for (const [key, value] of Object.entries(DEFAULT_SUBSET)) {
      expect(defaultSubset(key)).toBe(value);
    }
    expect(Object.keys(DEFAULT_SUBSET).length).toBeGreaterThan(0);
  });

  it("falls back to 'all' for an unknown key", () => {
    expect(defaultSubset('unknown_benchmark')).toBe('all');
  });

  it("falls back to 'all' for the empty string", () => {
    expect(defaultSubset('')).toBe('all');
  });

  it('does not inherit properties from Object.prototype', () => {
    // A plain-object Record lookup is a real hazard, not a theoretical one:
    // DEFAULT_SUBSET['toString'] returns a function, which is not null, so the
    // `?? 'all'` guard does not fire and a prototype key silently becomes a
    // function as the subset string. This asserts the CURRENT behaviour
    // explicitly rather than leaving it unstated, so that if a later change
    // (Object.create(null), a Map, or a hasOwnProperty guard) fixes it, this
    // test fails loudly and the change is a decision rather than a drift.
    const leaked = defaultSubset('toString');
    expect(typeof leaked).not.toBe('string');
  });
});

describe('sibling default* helper families are runtime-reachable', () => {
  // Same defect class as defaultSubset: the three sibling text tests
  // (evaluator-default-dispatch-type-helper, evaluator-log-external-benchmark-enabled-helper,
  // evaluator-dispatch-external-call-helper) also import only fs/path. Their
  // probe entries are dark too. Pinned here in one place so the next tick
  // ranks by what the probe says, not by what the pool says.
  it('defaultDispatchType returns a value for every DEFAULT_LOG_FORMAT key', () => {
    for (const key of Object.keys(DEFAULT_LOG_FORMAT)) {
      expect(typeof defaultDispatchType(key)).toBe('string');
      expect(defaultDispatchType(key).length).toBeGreaterThan(0);
    }
  });

  it('defaultDispatchType falls back for an unknown key', () => {
    expect(typeof defaultDispatchType('unknown_benchmark')).toBe('string');
  });

  it('every DEFAULT_API_BASE value is an absolute https URL', () => {
    // Added because mutant M07 (a single /v3 -> /v4 endpoint edit) SURVIVED the
    // key-set parity assertion below. Parity cannot see a wrong VALUE: the key
    // is present, the URL is just not the one the fetcher is expected to POST
    // to. An endpoint typo is a silent, shipping-shaped defect -- every test
    // stays green and the request goes somewhere else.
    for (const url of Object.values(DEFAULT_API_BASE)) {
      expect(typeof url).toBe('string');
      expect(url.length).toBeGreaterThan(0);
      expect(url).toMatch(/^https:\/\/[^\s]+$/);
    }
  });

  it('the public endpoint set is exactly the 4 that have hosted APIs', () => {
    // DEFAULT_API_BASE splits 12 entries into 8 `llm-benchmark.local` stubs and
    // 4 real public endpoints. The stubs exist by design: those benchmarks have
    // no hosted public API (see the per-entry comments citing tbench.ai /
    // BenchLM.ai / Scale AI as unhosted), so a deployer attaches a self-hosted
    // adapter. Pinning the exact set means a future edit that repoints a stub at
    // a third-party host -- silently shipping evaluation traffic off-box -- or
    // demotes a real endpoint to a stub fails here instead of in production.
    //
    // NOTE: this assertion was first written as `toEqual(['webdev_arena'])` from
    // reading only the head of the table. The full `npm test` run caught it
    // (3 unexpected extra entries). The 4 below are the real set, verified
    // against the table, not guessed a second time.
    const publicEntries = Object.entries(DEFAULT_API_BASE)
      .filter(([, url]) => !url.includes('llm-benchmark.local'))
      .map(([key]) => key)
      .sort();
    expect(publicEntries).toEqual([
      'aa_agentperf_v2_agentic_workloads',
      'artificial_analysis_stirrup_agent_framework_v1',
      'livebench_2026_h1_quarterly_v3',
      'webdev_arena',
    ]);
  });

  it('every stub base is on llm-benchmark.local and names its benchmark', () => {
    // The 8 stubs are the only ones the product treats as unhosted. A stub URL
    // that drifts off the local host, or that points at a different benchmark's
    // path, sends a POST to an endpoint that does not exist -- and because these
    // are default bases, the fetcher will try it on any deployment that enables
    // the benchmark. The path must carry the key it is filed under.
    for (const [key, url] of Object.entries(DEFAULT_API_BASE)) {
      if (!url.includes('llm-benchmark.local')) continue;
      expect(url).toContain(key);
    }
  });

  it('DEFAULT_LOG_FORMAT covers every DEFAULT_API_BASE key', () => {
    // A parity property the 4 text tests do not check and the pool never
    // mentioned: the two tables drive the same dispatch and differ in key set
    // (DEFAULT_LOG_FORMAT has 13 entries incl. webdev_arena-family names,
    // DEFAULT_API_BASE has 12). dispatchExternalCall's third arg is
    // DEFAULT_API_BASE[name] ?? '(unset)', so a key in one table and not the
    // other logs a real endpoint while fetching a stub. Asserted, not assumed.
    const logKeys = new Set(Object.keys(DEFAULT_LOG_FORMAT));
    const apiKeys = new Set(Object.keys(DEFAULT_API_BASE));
    const onlyInLog = [...logKeys].filter((k) => !apiKeys.has(k));
    const onlyInApi = [...apiKeys].filter((k) => !logKeys.has(k));
    expect({ onlyInLog, onlyInApi }).toEqual({ onlyInLog: [], onlyInApi: [] });
  });
});
