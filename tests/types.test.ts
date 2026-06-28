// tests/types.test.ts

import { ModelConfig, BenchmarkConfig } from '../src/types';

describe('Types', () => {
  describe('ModelConfig', () => {
    it('should have required fields', () => {
      const config: ModelConfig = {
        name: 'test-model',
        endpoint: 'https://api.test.com/v1',
        apiKey: 'test-key',
        type: 'openai',
        model: 'gpt-3.5-turbo',
      };

      expect(config.name).toBe('test-model');
      expect(config.endpoint).toBe('https://api.test.com/v1');
      expect(config.apiKey).toBe('test-key');
      expect(config.type).toBe('openai');
      expect(config.model).toBe('gpt-3.5-turbo');
    });
  });

  describe('BenchmarkConfig', () => {
    it('should have correct structure', () => {
      const config: BenchmarkConfig = {
        models: [],
        benchmarks: {
          dialogue: true,
          coding: true,
        },
      };

      expect(config.benchmarks.dialogue).toBe(true);
      expect(config.benchmarks.coding).toBe(true);
    });

    // 06-20 02:43 cron: 5 type-stub 真实化 (process_aware_scoring / swe_bench_pro / terminal_bench / benchlm_agentic / long_context_cluster) — type-shape smoke test, 补 terminal_bench.subset 字段验证
    it('external_benchmarks_roadmap terminal_bench accepts subset (06-20 type-stub step-1)', () => {
      // 导入动态: ExternalBenchmarksRoadmap 是 internal union, 直接通过任意子集字段断言即可
      type Ext = NonNullable<BenchmarkConfig['_external_benchmarks_roadmap']>;
      const stub: Ext = {
        terminal_bench: {
          enabled: true,
          api_base: 'https://llm-benchmark.local/api/v1/terminal_bench/v2',
          model_id: 'claude-fable-5',
          subset: 'hard', // 06-20 02:43 cron 新增字段
          timeout_ms: 30000,
          anchor_score: 80.3,
        },
        swe_bench_pro: {
          enabled: true,
          api_base: 'https://llm-benchmark.local/api/v1/swe_bench_pro/v1',
          model_id: 'claude-fable-5',
          subset: 'verified',
          agentic_mode: true,
          timeout_ms: 30000,
          anchor_score: 80.3,
        },
        process_aware_scoring: {
          enabled: true,
          api_base: 'https://llm-benchmark.local/api/v1/process_aware_scoring/v1',
          model_id: 'claude-fable-5',
          mode: 'all',
          agentic_benchmark: 'swe_bench_pro',
          pass_fail_weight: 0.7,
          process_weight: 0.3,
          timeout_ms: 30000,
        },
      };
      // subset 字段在 terminal_bench 存在, 枚举 'hard' 被接受
      expect(stub.terminal_bench?.subset).toBe('hard');
      expect(stub.swe_bench_pro?.subset).toBe('verified');
      expect(stub.process_aware_scoring?.mode).toBe('all');
    });

    // 06-20 03:03 cron: 5 type-stub 真实化 step-2 of 5 — benchlm_agentic.subset 字段 (与 terminal_bench.subset / swe_bench_pro.subset / long_context_cluster.subset / cyberseceval3.risk_categories 对位)
    it('external_benchmarks_roadmap benchlm_agentic accepts subset (06-20 type-stub step-2)', () => {
      type Ext = NonNullable<BenchmarkConfig['_external_benchmarks_roadmap']>;
      const stub: Ext = {
        benchlm_agentic: {
          enabled: true,
          api_base: 'https://llm-benchmark.local/api/v1/benchlm_agentic/v1',
          model_id: 'claude-fable-5',
          subset: 'design2code_only', // 06-20 03:03 cron 新增字段
          timeout_ms: 30000,
          anchor_score: 78.5,
          native_evals: false,
        },
      };
      // subset 字段在 benchlm_agentic 存在, 枚举 'design2code_only' 被接受; native_evals=true 与 subset='native_evals_only' 并行不冲突
      expect(stub.benchlm_agentic?.subset).toBe('design2code_only');
      expect(stub.benchlm_agentic?.native_evals).toBe(false);
      // 也验证另一个枚举值
      const stubNativeOnly: Ext = {
        benchlm_agentic: {
          enabled: true,
          subset: 'native_evals_only',
        },
      };
      expect(stubNativeOnly.benchlm_agentic?.subset).toBe('native_evals_only');
    });

    // 06-20 04:23 cron: 5 type-stub 真实化 step-3 of 5 — process_aware_scoring.subset 字段 (与 terminal_bench.subset / swe_bench_pro.subset / long_context_cluster.subset / benchlm_agentic.subset / cyberseceval3.risk_categories 对位)
    it('external_benchmarks_roadmap process_aware_scoring accepts subset (06-20 type-stub step-3)', () => {
      type Ext = NonNullable<BenchmarkConfig['_external_benchmarks_roadmap']>;
      const stub: Ext = {
        process_aware_scoring: {
          enabled: true,
          api_base: 'https://llm-benchmark.local/api/v1/process_aware_scoring/v1',
          model_id: 'claude-fable-5',
          subset: 'commit_metrics', // 06-20 04:23 cron 新增字段 (静态产物 commit_count + file_coverage 双信号)
          mode: 'all',
          agentic_benchmark: 'swe_bench_pro',
          pass_fail_weight: 0.7,
          process_weight: 0.3,
          timeout_ms: 30000,
        },
      };
      // subset 字段在 process_aware_scoring 存在, 枚举 'commit_metrics' 被接受
      expect(stub.process_aware_scoring?.subset).toBe('commit_metrics');
      // 另一枚举验证: runtime_metrics (运行时维度 test_run + retry + trajectory)
      const stubRuntime: Ext = {
        process_aware_scoring: {
          enabled: true,
          subset: 'runtime_metrics',
        },
      };
      expect(stubRuntime.process_aware_scoring?.subset).toBe('runtime_metrics');
    });

    // 06-20 05:03 cron: 5 type-stub 真实化 step-4 of 5 — swe_bench_pro.subset 字段 (与 terminal_bench.subset / benchlm_agentic.subset / process_aware_scoring.subset / long_context_cluster.subset / cyberseceval3.risk_categories 对位)
    it('external_benchmarks_roadmap swe_bench_pro accepts subset (06-20 type-stub step-4)', () => {
      type Ext = NonNullable<BenchmarkConfig['_external_benchmarks_roadmap']>;
      const stub: Ext = {
        swe_bench_pro: {
          enabled: true,
          api_base: 'https://llm-benchmark.local/api/v1/swe_bench_pro/v1',
          model_id: 'claude-fable-5',
          subset: 'multilingual', // 06-20 05:03 cron 字段已存在但 JSDoc 升格 (multilingual 跨 Python/JS/Go/Rust/Java 4-5 语言)
          agentic_mode: true,
          timeout_ms: 30000,
          anchor_score: 80.3,
        },
      };
      // subset 字段在 swe_bench_pro 存在, 枚举 'multilingual' 被接受
      expect(stub.swe_bench_pro?.subset).toBe('multilingual');
      // 另一枚举验证: lite (轻量子集, 快速 sanity check)
      const stubLite: Ext = {
        swe_bench_pro: {
          enabled: true,
          subset: 'lite',
        },
      };
      expect(stubLite.swe_bench_pro?.subset).toBe('lite');
    });

    // 06-20 05:03 cron: 5 type-stub 真实化 step-5 of 5 — long_context_cluster.subset 字段 (与 terminal_bench.subset / benchlm_agentic.subset / process_aware_scoring.subset / swe_bench_pro.subset / cyberseceval3.risk_categories 对位)
    it('external_benchmarks_roadmap long_context_cluster accepts subset (06-20 type-stub step-5)', () => {
      type Ext = NonNullable<BenchmarkConfig['_external_benchmarks_roadmap']>;
      const stub: Ext = {
        long_context_cluster: {
          enabled: true,
          api_base: 'https://llm-benchmark.local/api/v1/long_context_cluster/v1',
          model_id: 'claude-fable-5',
          subset: 'infinitebench', // 06-20 05:03 cron 字段已存在但 JSDoc 升格 (100K+ 超长上下文 18 tasks)
          tasks_total: 18,
          timeout_ms: 30000,
          anchor_score: 89.0,
        },
      };
      // subset 字段在 long_context_cluster 存在, 枚举 'infinitebench' 被接受
      expect(stub.long_context_cluster?.subset).toBe('infinitebench');
      // 另一枚举验证: longbench_v2 (21 tasks, 多领域长文 QA/摘要/dialogue)
      const stubLongbench: Ext = {
        long_context_cluster: {
          enabled: true,
          subset: 'longbench_v2',
          tasks_total: 21,
        },
      };
      expect(stubLongbench.long_context_cluster?.subset).toBe('longbench_v2');
      expect(stubLongbench.long_context_cluster?.tasks_total).toBe(21);
    });

    // 06-29 06:03 cron: 5 type-stub 真实化 step-6 of 5 — 锁定 5 维 dispatch type 字面量 (terminal_bench / benchlm_agentic / swe_bench_pro / long_context_cluster / process_aware_scoring; 06-20 cron 已在 src/types/index.ts 加 type?: 字段, evaluator.ts L136/148/162/171/183 也已 surface, 本 test 锁定 type 字段被外界构造时接受 5 维字面量值, 防止 JSDoc 漂移 + 字面量改写时静默回归)
    it('external_benchmarks_roadmap dispatch type field accepts 5 category literals (06-29 type-stub step-6)', () => {
      type Ext = NonNullable<BenchmarkConfig['_external_benchmarks_roadmap']>;
      // 5 维同时存在, 锁定 type 字面量被 tsc 接受 (compile-time) + 运行时值正确 (runtime)
      const stub: Ext = {
        terminal_bench: {
          enabled: true,
          type: 'agentic_coding',
          api_base: 'https://llm-benchmark.local/api/v1/terminal_bench/v2',
          model_id: 'claude-fable-5',
          subset: 'hard',
          timeout_ms: 30000,
        },
        benchlm_agentic: {
          enabled: true,
          type: 'agentic_fullstack',
          api_base: 'https://llm-benchmark.local/api/v1/benchlm_agentic/v1',
          model_id: 'claude-fable-5',
          subset: 'all',
          timeout_ms: 30000,
        },
        swe_bench_pro: {
          enabled: true,
          type: 'agentic_swe',
          api_base: 'https://llm-benchmark.local/api/v1/swe_bench_pro/v1',
          model_id: 'claude-fable-5',
          subset: 'verified',
          agentic_mode: true,
          timeout_ms: 30000,
        },
        long_context_cluster: {
          enabled: true,
          type: 'long_context_retrieval',
          api_base: 'https://llm-benchmark.local/api/v1/long_context_cluster/v1',
          model_id: 'claude-fable-5',
          subset: 'all',
          tasks_total: 62,
          timeout_ms: 30000,
        },
        process_aware_scoring: {
          enabled: true,
          type: 'process_agentic',
          api_base: 'https://llm-benchmark.local/api/v1/process_aware_scoring/v1',
          model_id: 'claude-fable-5',
          subset: 'all_process_signals',
          mode: 'all',
          agentic_benchmark: 'swe_bench_pro',
          pass_fail_weight: 0.7,
          process_weight: 0.3,
          timeout_ms: 30000,
        },
      };
      // 5 维 type 字段字面量被锁定
      expect(stub.terminal_bench?.type).toBe('agentic_coding');
      expect(stub.benchlm_agentic?.type).toBe('agentic_fullstack');
      expect(stub.swe_bench_pro?.type).toBe('agentic_swe');
      expect(stub.long_context_cluster?.type).toBe('long_context_retrieval');
      expect(stub.process_aware_scoring?.type).toBe('process_agentic');
      // 也验证 type 字段可省略 (optional), 默认走 evaluator.ts L136/148/162/171/183 ?? 'xxx' 兜底
      const stubOptional: Ext = {
        terminal_bench: { enabled: true, api_base: 'x', model_id: 'y' },
      };
      expect(stubOptional.terminal_bench?.type).toBeUndefined();
    });

  });
});
