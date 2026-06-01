// src/adapters/qwen-adapter.ts - 通义千问 Qwen 适配器（DashScope OpenAI 兼容）

import { ModelConfig } from '../types';
import { LLMAdapter } from './adapter';

interface QwenMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface QwenResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  error?: {
    message: string;
    type: string;
  };
}

/**
 * Qwen (DashScope) 适配器
 * 官方 OpenAI 兼容接口: https://dashscope.aliyuncs.com/compatible-mode/v1
 * 默认模型:
 *   - qwen-turbo     (轻量快速)
 *   - qwen-plus      (均衡)
 *   - qwen-max       (高质量)
 *   - qwen3-max      (旗舰推理)
 */
export class QwenAdapter implements LLMAdapter {
  getName(): string {
    return 'Qwen (DashScope)';
  }

  async chat(
    messages: QwenMessage[],
    config: ModelConfig
  ): Promise<string> {
    const model = config.model || 'qwen-turbo';
    // 如果用户在 endpoint 自定义则尊重，否则用 DashScope OpenAI 兼容模式
    const endpoint = config.endpoint || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
    const url = `${endpoint.replace(/\/$/, '')}/chat/completions`;

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
          `Qwen API Error: ${response.status} - ${errorText}`
        );
      }

      const data = (await response.json()) as QwenResponse;

      if (data.error) {
        throw new Error(`Qwen Error: ${data.error.message}`);
      }

      return data.choices?.[0]?.message?.content || '';
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
      const testMessages: QwenMessage[] = [
        { role: 'user', content: 'Hi' },
      ];
      await this.chat(testMessages, config);
      return true;
    } catch {
      return false;
    }
  }
}
