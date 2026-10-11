// tests/evaluator-dispatch-external-call-site-binding.test.ts
// R438 — pins the CALL-SITE subject set of src/core/evaluator.ts's
// `await this.dispatchExternalCall(results, '<name>', ...)` migration.
//
// WHY THIS FILE EXISTS (the gap it closes)
// ----------------------------------------
// tests/evaluator-dispatch-external-call-helper.test.ts asserts, per name:
//     const callSiteRe = new RegExp(`dispatchExternalCall[\\s\\S]*?'${name}',`);
//     expect(src).toMatch(callSiteRe);
// The pattern is `dispatchExternalCall` followed by an UNBOUNDED `[\s\S]*?`
// and then the bare name literal. Nothing anchors the name to a call site, so
// the name only has to appear ANYWHERE later in the file.
//
// Measured 2026-10-11 23:03: renaming the `webdev_arena` call site's literal
// to 'SWAPX' (and nothing else) left that suite 37/37 GREEN. The name still
// matched at evaluator.ts:701 `defaultDispatchType('webdev_arena')` and at the
// `category: 'webdev_arena'` pins. So the per-name gate reports "this site uses
// dispatchExternalCall" for a site that no longer names the benchmark at all —
// and a deleted call site is equally invisible, since the string survives in
// the fetcher bodies and the case labels.
//
// That is the R431 shape (a suite that greps source for literals instead of
// binding the value to the construct it claims to test) applied to the subject
// set rather than to a helper's return value. The gate that IS load-bearing in
// the same file is the `exactly 12 call sites` count (it uses `^\s*await this\.`
// + /gm), which is why a 12th real site, aa_agentperf_v2_agentic_workloads,
// sits outside every per-name arm while the count stays correct.
//
// WHAT THIS FILE PINS
// ------------------
// The subject set is derived from the source, never hand-listed: every
// `await this.dispatchExternalCall(results, '<name>',` occurrence is collected,
// and the collected set is compared against BOTH the declared benchmarkName
// union in the method signature AND a hard-coded expected list. A rename,
// a deletion, or a new site that nobody added to the union all fail here.
//
// This suite pins; it does not relax anything in the sibling file.
import * as fs from 'fs';
import * as path from 'path';

const EVALUATOR_PATH = path.resolve(__dirname, '../src/core/evaluator.ts');

// The complete set of external benchmarks dispatched through the helper, as of
// v0.6.0 step-v6.0-11 chain #12 + the aa_agentperf_v2 12th-site closure.
// Hard-coded ON PURPOSE: a pin that imports its expected value from the code it
// pins is tautological and cannot fail (R433 process lesson).
const EXPECTED_SITE_NAMES = [
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
];

// Each call site: capture the benchmarkName argument of a real
// `await this.dispatchExternalCall(results, '<name>',` call.
const CALL_SITE_RE = /await this\.dispatchExternalCall\(\s*results,\s*'([a-z_0-9]+)',/g;

const src = fs.readFileSync(EVALUATOR_PATH, 'utf-8');

function callSiteNames(): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  CALL_SITE_RE.lastIndex = 0;
  while ((m = CALL_SITE_RE.exec(src)) !== null) out.push(m[1]);
  return out;
}

// The benchmarkName parameter's literal union, read out of the signature.
function declaredUnion(): string[] {
  const sig = src.match(
    /private async dispatchExternalCall\(\s*results: EvaluationResult\[\],\s*benchmarkName:([\s\S]{0,2000}?),\s*fetcher:/,
  );
  expect(sig).not.toBeNull();
  const uniq = new Set<string>();
  for (const n of sig![1].matchAll(/'([a-z_0-9]+)'/g)) uniq.add(n[1]);
  return [...uniq];
}

describe('dispatchExternalCall call-site subject set (R438)', () => {
  it('every dispatch call site names a benchmark — the name sits INSIDE the call, not somewhere later in the file', () => {
    // Anchor the subject set. This is the assertion the sibling suite cannot
    // make: a per-name `dispatchExternalCall[\s\S]*?'name',` probe is satisfied
    // by any later occurrence of the literal.
    expect(callSiteNames().length).toBeGreaterThan(0);
  });

  it('the call-site subject set equals the expected 12 benchmarks exactly', () => {
    const names = callSiteNames();
    expect([...names].sort()).toEqual([...EXPECTED_SITE_NAMES].sort());
  });

  it('no benchmark is dispatched at two call sites (each name appears once)', () => {
    const names = callSiteNames();
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    expect(dupes).toEqual([]);
  });

  it('every call-site name is a member of the declared benchmarkName union — a new site cannot ship undeclared', () => {
    const declared = new Set(declaredUnion());
    const undeclared = callSiteNames().filter((n) => !declared.has(n));
    expect(undeclared).toEqual([]);
  });

  it('every declared union member is dispatched at least once — a declaration cannot outlive its call site', () => {
    const names = new Set(callSiteNames());
    const neverDispatched = declaredUnion().filter((n) => !names.has(n));
    expect(neverDispatched).toEqual([]);
  });

  it('the aa_agentperf_v2 12th site is a real call site, not only a string elsewhere in the file', () => {
    // The specific gap measured this tick: the sibling suite's per-name arms
    // cover 11 names and its count arm counts 12 sites, so this one name was in
    // no per-name arm at all.
    expect(callSiteNames()).toContain('aa_agentperf_v2_agentic_workloads');
  });

  it('every call site passes a fetcher as the third argument (no site degrades to a bare name)', () => {
    // A site rewritten as `dispatchExternalCall(results, 'name')` would still
    // match the sibling suite's pattern; it does not match here.
    //
    // The window is bounded by the NEXT call site, not by a fixed character
    // count: a fetcher body here runs to ~400 chars, so a fixed window either
    // truncates the match (0 sites found) or reaches across into the next site
    // and passes on its borrowings. Deriving the slice from CALL_SITE_RE keeps
    // the two halves of this file reading the same subject set.
    const starts: number[] = [];
    CALL_SITE_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = CALL_SITE_RE.exec(src)) !== null) starts.push(m.index);
    expect(starts.length).toBe(EXPECTED_SITE_NAMES.length);

    for (let i = 0; i < starts.length; i++) {
      const slice = src.slice(starts[i], i + 1 < starts.length ? starts[i + 1] : src.length);
      const head = slice.slice(0, 200).replace(/\s+/g, ' ');
      expect(head).toMatch(/^await this\.dispatchExternalCall\(\s*results,\s*'[a-z_0-9]+',/);
      expect(slice).toMatch(/\(\s*apiBase,\s*model,\s*timeoutMs/);
    }
  });
});
