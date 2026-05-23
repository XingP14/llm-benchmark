// tests/adapter.test.ts - 适配器测试

import { OpenAIAdapter } from '../src/adapters/openai-adapter';
import { AnthropicAdapter } from '../src/adapters/anthropic-adapter';
import { GLMAdapter } from '../src/adapters/glm-adapter';

describe('OpenAIAdapter', () => {
  const adapter = new OpenAIAdapter();

  it('should have correct name', () => {
    expect(adapter.getName()).toBe('OpenAI Compatible');
  });

  describe('ping', () => {
    it('should return false for invalid endpoint', async () => {
      const config = {
        name: 'test',
        endpoint: 'https://invalid-endpoint.com',
        apiKey: 'invalid',
        type: 'openai' as const,
      };

      const result = await adapter.ping(config);
      expect(result).toBe(false);
    });
  });
});

describe('AnthropicAdapter', () => {
  const adapter = new AnthropicAdapter();

  it('should have correct name', () => {
    expect(adapter.getName()).toBe('Anthropic Claude');
  });

  describe('ping', () => {
    it('should return false for invalid endpoint', async () => {
      const config = {
        name: 'test',
        endpoint: 'https://invalid-endpoint.com',
        apiKey: 'invalid',
        type: 'anthropic' as const,
      };

      const result = await adapter.ping(config);
      expect(result).toBe(false);
    });
  });
});

describe('GLMAdapter', () => {
  const adapter = new GLMAdapter();

  it('should have correct name', () => {
    expect(adapter.getName()).toBe('Zhipu GLM');
  });

  describe('ping', () => {
    it('should return false for invalid endpoint', async () => {
      const config = {
        name: 'test',
        endpoint: 'https://invalid-endpoint.com',
        apiKey: 'invalid',
        type: 'glm' as const,
      };

      const result = await adapter.ping(config);
      expect(result).toBe(false);
    });
  });
});
