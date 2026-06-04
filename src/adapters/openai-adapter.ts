// src/adapters/openai-adapter.ts - OpenAI 兼容接口适配器

import { ModelConfig } from '../types';
import { LLMAdapter } from './adapter';

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

    // 推理模型需要更长时间，300秒超时
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 300000);

    try {
      const response = await fetch(url, {
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
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `OpenAI API Error: ${response.status} - ${errorText}`
        );
      }

      const data = await response.json() as any;

      if (data.error) {
        throw new Error(`OpenAI Error: ${data.error.message}`);
      }

      // 优先使用 content，如果为空则尝试 reasoning_content（推理模型）
      const choice = data.choices?.[0]?.message;
      const content = choice?.content || '';
      const reasoning = choice?.reasoning_content || '';
      return content || reasoning || '';
    } catch (err: any) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        throw new Error('API 请求超时 (300s)');
      }
      throw err;
    }
  }

  async ping(config: ModelConfig): Promise<boolean> {
    try {
      const testMessages: OpenAIMessage[] = [
        { role: 'user', content: 'Hi' },
      ];
      await this.chat(testMessages, config);
      return true;
    } catch {
      return false;
    }
  }
}
