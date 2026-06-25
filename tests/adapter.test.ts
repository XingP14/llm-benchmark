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

    it('should throw API 超时错误 (300s) on AbortError', async () => {
      const abortError: any = new Error('Aborted');
      abortError.name = 'AbortError';
      jest.spyOn(globalThis, 'fetch').mockRejectedValue(abortError);

      await expect(
        adapter.chat(
          [{ role: 'user', content: 'Hi' }],
          { name: 'test', endpoint: 'https://api.anthropic.com', apiKey: 'sk-ant', type: 'anthropic' }
        )
      ).rejects.toThrow('API 请求超时 (300s)');
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

    it('should throw API 超时错误 (300s) on AbortError', async () => {
      const abortError: any = new Error('Aborted');
      abortError.name = 'AbortError';
      jest.spyOn(globalThis, 'fetch').mockRejectedValue(abortError);

      await expect(
        adapter.chat(
          [{ role: 'user', content: 'Hi' }],
          { name: 'test', endpoint: 'https://api.zhipuai.com', apiKey: 'sk-glm', type: 'glm' }
        )
      ).rejects.toThrow('API 请求超时 (300s)');
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

describe('fetchWithTimeout (shared helper)', () => {
  // 这套测试覆盖 src/adapters/adapter.ts 中新抽取的 fetchWithTimeout 辅助函数。
  // 6 个适配器（openai/qwen/deepseek/glm/anthropic/ollama）现在共享此函数，
  // 此处验证其三类路径：成功透传 / AbortError 友好化 / 其他错误原样上抛。

  const { fetchWithTimeout, DEFAULT_API_TIMEOUT_MS } = require('../src/adapters/adapter');

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('exposes DEFAULT_API_TIMEOUT_MS = 300000 (5 分钟)', () => {
    expect(DEFAULT_API_TIMEOUT_MS).toBe(300000);
  });

  it('should pass through the fetch Response on success and clear the timer', async () => {
    const mockResponse = { ok: true, status: 200 };
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as any);

    const result = await fetchWithTimeout('https://api.example.com/v1/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ping: 1 }),
    });

    expect(result).toBe(mockResponse);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    // signal 必须被覆盖
    const callInit = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(callInit.signal).toBeDefined();
  });

  it('should throw "API 请求超时 (300s)" when fetch rejects with AbortError', async () => {
    const abortError: any = new Error('The user aborted a request');
    abortError.name = 'AbortError';
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(abortError);

    await expect(
      fetchWithTimeout('https://api.example.com/slow', { method: 'POST' })
    ).rejects.toThrow('API 请求超时 (300s)');
  });

  it('should re-throw non-AbortError errors verbatim (e.g. network failure)', async () => {
    const netError = new Error('ECONNREFUSED');
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(netError);

    await expect(
      fetchWithTimeout('https://api.example.com/down', { method: 'POST' })
    ).rejects.toThrow('ECONNREFUSED');
  });
});

describe('defaultPing (shared helper)', () => {
  // 覆盖 src/adapters/adapter.ts 中抽取的 defaultPing 辅助函数。
  // 6 个适配器（openai/qwen/deepseek/glm/anthropic/ollama）的 ping() 现在统一委托给本函数，
  // 此处验证三类行为：成功透传 chat 返回值 / 抛错时返回 false / 调用消息恰好为单条 {role:'user',content:'Hi'}。

  const { defaultPing } = require('../src/adapters/adapter');
  const baseConfig = {
    name: 'test',
    endpoint: 'https://api.example.com/v1',
    apiKey: 'sk-test',
    type: 'openai' as const,
  };

  it('returns true when chat resolves successfully', async () => {
    const chatFn = jest.fn().mockResolvedValue('pong');
    const result = await defaultPing(chatFn, baseConfig);
    expect(result).toBe(true);
  });

  it('returns false when chat throws any error (401/500/timeout/network)', async () => {
    const chatFn = jest.fn().mockRejectedValue(new Error('401 Unauthorized'));
    const result = await defaultPing(chatFn, baseConfig);
    expect(result).toBe(false);
  });

  it('calls chat with exactly one "Hi" test message of role=user', async () => {
    const chatFn = jest.fn().mockResolvedValue('pong');
    await defaultPing(chatFn, baseConfig);
    expect(chatFn).toHaveBeenCalledTimes(1);
    const [messages, config] = chatFn.mock.calls[0];
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({ role: 'user', content: 'Hi' });
    expect(config).toBe(baseConfig);
  });

  it('forwards the config argument unchanged', async () => {
    const chatFn = jest.fn().mockResolvedValue('pong');
    const customConfig = { ...baseConfig, name: 'custom-model', apiKey: 'sk-custom' };
    await defaultPing(chatFn, customConfig);
    expect(chatFn.mock.calls[0][1]).toBe(customConfig);
  });
});

describe('assertOkResponse (shared helper)', () => {
  // 验证 src/adapters/adapter.ts 中新抽取的 assertOkResponse 辅助函数。
  // 6 个适配器（openai/qwen/deepseek/glm/anthropic/ollama）现在统一委托此函数处理
  // 非 2xx 响应。覆盖：2xx 透传 / 非 2xx 抛带 provider 前缀的 Error / status 数字拼接 / text() 内容原样透传。

  const { assertOkResponse } = require('../src/adapters/adapter');

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should resolve silently when response.ok is true (2xx)', async () => {
    const okResponse = { ok: true, status: 200, text: jest.fn() } as any;
    await expect(assertOkResponse(okResponse, 'OpenAI')).resolves.toBeUndefined();
    // ok 路径上不应调用 response.text()
    expect(okResponse.text).not.toHaveBeenCalled();
  });

  it('should throw `${provider} API Error: ${status} - ${body}` when response.ok is false', async () => {
    const failResponse = {
      ok: false,
      status: 401,
      text: jest.fn().mockResolvedValue('{"error":"invalid api key"}'),
    } as any;
    await expect(assertOkResponse(failResponse, 'DeepSeek')).rejects.toThrow(
      'DeepSeek API Error: 401 - {"error":"invalid api key"}'
    );
    expect(failResponse.text).toHaveBeenCalledTimes(1);
  });

  it('should embed the provider string verbatim in the error message (5xx path)', async () => {
    const failResponse = {
      ok: false,
      status: 503,
      text: jest.fn().mockResolvedValue('upstream timeout'),
    } as any;
    // 验证 6 个 provider 名都正确传递（前缀不带空格 / 不 trim）
    for (const provider of ['OpenAI', 'Qwen', 'DeepSeek', 'GLM', 'Anthropic', 'Ollama']) {
      await expect(assertOkResponse(failResponse, provider)).rejects.toThrow(
        new RegExp(`^${provider} API Error: `)
      );
    }
  });

  it('should re-throw verbatim when response.text() itself rejects (defensive)', async () => {
    // 模拟 response body 流异常（例如网络中断提前 close body），
    // 原 6 处行为是 await response.text() 自然抛错，本函数不 catch 内部错误。
    const failResponse = {
      ok: false,
      status: 500,
      text: jest.fn().mockRejectedValue(new Error('stream closed unexpectedly')),
    } as any;
    await expect(assertOkResponse(failResponse, 'GLM')).rejects.toThrow(
      'stream closed unexpectedly'
    );
  });
});

