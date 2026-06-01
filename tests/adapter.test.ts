// tests/adapter.test.ts - 适配器测试 (包含 fetch mock)

import { OpenAIAdapter } from '../src/adapters/openai-adapter';
import { AnthropicAdapter } from '../src/adapters/anthropic-adapter';
import { GLMAdapter } from '../src/adapters/glm-adapter';
import { DeepSeekAdapter } from '../src/adapters/deepseek-adapter';
import { QwenAdapter } from '../src/adapters/qwen-adapter';
import { OllamaAdapter } from '../src/adapters/ollama-adapter';

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

  describe('chat', () => {
    it('should return content on successful response', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{ message: { content: 'Hello from OpenAI' } }],
        }),
      };
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as any);

      const result = await adapter.chat(
        [{ role: 'user', content: 'Hi' }],
        { name: 'test', endpoint: 'https://api.openai.com/v1', apiKey: 'sk-test', type: 'openai' }
      );

      expect(result).toBe('Hello from OpenAI');
      jest.restoreAllMocks();
    });

    it('should throw error on non-ok response', async () => {
      const mockResponse = {
        ok: false,
        status: 401,
        text: jest.fn().mockResolvedValue('Unauthorized'),
      };
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as any);

      await expect(
        adapter.chat(
          [{ role: 'user', content: 'Hi' }],
          { name: 'test', endpoint: 'https://api.openai.com/v1', apiKey: 'bad', type: 'openai' }
        )
      ).rejects.toThrow('OpenAI API Error: 401');
      jest.restoreAllMocks();
    });

    it('should throw error on API error in response body', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          error: { message: 'Rate limit exceeded', type: 'rate_limit_error' },
        }),
      };
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as any);

      await expect(
        adapter.chat(
          [{ role: 'user', content: 'Hi' }],
          { name: 'test', endpoint: 'https://api.openai.com/v1', apiKey: 'sk-test', type: 'openai' }
        )
      ).rejects.toThrow('OpenAI Error: Rate limit exceeded');
      jest.restoreAllMocks();
    });

    it('should handle empty choices array', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [],
        }),
      };
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as any);

      const result = await adapter.chat(
        [{ role: 'user', content: 'Hi' }],
        { name: 'test', endpoint: 'https://api.openai.com/v1', apiKey: 'sk-test', type: 'openai' }
      );

      expect(result).toBe('');
      jest.restoreAllMocks();
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

  describe('chat', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should return content on successful response', async () => {
      const mockJson = jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Hello from Claude' }],
      });
      const mockResponse = {
        ok: true,
        json: mockJson,
      };
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as any);

      const result = await adapter.chat(
        [{ role: 'user', content: 'Hi' }],
        { name: 'test', endpoint: 'https://api.anthropic.com', apiKey: 'sk-ant', type: 'anthropic' }
      );

      expect(result).toBe('Hello from Claude');
    });

    it('should throw error on non-ok response', async () => {
      const mockResponse = {
        ok: false,
        status: 403,
        text: jest.fn().mockResolvedValue('Forbidden'),
      };
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as any);

      await expect(
        adapter.chat(
          [{ role: 'user', content: 'Hi' }],
          { name: 'test', endpoint: 'https://api.anthropic.com', apiKey: 'bad', type: 'anthropic' }
        )
      ).rejects.toThrow('Anthropic API Error: 403');
      jest.restoreAllMocks();
    });

    it('should throw error on API error in response body', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          error: { message: 'Invalid request', type: 'invalid_request_error' },
        }),
      };
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as any);

      await expect(
        adapter.chat(
          [{ role: 'user', content: 'Hi' }],
          { name: 'test', endpoint: 'https://api.anthropic.com', apiKey: 'sk-ant', type: 'anthropic' }
        )
      ).rejects.toThrow('Anthropic Error: Invalid request');
      jest.restoreAllMocks();
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

  describe('chat', () => {
    it('should return content on successful response', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{ message: { content: 'Hello from GLM' } }],
        }),
      };
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as any);

      const result = await adapter.chat(
        [{ role: 'user', content: 'Hi' }],
        { name: 'test', endpoint: 'https://api.zhipuai.com', apiKey: 'sk-glm', type: 'glm' }
      );

      expect(result).toBe('Hello from GLM');
      jest.restoreAllMocks();
    });

    it('should throw error on non-ok response', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        text: jest.fn().mockResolvedValue('Internal Server Error'),
      };
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as any);

      await expect(
        adapter.chat(
          [{ role: 'user', content: 'Hi' }],
          { name: 'test', endpoint: 'https://api.zhipuai.com', apiKey: 'bad', type: 'glm' }
        )
      ).rejects.toThrow('GLM API Error: 500');
      jest.restoreAllMocks();
    });

    it('should throw error on API error in response body', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          error: { message: 'Model not found', type: 'model_error' },
        }),
      };
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as any);

      await expect(
        adapter.chat(
          [{ role: 'user', content: 'Hi' }],
          { name: 'test', endpoint: 'https://api.zhipuai.com', apiKey: 'sk-glm', type: 'glm' }
        )
      ).rejects.toThrow('GLM Error: Model not found');
      jest.restoreAllMocks();
    });
  });
});

