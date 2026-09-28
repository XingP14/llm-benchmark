// tests/adapter-glm-ollama-branch-coverage.test.ts
// 补 GLMAdapter / OllamaAdapter 未覆盖分支（延续 76fa439 / 245fc59 /
// e03b07c 的 adapter 分支补齐轮次）：
//   - glm-adapter.ts:41     `config.model || 'glm-4'` 默认模型短路分支
//   - glm-adapter.ts:42     GLM 无 endpoint 默认值，url 直接拼 config.endpoint
//                           （与 Qwen/DeepSeek 的 `|| default` 形态不同，
//                           需 pin 住「用户必须提供 endpoint」这一契约）
//   - glm-adapter.ts:54     !response.ok → assertOkResponse('GLM') 抛出路径
//   - glm-adapter.ts:58     throwIfProviderError(data, 'GLM') provider 错误体
//   - ollama-adapter.ts:41  `config.model || 'llama3.2'` 默认模型短路分支
//   - ollama-adapter.ts:46  `config.endpoint || 'http://localhost:11434'`
//                           默认 endpoint 短路分支
//   - ollama-adapter.ts:47  endpoint 尾部斜杠 `replace(/\/$/, '')` 被剥离，
//                           且 Ollama 走 `/v1/chat/completions`（OpenAI 兼容层
//                           前缀由适配器自己补，Anthropic/Qwen 等不带 /v1）
//   - ollama-adapter.ts:50  `config.apiKey || 'ollama'` 本地推理免鉴权回落
//   - ollama-adapter.ts:62  !response.ok → assertOkResponse('Ollama')
//
// 回归动机：ollama 的 `/v1` 前缀拼接 + 尾斜杠剥离是一个纯字符串技巧，
// 删掉 `.replace(/\/$/, '')` 会让 http://localhost:11434/ 变成双斜杠 URL；
// 删掉 `config.apiKey || 'ollama'` 会让本地免鉴权场景发出 `Bearer undefined`。
// 这两处此前没有任何 gate。

import type { ModelConfig } from '../src/types';
import { GLMAdapter } from '../src/adapters/glm-adapter';
import { OllamaAdapter } from '../src/adapters/ollama-adapter';

const okResponse = (payload: unknown) => ({
  ok: true,
  json: jest.fn().mockResolvedValue(payload),
});

const openAiPayload = (content: string) => ({
  choices: [{ message: { content } }],
});

const baseConfig: ModelConfig = {
  name: 'test',
  endpoint: '',
  model: '',
  apiKey: 'sk-test-key',
  type: 'openai',
};

describe('GLMAdapter uncovered branches', () => {
  const adapter = new GLMAdapter();

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should default to glm-4 when model is empty', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(okResponse(openAiPayload('Hi')) as any);

    await adapter.chat([{ role: 'user', content: 'Hi' }], {
      ...baseConfig,
      endpoint: 'https://open.bigmodel.cn/api/paas/v4',
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://open.bigmodel.cn/api/paas/v4/chat/completions',
      expect.objectContaining({
        body: expect.stringContaining('"model":"glm-4"'),
      })
    );
  });

  it('should respect a user-supplied endpoint verbatim (no /v1 or default injected)', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(okResponse(openAiPayload('Hi')) as any);

    await adapter.chat([{ role: 'user', content: 'Hi' }], {
      ...baseConfig,
      endpoint: 'https://proxy.example.com/glm',
      model: 'glm-4-plus',
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://proxy.example.com/glm/chat/completions',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer sk-test-key' }),
        body: expect.stringContaining('"model":"glm-4-plus"'),
      })
    );
  });

  it('should throw with the GLM provider label when the response is not ok', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: jest.fn().mockResolvedValue({ error: { message: 'bad token' } }),
      text: jest.fn().mockResolvedValue('{"error":{"message":"bad token"}}'),
    } as any);

    await expect(
      adapter.chat([{ role: 'user', content: 'Hi' }], {
        ...baseConfig,
        endpoint: 'https://open.bigmodel.cn/api/paas/v4',
      })
    ).rejects.toThrow(/GLM/);
  });

  it('should throw the provider error message carried in the 200 response body', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        okResponse({ error: { message: 'quota exhausted', type: 'insufficient_quota' } }) as any
      );

    await expect(
      adapter.chat([{ role: 'user', content: 'Hi' }], {
        ...baseConfig,
        endpoint: 'https://open.bigmodel.cn/api/paas/v4',
      })
    ).rejects.toThrow(/quota exhausted/);
  });

  it('should resolve ping() to true on a successful round-trip', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(okResponse(openAiPayload('pong')) as any);

    await expect(
      adapter.ping({ ...baseConfig, endpoint: 'https://open.bigmodel.cn/api/paas/v4' })
    ).resolves.toBe(true);
  });
});

describe('OllamaAdapter uncovered branches', () => {
  const adapter = new OllamaAdapter();

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should default to llama3.2 + http://localhost:11434 and append /v1/chat/completions', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(okResponse(openAiPayload('Hi')) as any);

    await adapter.chat([{ role: 'user', content: 'Hi' }], { ...baseConfig, apiKey: '' });

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:11434/v1/chat/completions',
      expect.objectContaining({
        // 本地推理免鉴权：回落到 'ollama' 占位 key，而不是 Bearer undefined
        headers: expect.objectContaining({ Authorization: 'Bearer ollama' }),
        body: expect.stringContaining('"model":"llama3.2"'),
      })
    );
  });

  it('should strip a single trailing slash from a custom endpoint before appending /v1', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(okResponse(openAiPayload('Hi')) as any);

    await adapter.chat([{ role: 'user', content: 'Hi' }], {
      ...baseConfig,
      endpoint: 'http://gpu-box.lan:11434/',
      model: 'qwen2.5',
      apiKey: 'proxy-secret',
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://gpu-box.lan:11434/v1/chat/completions',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer proxy-secret' }),
        body: expect.stringContaining('"model":"qwen2.5"'),
      })
    );
  });

  it('should raise the 4096-token max_tokens budget used for long local answers', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(okResponse(openAiPayload('Hi')) as any);

    await adapter.chat([{ role: 'user', content: 'Hi' }], { ...baseConfig });

    const [, init] = fetchSpy.mock.calls[0];
    expect(String(init?.body)).toContain('"max_tokens":4096');
  });

  it('should throw with the Ollama provider label when the response is not ok', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: jest.fn().mockResolvedValue({ error: 'model not found' }),
      text: jest.fn().mockResolvedValue('model not found'),
    } as any);

    await expect(adapter.chat([{ role: 'user', content: 'Hi' }], { ...baseConfig })).rejects.toThrow(
      /Ollama/
    );
  });

  it('should throw the provider error message carried in the 200 response body', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(okResponse({ error: { message: 'no slot available', type: 'runtime' } }) as any);

    await expect(adapter.chat([{ role: 'user', content: 'Hi' }], { ...baseConfig })).rejects.toThrow(
      /no slot available/
    );
  });

  it('should resolve ping() to true on a successful round-trip', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse(openAiPayload('pong')) as any);

    await expect(adapter.ping({ ...baseConfig })).resolves.toBe(true);
  });
});