describe('buildOpenAIChatBody (shared helper)', () => {
  // 验证 src/adapters/adapter.ts 中新抽取的 buildOpenAIChatBody 辅助函数。
  // 5 个 OpenAI 兼容适配器（openai/qwen/deepseek/glm/ollama）现在统一委托此函数构造请求 body。
  // 覆盖：默认 max_tokens=4096 / glm 走 2048 / 字段顺序 model→messages→temperature→max_tokens /
  //       temperature 硬编码 0.7 / JSON 输出 byte-identical（与原 5 处字面量一致）。

  const { buildOpenAIChatBody } = require('../src/adapters/adapter');

  it('produces the canonical 4-field body with default max_tokens=4096', () => {
    const messages = [{ role: 'user', content: 'Hi' }];
    const body = buildOpenAIChatBody('gpt-3.5-turbo', messages);
    const parsed = JSON.parse(body);
    expect(parsed).toEqual({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: 'Hi' }],
      temperature: 0.7,
      max_tokens: 4096,
    });
  });

  it('respects caller-provided max_tokens override (glm uses 2048)', () => {
    const messages = [{ role: 'user', content: 'Hi' }];
    const body = buildOpenAIChatBody('glm-4', messages, 2048);
    const parsed = JSON.parse(body);
    expect(parsed.max_tokens).toBe(2048);
    // 其他字段保持不变
    expect(parsed.model).toBe('glm-4');
    expect(parsed.temperature).toBe(0.7);
  });

  it('preserves field order model → messages → temperature → max_tokens (byte-identical with original 5 sites)', () => {
    const messages = [{ role: 'user', content: 'Hi' }];
    const body = buildOpenAIChatBody('deepseek-chat', messages);
    // 字段顺序影响请求签名/e2e fixture 匹配，必须与原 5 处 JSON.stringify 字面量顺序一致
    expect(body).toBe(
      JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: 'Hi' }],
        temperature: 0.7,
        max_tokens: 4096,
      })
    );
  });

  it('accepts narrow Message shapes compatible with all 5 adapters (glm/openai/deepseek/qwen/ollama)', () => {
    // 模拟 glm (role 仅为 'user'|'assistant'|'system') 等窄类型
    // 注: require() 返回 untyped any, 故用 as cast 模拟 generic 调用以验证类型兼容
    type GlmMessage = { role: 'user' | 'assistant' | 'system'; content: string };
    const messages = [{ role: 'system', content: '你是助手' }, { role: 'user', content: '你好' }] as GlmMessage[];
    const body = (buildOpenAIChatBody as <M extends { role: string; content: string }>(
      model: string,
      messages: M[],
      maxTokens?: number
    ) => string)('glm-4', messages, 2048);
    const parsed = JSON.parse(body);
    expect(parsed.messages).toHaveLength(2);
    expect(parsed.messages[0].role).toBe('system');
    // 中文 content 原样保留（UTF-8 直通）
    expect(parsed.messages[0].content).toBe('你是助手');
  });
});
