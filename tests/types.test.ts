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
  });
});
