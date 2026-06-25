// src/adapters/anthropic-adapter.ts - Anthropic Claude 适配器

import { ModelConfig } from '../types';
import {
  LLMAdapter,
  fetchWithTimeout,
  defaultPing,
  assertOkResponse,
  throwIfProviderError,
  buildAnthropicChatBody,
} from './adapter';

interface AnthropicMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface AnthropicContent {
  type: 'text';
  text: string;
}

interface AnthropicResponse {
  content: AnthropicContent[];
  error?: {
    type: string;
    message: string;
  };
  type?: string;
}

export class AnthropicAdapter implements LLMAdapter {
  getName(): string {
    return 'Anthropic Claude';
  }

  async chat(
    messages: AnthropicMessage[],
    config: ModelConfig
  ): Promise<string> {
    const model = config.model || 'claude-3-haiku-20240307';
    const endpoint = config.endpoint || 'https://api.anthropic.com';
    const url = `${endpoint}/v1/messages`;

    // 超时与 AbortController 防御统一由 fetchWithTimeout 提供
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(buildAnthropicChatBody(model, messages)),
    });

    if (!response.ok) await assertOkResponse(response, 'Anthropic');

    const data = (await response.json()) as AnthropicResponse;

    throwIfProviderError(data, 'Anthropic');

    // 提取文本内容（Anthropic 返回 content[] 而非 choices[]，所以不能用
    // extractOpenAIChatContent；这里只有 1 个分支，保留原地实现）
    const textContent = data.content.find(c => c.type === 'text');
    return textContent?.text || '';
  }

  async ping(config: ModelConfig): Promise<boolean> {
    return defaultPing(this.chat.bind(this), config);
  }
}
