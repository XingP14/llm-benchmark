// tests/evaluator-log-external-benchmark-enabled-runtime.test.ts
// 钉住 src/core/evaluator.ts L190-286 logExternalBenchmarkEnabled / L92-106 DEFAULT_LOG_FORMAT
// 的 RUNTIME 行为(0 生产代码改动)。
//
// WHY THIS FILE EXISTS — 旧 suite 只读源码文本:
// tests/evaluator-log-external-benchmark-enabled-helper.test.ts 30 个 case 全部是
// `expect(src).toMatch(/.../)` —— 它断言的是文件的**字符**而不是函数的行为。
// 后果: logExternalBenchmarkEnabled 那个 12-case switch 里 87 个 branch arm 全部 0 执行
// (2026-10-03 02:04 probe: evaluator.ts 177/470 dark branch, 其中 87 个集中在 L191-277),
// 因为没有任何一个 test 真正 CALL 过这个 export。
//
// 源码 grep 钉住的是"这行字还在", 不是"它对未配置 ext 的返回值仍然正确"。
// 例如 `ext?.anchor_score != null` 若被改成 `ext?.anchor_score !== undefined`,
// 旧 suite 全绿(字面量锚点会 fail, 但 `!= null` 换成 `!== undefined` 这一类
// 语义等价替换完全逃逸), 而 anchor 段落输出已经变了。
//
// 覆盖策略: 12 个 benchmarkName 全部走一遍, 每个给 full-ext (所有 key-specific
// 字段都给) + bare-ext ({}/undefined), 覆盖每一处 `?? default` 与 `!= null` 的两侧。

import { logExternalBenchmarkEnabled, DEFAULT_LOG_FORMAT } from '../src/core/evaluator';

const anchor = { anchor_score: 0.5 };