describe('DeepSeekAdapter', () => {
  const adapter = new DeepSeekAdapter();

  it('should have correct name', () => {
    expect(adapter.getName()).toBe('DeepSeek');
  });

  describe('ping', () => {
    it('should return false for invalid endpoint', async () => {
      const config = {
        name: 'test',
        endpoint: 'https://invalid-endpoint.com',
        apiKey: 'invalid',
        type: 'deepseek' as const,
      };

      const result = await adapter.ping(config);
      expect(result).toBe(false);
    });
  });

  describe('chat', () => {
    it('should return content on successful response', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{ message: { content: 'Hello from DeepSeek' } }],
        }),
      };
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as any);

      const result = await adapter.chat(
        [{ role: 'user', content: 'Hi' }],
        { name: 'test', endpoint: 'https://api.deepseek.com/v1', apiKey: 'sk-ds', type: 'deepseek' }
      );

      expect(result).toBe('Hello from DeepSeek');
      jest.restoreAllMocks();
    });

    it('should fallback to reasoning_content when content is empty', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{ message: { content: '', reasoning_content: 'thinking...' } }],
        }),
      };
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as any);

      const result = await adapter.chat(
        [{ role: 'user', content: 'Solve this' }],
        { name: 'test', endpoint: 'https://api.deepseek.com/v1', apiKey: 'sk-ds', type: 'deepseek', model: 'deepseek-reasoner' }
      );

      expect(result).toBe('thinking...');
      jest.restoreAllMocks();
    });

    it('should throw error on non-ok response', async () => {
      const mockResponse = {
        ok: false,
        status: 401,
        text: jest.fn().mockResolvedValue('Unauthorized'),
      };
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as any);

      await expect(
        adapter.chat(
          [{ role: 'user', content: 'Hi' }],
          { name: 'test', endpoint: 'https://api.deepseek.com/v1', apiKey: 'bad', type: 'deepseek' }
        )
      ).rejects.toThrow('DeepSeek API Error: 401');
      jest.restoreAllMocks();
    });

    it('should throw error on API error in response body', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          error: { message: 'Invalid API key', type: 'authentication_error' },
        }),
      };
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as any);

      await expect(
        adapter.chat(
          [{ role: 'user', content: 'Hi' }],
          { name: 'test', endpoint: 'https://api.deepseek.com/v1', apiKey: 'bad', type: 'deepseek' }
        )
      ).rejects.toThrow('DeepSeek Error: Invalid API key');
      jest.restoreAllMocks();
    });
  });
});

