// src/adapters/deepseek-adapter.ts - DeepSeek 适配器（OpenAI 兼容）

import { ModelConfig } from '../types';
import { LLMAdapter, fetchWithTimeout } from './adapter';

interface DeepSeekMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface DeepSeekResponse {
  choices: Array<{
    message: {
      content: string;
      reasoning_content?: string;
    };
  }>;
  error?: {
    message: string;
    type: string;
  };
}

/**
 * DeepSeek 适配器
 * 官方 OpenAI 兼容接口: https://api.deepseek.com/v1
 * 默认模型:
 *   - deepseek-chat      (V3，对话/通用)
 *   - deepseek-reasoner  (R1，推理模型，支持 reasoning_content)
 */
export class DeepSeekAdapter implements LLMAdapter {
  getName(): string {
    return 'DeepSeek';
  }

  async chat(
    messages: DeepSeekMessage[],
    config: ModelConfig
  ): Promise<string> {
    const model = config.model || 'deepseek-chat';
    // 如果用户在 endpoint 自定义则尊重，否则用官方默认
    const endpoint = config.endpoint || 'https://api.deepseek.com/v1';
    const url = `${endpoint.replace(/\/$/, '')}/chat/completions`;

    // 推理模型可能耗时较长，超时与 AbortController 防御统一由 fetchWithTimeout 提供
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        temperature: 0.7,
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `DeepSeek API Error: ${response.status} - ${errorText}`
      );
    }

    const data = (await response.json()) as DeepSeekResponse;

    if (data.error) {
      throw new Error(`DeepSeek Error: ${data.error.message}`);
    }

    const choice = data.choices?.[0]?.message;
    const content = choice?.content || '';
    // 推理模型（deepseek-reasoner）会同时返回 reasoning_content
    const reasoning = choice?.reasoning_content || '';
    return content || reasoning || '';
  }

  async ping(config: ModelConfig): Promise<boolean> {
    try {
      const testMessages: DeepSeekMessage[] = [
        { role: 'user', content: 'Hi' },
      ];
      await this.chat(testMessages, config);
      return true;
    } catch {
      return false;
    }
  }
}