describe('logExternalBenchmarkEnabled runtime (2026-10-03 02:04 cron)', () => {
  describe('base 3-tuple with (unset) fallbacks', () => {
    it('renders type/api_base/model_id from ext when all three are present', () => {
      const out = logExternalBenchmarkEnabled('webdev_arena', {
        type: 'agentic_fullstack',
        api_base: 'https://example.invalid/v1',
        model_id: 'gpt-4o-mini',
      });
      expect(out).toBe('webdev_arena(type=agentic_fullstack, api_base=https://example.invalid/v1, model_id=gpt-4o-mini)');
    });

    it('falls back to (unset) for both api_base and model_id when ext is undefined', () => {
      // webdev_arena has no switch case, so suffix stays '' — the base fallbacks
      // are what this case is here to pin.
      const out = logExternalBenchmarkEnabled('webdev_arena', undefined);
      expect(out).toBe('webdev_arena(type=agentic_coding, api_base=(unset), model_id=(unset))');
    });

    it('falls back to DEFAULT_LOG_FORMAT when ext.type is absent', () => {
      expect(logExternalBenchmarkEnabled('cyberseceval3', {})).toContain('type=safety_evaluation');
      expect(logExternalBenchmarkEnabled('swe_bench_pro', {})).toContain('type=agentic_swe');
      expect(logExternalBenchmarkEnabled('process_aware_scoring', {})).toContain('type=process_agentic');
      expect(logExternalBenchmarkEnabled('long_context_cluster', {})).toContain('type=long_context_retrieval');
      expect(logExternalBenchmarkEnabled('benchlm_agentic', {})).toContain('type=agentic_fullstack');
    });

    it('falls back to the hardcoded agentic_coding for a name absent from DEFAULT_LOG_FORMAT', () => {
      // The `?? 'agentic_coding'` third operand. Only reachable with a name that
      // is neither configured nor a DEFAULT_LOG_FORMAT key.
      expect(logExternalBenchmarkEnabled('not_a_real_benchmark', undefined)).toBe(
        'not_a_real_benchmark(type=agentic_coding, api_base=(unset), model_id=(unset))',
      );
    });
  });

  describe('DEFAULT_LOG_FORMAT covers every benchmark the dispatcher can call', () => {
    it('has an entry for each of the 12 dispatchable benchmark names', () => {
      const names = [
        'webdev_arena', 'terminal_bench', 'aa_omniscience', 'benchlm_agentic',
        'cyberseceval3', 'swe_bench_pro', 'long_context_cluster', 'process_aware_scoring',
        'lm_eval_task_conflict_resolver', 'livebench_2026_h1_quarterly_v3',
        'artificial_analysis_stirrup_agent_framework_v1', 'aa_agentperf_v2_agentic_workloads',
      ];
      for (const name of names) {
        expect(DEFAULT_LOG_FORMAT[name]).toBeDefined();
        // A name with a DEFAULT_LOG_FORMAT entry must render THAT value, not the
        // hardcoded fallback -- otherwise the table is dead and every site is 'agentic_coding'.
        expect(logExternalBenchmarkEnabled(name, {})).toContain(`type=${DEFAULT_LOG_FORMAT[name]}`);
      }
    });
  });

  describe('anchor_score != null (11 key-specific cases)', () => {
    it('omits the anchor segment entirely when anchor_score is absent', () => {
      expect(logExternalBenchmarkEnabled('aa_omniscience', {})).toBe(
        'aa_omniscience(type=long_context_retrieval, api_base=(unset), model_id=(unset))',
      );
      expect(logExternalBenchmarkEnabled('lm_eval_task_conflict_resolver', {})).not.toContain('anchor');
    });

    it('emits anchor= when anchor_score is 0 -- the falsy-but-present arm, for EVERY case', () => {
      // `!= null` (not truthiness) is the whole point of this arm: anchor_score=0
      // is a legitimate configuration and must be printed, not swallowed.
      //
      // SCOPE NOTE, earned by mutation M6: this was originally asserted on
      // aa_omniscience ALONE. The identical `const anchor = ...` line is
      // copy-pasted into 10 of the 12 cases, and a truthiness mutation applied to
      // the FIRST one (terminal_bench) therefore survived a suite that looked
      // thorough. A behaviour pinned on one copy of a copy-pasted line is pinned
      // on one copy. Asserted across all of them below.
      const withAnchor = [
        'terminal_bench', 'aa_omniscience', 'benchlm_agentic', 'swe_bench_pro',
        'long_context_cluster', 'process_aware_scoring', 'lm_eval_task_conflict_resolver',
        'livebench_2026_h1_quarterly_v3', 'artificial_analysis_stirrup_agent_framework_v1',
        'aa_agentperf_v2_agentic_workloads',
      ];
      for (const name of withAnchor) {
        expect({ name, out: logExternalBenchmarkEnabled(name, { anchor_score: 0 }) }).toEqual(
          expect.objectContaining({ out: expect.stringContaining('anchor=0)') }),
        );
      }
    });

    it('omits the anchor segment when anchor_score is explicitly null', () => {
      // The OTHER side of `!= null`. A JSON config carrying `"anchor_score": null`
      // must be indistinguishable from absent.
      expect(logExternalBenchmarkEnabled('aa_omniscience', { anchor_score: null })).not.toContain('anchor');
    });

    it('threads anchor into every case that declares one', () => {
      const withAnchor = [
        'terminal_bench', 'aa_omniscience', 'benchlm_agentic', 'swe_bench_pro',
        'long_context_cluster', 'process_aware_scoring', 'lm_eval_task_conflict_resolver',
        'livebench_2026_h1_quarterly_v3', 'artificial_analysis_stirrup_agent_framework_v1',
        'aa_agentperf_v2_agentic_workloads',
      ];
      for (const name of withAnchor) {
        expect(logExternalBenchmarkEnabled(name, anchor)).toContain('anchor=0.5');
        expect(logExternalBenchmarkEnabled(name, { anchor_score: null })).not.toContain('anchor');
      }
    });
  });

  describe('terminal_bench: subset default', () => {
    it('defaults subset to DEFAULT_SUBSET (full) and prints it', () => {
      expect(logExternalBenchmarkEnabled('terminal_bench', {})).toContain('subset=full');
    });
    it('prints a configured subset verbatim', () => {
      expect(logExternalBenchmarkEnabled('terminal_bench', { subset: 'verified_only' })).toContain('subset=verified_only');
    });
  });

  describe('benchlm_agentic: native_evals || subset === native_evals_only', () => {
    it('adds the Native Evals suffix when native_evals is truthy', () => {
      expect(logExternalBenchmarkEnabled('benchlm_agentic', { native_evals: true })).toContain(' + Native Evals');
    });
    it('adds it when the subset implies it, even with native_evals absent', () => {
      // The `||` right operand: a subset of native_evals_only already means it.
      expect(logExternalBenchmarkEnabled('benchlm_agentic', { subset: 'native_evals_only' })).toContain(' + Native Evals');
    });
    it('omits it when native_evals is falsy AND the subset is the default', () => {
      expect(logExternalBenchmarkEnabled('benchlm_agentic', {})).not.toContain('Native Evals');
      expect(logExternalBenchmarkEnabled('benchlm_agentic', { native_evals: false })).not.toContain('Native Evals');
    });
  });

  describe('cyberseceval3: risk_categories', () => {
    it("joins an explicit list with '|'", () => {
      expect(logExternalBenchmarkEnabled('cyberseceval3', { risk_categories: ['a', 'b', 'c'] })).toContain(
        'risk_categories=a|b|c',
      );
    });
    it("falls back to 'all-8' when the list is absent", () => {
      expect(logExternalBenchmarkEnabled('cyberseceval3', {})).toContain('risk_categories=all-8');
    });
  });

  describe('swe_bench_pro: agentic_mode / timeout_ms', () => {
    it('marks the benchmark non-agentic only when agentic_mode is exactly false', () => {
      expect(logExternalBenchmarkEnabled('swe_bench_pro', { agentic_mode: false })).toContain(' (non-agentic)');
      // 'false' as a string is NOT `=== false`; an untyped JSON config can carry it.
      expect(logExternalBenchmarkEnabled('swe_bench_pro', { agentic_mode: 'false' })).not.toContain('non-agentic');
      expect(logExternalBenchmarkEnabled('swe_bench_pro', {})).not.toContain('non-agentic');
    });
    it('prints timeout_ms when present and omits it when null or absent', () => {
      expect(logExternalBenchmarkEnabled('swe_bench_pro', { timeout_ms: 300000 })).toContain('timeout=300000ms');
      expect(logExternalBenchmarkEnabled('swe_bench_pro', { timeout_ms: 0 })).toContain('timeout=0ms');
      expect(logExternalBenchmarkEnabled('swe_bench_pro', { timeout_ms: null })).not.toContain('timeout');
      expect(logExternalBenchmarkEnabled('swe_bench_pro', {})).not.toContain('timeout');
    });
  });

  describe('long_context_cluster: tasks_total default 62', () => {
    it('defaults tasks to 62 and prints a configured total', () => {
      expect(logExternalBenchmarkEnabled('long_context_cluster', {})).toContain('tasks=62');
      expect(logExternalBenchmarkEnabled('long_context_cluster', { tasks_total: 10 })).toContain('tasks=10');
    });
  });

  describe('process_aware_scoring: 5-field passthrough', () => {
    it('defaults mode/benchmark/weights and prints every configured value', () => {
      const def = logExternalBenchmarkEnabled('process_aware_scoring', {});
      expect(def).toContain('mode=all');
      expect(def).toContain('agentic_benchmark=swe_bench_pro');
      expect(def).toContain('weights=0.7/0.3');

      const cfg = logExternalBenchmarkEnabled('process_aware_scoring', {
        mode: 'rubric',
        agentic_benchmark: 'terminal_bench',
        pass_fail_weight: 0.2,
        process_weight: 0.8,
      });
      expect(cfg).toContain('mode=rubric');
      expect(cfg).toContain('agentic_benchmark=terminal_bench');
      expect(cfg).toContain('weights=0.2/0.8');
    });
  });

  describe('lm_eval_task_conflict_resolver: mode / dependency_groups', () => {
    it('defaults mode to dry_run and deps to all', () => {
      expect(logExternalBenchmarkEnabled('lm_eval_task_conflict_resolver', {})).toContain('mode=dry_run');
      expect(logExternalBenchmarkEnabled('lm_eval_task_conflict_resolver', {})).toContain('deps=all');
    });
    it('prints configured mode and dependency groups', () => {
      const out = logExternalBenchmarkEnabled('lm_eval_task_conflict_resolver', {
        mode: 'resolve',
        dependency_groups: ['numpy', 'torch'],
      });
      expect(out).toContain('mode=resolve');
      expect(out).toContain('deps=numpy,torch');
    });
  });

  describe('livebench_2026_h1_quarterly_v3: task / cadence / contamination', () => {
    it('defaults task=all, cadence=quarterly_3_5_month, contam=enabled', () => {
      const out = logExternalBenchmarkEnabled('livebench_2026_h1_quarterly_v3', {});
      expect(out).toContain('task=all');
      expect(out).toContain('cadence=quarterly_3_5_month');
      expect(out).toContain('contam=enabled');
    });
    it('prints configured values; contamination_check=false is interpolated as the raw "false"', () => {
      const out = logExternalBenchmarkEnabled('livebench_2026_h1_quarterly_v3', {
        task: 'coding',
        refresh_cadence: 'monthly',
        contamination_check: false,
        timeout_ms: 120000,
      });
      expect(out).toContain('task=coding');
      expect(out).toContain('cadence=monthly');
      // DOCUMENTED AS-IS, NOT AS-DESIRED. `ext?.contamination_check ?? 'enabled'`
      // is a `??`, not a mapping, so an explicitly-configured `false` is a NON-NULLISH
      // value and interpolates as the literal string "false" -- the log then reads
      //   contam=false      (contamination check explicitly OFF)
      //   contam=enabled    (contamination check left at its default)
      // which are the same decision expressed in two vocabularies, side by side in
      // one multi-benchmark startup line. Pinning it as 'false' rather than
      // 'disabled' is deliberate: this is the CURRENT contract, and a future
      // change to a boolean->word mapping must be a conscious edit here.
      expect(out).toContain('contam=false');
      expect(out).toContain('timeout=120000ms');
    });
  });

  describe('artificial_analysis_stirrup: language / framework_role / cross_language', () => {
    it('defaults language=all, role=agent_builder and cross_language=true', () => {
      const out = logExternalBenchmarkEnabled('artificial_analysis_stirrup_agent_framework_v1', {});
      expect(out).toContain('language=all');
      expect(out).toContain('role=agent_builder');
      expect(out).toContain('cross_language=true');
    });
    it('flips cross_language to false when a single language is selected', () => {
      // cross_language is DERIVED from language, so it must move with it.
      const out = logExternalBenchmarkEnabled('artificial_analysis_stirrup_agent_framework_v1', {
        language: 'python',
        framework_role: 'tool_caller',
      });
      expect(out).toContain('language=python');
      expect(out).toContain('role=tool_caller');
      expect(out).toContain('cross_language=false');
    });
  });

  describe('aa_agentperf_v2: 4 defaulted fields', () => {
    it('defaults agent_count=32, session=single, gpu=blackwell_gb300, workload=agentic_coding', () => {
      const out = logExternalBenchmarkEnabled('aa_agentperf_v2_agentic_workloads', {});
      expect(out).toContain('agent_count=32');
      expect(out).toContain('session=single');
      expect(out).toContain('gpu=blackwell_gb300');
      expect(out).toContain('workload=agentic_coding');
    });
    it('prints configured values', () => {
      const out = logExternalBenchmarkEnabled('aa_agentperf_v2_agentic_workloads', {
        agent_count: 8,
        session_mode: 'concurrent',
        gpu_hardware: 'hgx_h200',
        workload: 'long_context',
        timeout_ms: 60000,
      });
      expect(out).toContain('agent_count=8');
      expect(out).toContain('session=concurrent');
      expect(out).toContain('gpu=hgx_h200');
      expect(out).toContain('workload=long_context');
      expect(out).toContain('timeout=60000ms');
    });
  });

  describe('string shape invariants', () => {
    it('keeps parentheses BALANCED and never leaves a dangling comma or a raw JS value', () => {
      // NOTE ON THE PAREN COUNT: it is 3 for most names, not 1, because the
      // '(unset)' fallback text itself contains a matched pair, twice. The real
      // invariant is BALANCE, not a literal count. (An earlier draft of this test
      // asserted exactly one and went red against reality -- the count was
      // measuring the fallback text, not a defect.)
      for (const name of Object.keys(DEFAULT_LOG_FORMAT)) {
        for (const ext of [undefined, {}, { anchor_score: 0, timeout_ms: 1, risk_categories: ['x'] }] as any[]) {
          const out = logExternalBenchmarkEnabled(name, ext);
          const opens = (out.match(/\(/g) || []).length;
          const closes = (out.match(/\)/g) || []).length;
          expect({ name, opens, closes, balanced: opens === closes }).toEqual(
            expect.objectContaining({ balanced: true }),
          );
          expect(out.startsWith(`${name}(`)).toBe(true);
          expect(out.endsWith(')')).toBe(true);
          expect(out).not.toContain(', )');
          expect(out).not.toContain('undefined');
          expect(out).not.toContain('null');
          expect(out).not.toContain('[object Object]');
          expect(out).not.toContain('NaN');
        }
      }
    });
  });
});