describe('QwenAdapter', () => {
  const adapter = new QwenAdapter();

  it('should have correct name', () => {
    expect(adapter.getName()).toBe('Qwen (DashScope)');
  });

  describe('ping', () => {
    it('should return false for invalid endpoint', async () => {
      const config = {
        name: 'test',
        endpoint: 'https://invalid-endpoint.com',
        apiKey: 'invalid',
        type: 'qwen' as const,
      };

      const result = await adapter.ping(config);
      expect(result).toBe(false);
    });
  });

  describe('chat', () => {
    it('should return content on successful response', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{ message: { content: 'Hello from Qwen' } }],
        }),
      };
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as any);

      const result = await adapter.chat(
        [{ role: 'user', content: 'Hi' }],
        { name: 'test', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1', apiKey: 'sk-qwen', type: 'qwen' }
      );

      expect(result).toBe('Hello from Qwen');
      jest.restoreAllMocks();
    });

    it('should send Authorization Bearer with API key', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{ message: { content: 'OK' } }],
        }),
      };
      const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as any);

      await adapter.chat(
        [{ role: 'user', content: 'Hi' }],
        { name: 'test', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1', apiKey: 'sk-test-123', type: 'qwen' }
      );

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer sk-test-123',
          }),
        })
      );
      jest.restoreAllMocks();
    });

    it('should throw error on non-ok response', async () => {
      const mockResponse = {
        ok: false,
        status: 403,
        text: jest.fn().mockResolvedValue('Forbidden'),
      };
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as any);

      await expect(
        adapter.chat(
          [{ role: 'user', content: 'Hi' }],
          { name: 'test', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1', apiKey: 'bad', type: 'qwen' }
        )
      ).rejects.toThrow('Qwen API Error: 403');
      jest.restoreAllMocks();
    });

    it('should throw error on API error in response body', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          error: { message: 'Invalid API key provided', type: 'invalid_api_key' },
        }),
      };
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as any);

      await expect(
        adapter.chat(
          [{ role: 'user', content: 'Hi' }],
          { name: 'test', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1', apiKey: 'bad', type: 'qwen' }
        )
      ).rejects.toThrow('Qwen Error: Invalid API key provided');
      jest.restoreAllMocks();
    });
  });
});

describe('OllamaAdapter', () => {
  const adapter = new OllamaAdapter();

  it('should have correct name', () => {
    expect(adapter.getName()).toBe('Ollama (Local)');
  });

  describe('ping', () => {
    it('should return false for invalid endpoint', async () => {
      const config = {
        name: 'test',
        endpoint: 'https://invalid-endpoint.com',
        apiKey: '',
        type: 'ollama' as const,
      };

      const result = await adapter.ping(config);
      expect(result).toBe(false);
    });
  });

  describe('chat', () => {
    it('should return content on successful response', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{ message: { content: 'Hello from Ollama' } }],
        }),
      };
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as any);

      const result = await adapter.chat(
        [{ role: 'user', content: 'Hi' }],
        { name: 'test', endpoint: 'http://localhost:11434', apiKey: '', type: 'ollama' }
      );

      expect(result).toBe('Hello from Ollama');
      jest.restoreAllMocks();
    });

    it('should default to localhost:11434 when endpoint is empty', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{ message: { content: 'OK' } }],
        }),
      };
      const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as any);

      await adapter.chat(
        [{ role: 'user', content: 'Hi' }],
        { name: 'test', endpoint: '', apiKey: '', type: 'ollama', model: 'llama3.2' }
      );

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:11434/v1/chat/completions',
        expect.objectContaining({
          body: expect.stringContaining('"model":"llama3.2"'),
        })
      );
      jest.restoreAllMocks();
    });

    it('should throw error on non-ok response', async () => {
      const mockResponse = {
        ok: false,
        status: 404,
        text: jest.fn().mockResolvedValue('model not found'),
      };
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as any);

      await expect(
        adapter.chat(
          [{ role: 'user', content: 'Hi' }],
          { name: 'test', endpoint: 'http://localhost:11434', apiKey: '', type: 'ollama', model: 'nonexistent' }
        )
      ).rejects.toThrow('Ollama API Error: 404');
      jest.restoreAllMocks();
    });

    it('should throw error on API error in response body', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          error: { message: 'model \"x\" not found', type: 'model_not_found' },
        }),
      };
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as any);

      await expect(
        adapter.chat(
          [{ role: 'user', content: 'Hi' }],
          { name: 'test', endpoint: 'http://localhost:11434', apiKey: '', type: 'ollama' }
        )
      ).rejects.toThrow('Ollama Error:');
      jest.restoreAllMocks();
    });
  });
});
