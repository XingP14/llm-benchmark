// src/adapters/openai-adapter.ts - OpenAI 兼容接口适配器

import { ModelConfig } from '../types';
import { LLMAdapter, fetchWithTimeout, defaultPing, assertOkResponse, buildOpenAIChatBody, throwIfProviderError, extractOpenAIChatContent } from './adapter';

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class OpenAIAdapter implements LLMAdapter {
  getName(): string {
    return 'OpenAI Compatible';
  }

  async chat(
    messages: OpenAIMessage[],
    config: ModelConfig
  ): Promise<string> {
    const model = config.model || 'gpt-3.5-turbo';
    const url = `${config.endpoint}/chat/completions`;

    // 推理模型需要更长时间，超时与 AbortController 防御统一由 fetchWithTimeout 提供
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: buildOpenAIChatBody(model, messages, 4096),
    });

    if (!response.ok) await assertOkResponse(response, 'OpenAI');

    const data = await response.json() as any;

    throwIfProviderError(data, 'OpenAI');

    // 优先使用 content，如果为空则尝试 reasoning_content（推理模型）
    return extractOpenAIChatContent(data, { fallbackToReasoning: true });
  }

  async ping(config: ModelConfig): Promise<boolean> {
    return defaultPing(this.chat.bind(this), config);
  }
}
