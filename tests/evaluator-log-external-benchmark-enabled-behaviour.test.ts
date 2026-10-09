// tests/evaluator-log-external-benchmark-enabled-behaviour.test.ts
// R431 — 行为面覆盖: logExternalBenchmarkEnabled 的 12 个 case 端到端字符串契约。
//
// 为什么需要这个文件: 既有 tests/evaluator-log-external-benchmark-enabled-helper.test.ts
// (21 cases) 一个字都没调用过 logExternalBenchmarkEnabled —— 全部断言都是对
// src/core/evaluator.ts 的 fs.readFileSync + toMatch 正则。所以 helper 里 12 个
// switch case 的输出没有一个被执行过, 它们只被"源码里存在这些字面量"间接覆盖。
//
// 本文件的每一个期望值都是硬编码字面量, 刻意不从 DEFAULT_LOG_FORMAT /
// logExternalBenchmarkEnabled 导入 (导入即同义反复, 永远不会失败)。名字集合同样
// 硬编码 —— 不是 Object.keys(DEFAULT_LOG_FORMAT) —— 这样"少一个 case"或
// "改了一个默认值"都会红。
import { logExternalBenchmarkEnabled, DEFAULT_LOG_FORMAT } from '../src/core/evaluator';

describe('logExternalBenchmarkEnabled — 端到端字符串契约 (R431)', () => {
  // ext = {} 即"配置里完全没写这个 benchmark 的字段", 走全�� ?? 兜底。
  // 这是日志里最常见的一种形态: 用户只把 enabled 打开, 其余靠默认。
  describe('全空配置下的默认值', () => {
    it('terminal_bench', () => {
      expect(logExternalBenchmarkEnabled('terminal_bench', {})).toBe(
        'terminal_bench(type=agentic_coding, api_base=(unset), model_id=(unset), subset=full)'
      );
    });
    it('benchlm_agentic', () => {
      expect(logExternalBenchmarkEnabled('benchlm_agentic', {})).toBe(
        'benchlm_agentic(type=agentic_fullstack, api_base=(unset), model_id=(unset), subset=all)'
      );
    });
    it('swe_bench_pro', () => {
      expect(logExternalBenchmarkEnabled('swe_bench_pro', {})).toBe(
        'swe_bench_pro(type=agentic_swe, api_base=(unset), model_id=(unset), subset=verified)'
      );
    });
    it('process_aware_scoring — 5 字段全透传默认', () => {
      expect(logExternalBenchmarkEnabled('process_aware_scoring', {})).toBe(
        'process_aware_scoring(type=process_agentic, api_base=(unset), model_id=(unset), ' +
          'subset=all_process_signals, mode=all, agentic_benchmark=swe_bench_pro, weights=0.7/0.3)'
      );
    });
    it('long_context_cluster — tasks_total 缺省 62', () => {
      expect(logExternalBenchmarkEnabled('long_context_cluster', {})).toBe(
        'long_context_cluster(type=long_context_retrieval, api_base=(unset), model_id=(unset), subset=all, tasks=62)'
      );
    });
    it('cyberseceval3 — risk_categories 缺省 all-8', () => {
      expect(logExternalBenchmarkEnabled('cyberseceval3', {})).toBe(
        'cyberseceval3(type=safety_evaluation, api_base=(unset), model_id=(unset), risk_categories=all-8)'
      );
    });
    it('aa_omniscience — 无 key-specific 段', () => {
      expect(logExternalBenchmarkEnabled('aa_omniscience', {})).toBe(
        'aa_omniscience(type=long_context_retrieval, api_base=(unset), model_id=(unset))'
      );
    });
    it('webdev_arena — 无 key-specific 段', () => {
      expect(logExternalBenchmarkEnabled('webdev_arena', {})).toBe(
        'webdev_arena(type=agentic_coding, api_base=(unset), model_id=(unset))'
      );
    });
    it('lm_eval_task_conflict_resolver', () => {
      expect(logExternalBenchmarkEnabled('lm_eval_task_conflict_resolver', {})).toBe(
        'lm_eval_task_conflict_resolver(type=agentic_coding, api_base=(unset), model_id=(unset), mode=dry_run, deps=all)'
      );
    });
    it('livebench_2026_h1_quarterly_v3 — contamination_check 缺省 enabled', () => {
      expect(logExternalBenchmarkEnabled('livebench_2026_h1_quarterly_v3', {})).toBe(
        'livebench_2026_h1_quarterly_v3(type=agentic_coding, api_base=(unset), model_id=(unset), ' +
          'task=all, cadence=quarterly_3_5_month, contam=enabled)'
      );
    });
    it('artificial_analysis_stirrup_agent_framework_v1', () => {
      expect(logExternalBenchmarkEnabled('artificial_analysis_stirrup_agent_framework_v1', {})).toBe(
        'artificial_analysis_stirrup_agent_framework_v1(type=agentic_coding, api_base=(unset), model_id=(unset), ' +
          'language=all, role=agent_builder, cross_language=true)'
      );
    });
    it('aa_agentperf_v2_agentic_workloads', () => {
      expect(logExternalBenchmarkEnabled('aa_agentperf_v2_agentic_workloads', {})).toBe(
        'aa_agentperf_v2_agentic_workloads(type=agentic_coding, api_base=(unset), model_id=(unset), ' +
          'agent_count=32, session=single, gpu=blackwell_gb300, workload=agentic_coding)'
      );
    });
  });

  // 硬编码名单, 不是 Object.keys()。两者的差集就是"表里有 case 但契约里没写"的
  // 不对称, 以及反过来"契约里写了但表里没有" —— 后者是 default: 分支吞掉的幻影。
  const NAMED_CASES = [
    'terminal_bench',
    'aa_omniscience',
    'benchlm_agentic',
    'cyberseceval3',
    'swe_bench_pro',
    'long_context_cluster',
    'process_aware_scoring',
    'lm_eval_task_conflict_resolver',
    'livebench_2026_h1_quarterly_v3',
    'artificial_analysis_stirrup_agent_framework_v1',
    'aa_agentperf_v2_agentic_workloads',
    // base-only: 有 DEFAULT_LOG_FORMAT 条目但没有 switch case, 走 default: 空 suffix
    'webdev_arena',
  ];

  it('case 名单与 DEFAULT_LOG_FORMAT 的 key 集合完全一致 (无遗漏、无幻影)', () => {
    const table = Object.keys(DEFAULT_LOG_FORMAT).sort();
    expect(NAMED_CASES.slice().sort()).toEqual(table);
  });

  it('未识别的 benchmark 走 default: 只出 base 段, 不抛异常', () => {
    expect(logExternalBenchmarkEnabled('totally_unknown_bench', {})).toBe(
      'totally_unknown_bench(type=agentic_coding, api_base=(unset), model_id=(unset))'
    );
    // ext 为 null/undefined 也必须不炸 —— run() 的 ext.x!.enabled 守卫只保证
    // 对象存在, 而 helper 是导出的公共面。
    expect(logExternalBenchmarkEnabled('terminal_bench', undefined)).toContain('subset=full');
  });

  describe('显式配置覆盖默认值', () => {
    it('base 三元组全部可覆盖, 且 (unset) 不再出现', () => {
      expect(
        logExternalBenchmarkEnabled('webdev_arena', {
          type: 'custom_type',
          api_base: 'https://example.test/v1',
          model_id: 'my-model',
        })
      ).toBe('webdev_arena(type=custom_type, api_base=https://example.test/v1, model_id=my-model)');
    });

    it('anchor 段在 5 个带 anchor 的 benchmark 上都出现', () => {
      // anchor 逻辑在 helper 里被复制了 6 份 (terminal_bench / aa_omniscience /
      // benchlm_agentic / swe_bench_pro / long_context_cluster /
      // process_aware_scoring), 复制即漂移风险, 所以逐一钉。
      const anchored = [
        'terminal_bench',
        'aa_omniscience',
        'benchlm_agentic',
        'swe_bench_pro',
        'long_context_cluster',
        'process_aware_scoring',
        'lm_eval_task_conflict_resolver',
        'livebench_2026_h1_quarterly_v3',
        'artificial_analysis_stirrup_agent_framework_v1',
        'aa_agentperf_v2_agentic_workloads',
      ];
      for (const name of anchored) {
        expect(logExternalBenchmarkEnabled(name, { anchor_score: 88 })).toContain('anchor=88');
      }
    });

    it('anchor_score 为 0 时仍然输出 (0 不是缺省)', () => {
      // `ext?.anchor_score != null` 而不是真值判断 —— 0 是合法分数。
      expect(logExternalBenchmarkEnabled('aa_omniscience', { anchor_score: 0 })).toContain('anchor=0');
    });

    it('subset 覆盖后, defaultSubset 的默认值不再出现', () => {
      expect(logExternalBenchmarkEnabled('terminal_bench', { subset: 'lite' })).toContain('subset=lite');
      expect(logExternalBenchmarkEnabled('swe_bench_pro', { subset: 'lite' })).toContain('subset=lite');
      expect(logExternalBenchmarkEnabled('long_context_cluster', { subset: 'lite' })).toContain('subset=lite');
      expect(logExternalBenchmarkEnabled('process_aware_scoring', { subset: 'lite' })).toContain('subset=lite');
      expect(logExternalBenchmarkEnabled('benchlm_agentic', { subset: 'lite' })).toContain('subset=lite');
    });

    it('benchlm_agentic native_evals 两种触发路径 (显式 true / subset 哨兵)', () => {
      expect(logExternalBenchmarkEnabled('benchlm_agentic', { native_evals: true })).toContain('+ Native Evals');
      expect(logExternalBenchmarkEnabled('benchlm_agentic', { subset: 'native_evals_only' })).toContain(
        '+ Native Evals'
      );
      expect(logExternalBenchmarkEnabled('benchlm_agentic', { subset: 'all' })).not.toContain('Native Evals');
    });

    it('swe_bench_pro: agentic_mode / timeout_ms 两段', () => {
      expect(logExternalBenchmarkEnabled('swe_bench_pro', { agentic_mode: false })).toContain('(non-agentic)');
      expect(logExternalBenchmarkEnabled('swe_bench_pro', { agentic_mode: true })).not.toContain('(non-agentic)');
      expect(logExternalBenchmarkEnabled('swe_bench_pro', { timeout_ms: 0 })).toContain('timeout=0ms');
      expect(logExternalBenchmarkEnabled('swe_bench_pro', {})).not.toContain('timeout=');
    });

    it('cyberseceval3: risk_categories join 与缺省', () => {
      expect(logExternalBenchmarkEnabled('cyberseceval3', { risk_categories: ['a', 'b'] })).toContain(
        'risk_categories=a|b'
      );
      expect(logExternalBenchmarkEnabled('cyberseceval3', { risk_categories: [] })).toContain('risk_categories=');
    });

    it('long_context_cluster: tasks_total 覆盖 62 缺省', () => {
      expect(logExternalBenchmarkEnabled('long_context_cluster', { tasks_total: 5 })).toContain('tasks=5');
    });

    it('process_aware_scoring: mode / agentic_benchmark / 双权重可覆盖', () => {
      const s = logExternalBenchmarkEnabled('process_aware_scoring', {
        mode: 'trajectory_only',
        agentic_benchmark: 'terminal_bench',
        pass_fail_weight: 0.4,
        process_weight: 0.6,
      });
      expect(s).toContain('mode=trajectory_only');
      expect(s).toContain('agentic_benchmark=terminal_bench');
      expect(s).toContain('weights=0.4/0.6');
    });

    it('livebench: task / refresh_cadence / contamination_check 三段', () => {
      const s = logExternalBenchmarkEnabled('livebench_2026_h1_quarterly_v3', {
        task: 'reasoning',
        refresh_cadence: 'monthly',
        contamination_check: 'disabled',
      });
      expect(s).toContain('task=reasoning');
      expect(s).toContain('cadence=monthly');
      expect(s).toContain('contam=disabled');
    });

    it('artificial_analysis stirrup: language / framework_role / cross_language 联动', () => {
      // R431 修正: 本文件初稿断言 language='python' → cross_language=true,
      // 实测生产行为相反 (python→false, all→true), 2 failed / 25 passed。
      // 语义以代码为准: cross_language 意为 "framework 是否跨多语言工作",
      // 因此 language='all' → true。名字读起来像 "当前这次调用是否跨语言",
      // 但 'all' 才是唯一能跨语言的取值 —— 初稿的期望值是把名字直译成了错义。
      // 这里改为双向钉死, 使该布尔不能再被复制粘贴改成常量。
      expect(logExternalBenchmarkEnabled('artificial_analysis_stirrup_agent_framework_v1', { language: 'all' })).toContain(
        'cross_language=true'
      );
      expect(
        logExternalBenchmarkEnabled('artificial_analysis_stirrup_agent_framework_v1', { language: 'python' })
      ).toContain('cross_language=false');
      expect(
        logExternalBenchmarkEnabled('artificial_analysis_stirrup_agent_framework_v1', { framework_role: 'evaluator' })
      ).toContain('role=evaluator');
    });

    it('aa_agentperf_v2: agent_count / session_mode / gpu / workload 四段', () => {
      const s = logExternalBenchmarkEnabled('aa_agentperf_v2_agentic_workloads', {
        agent_count: 128,
        session_mode: 'multi',
        gpu_hardware: 'h200',
        workload: 'long_horizon',
      });
      expect(s).toContain('agent_count=128');
      expect(s).toContain('session=multi');
      expect(s).toContain('gpu=h200');
      expect(s).toContain('workload=long_horizon');
    });
  });

  it('输出永远以单个右括号收尾, 且 base 与 suffix 之间无多余括号', () => {
    // 拼装式模板最容易出的两个错: 少一个 ')', 或 suffix 为空时留下 '))'。
    //
    // R431 修正: 初稿直接断言 s.includes('))') === false, 实测 aa_omniscience 与
    // webdev_arena 两个 base-only case 必然失败 —— 因为 '(unset)' 占位符自身以 ')' 收尾,
    // 而 base 段是 `..., model_id=${model}` 且 model 本身就是 '(unset)'。
    // '))' 在这里是**正确**输出, 不是模板 bug: 未设 api_base/model_id 就是这个形状。
    //
    // 真正要钉的是括号配平 + '))' 不出现在"占位符之外"。先剔除占位符再查 '))',
    // 否则该断言永远测不到它想测的东西 (它测的是占位符是否存在, 不是拼接是否重复)。
    const PLACEHOLDER = /\((unset)\)/g;
    for (const name of NAMED_CASES) {
      const s = logExternalBenchmarkEnabled(name, {});
      expect(s.endsWith(')')).toBe(true);
      // 括号配平: base 段开 1 个, 每个 '(unset)' 占位符自身配平, 末尾恰好 1 个 ')'
      const opens = s.match(/\(/g) || [];
      const closes = s.match(/\)/g) || [];
      expect(opens.length).toBe(closes.length);
      // 剔除占位符后不得再有连续右括号 —— 这才是"拼接重复"的真正信号。
      // 注意: 剔除后必须先去掉末尾那 1 个合法的收尾 ')', 否则 `(U))` 里的相邻
      // 括号是"占位符 + 模板收尾"这一对, 不是重复拼接 (R431 自身修正过一次)。
      const stripped = s.replace(PLACEHOLDER, '(U)');
      expect(stripped.slice(0, -1)).not.toMatch(/\)\)/);
      expect(s.indexOf('(')).toBe(name.length); // base 的第一个 '(' 紧跟名字
    }
  });
});
