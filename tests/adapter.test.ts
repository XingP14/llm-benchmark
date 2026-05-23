// tests/adapter.test.ts

import { OpenAIAdapter } from '../src/adapters/openai-adapter';

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
