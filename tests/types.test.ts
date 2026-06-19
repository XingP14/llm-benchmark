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
  });
});
