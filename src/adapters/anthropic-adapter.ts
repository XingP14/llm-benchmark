// src/adapters/anthropic-adapter.ts - Anthropic Claude 适配器

import { ModelConfig } from '../types';
import { LLMAdapter } from './adapter';

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

    // Anthropic API 需要 system message 单独传递
    // 从 messages 中提取 system message
    const systemMessage = messages.find(m => m.role === 'system');
    const userMessages = messages.filter(m => m.role !== 'system');

    const body: Record<string, any> = {
      model: model,
      max_tokens: 2048,
      messages: userMessages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    };

    if (systemMessage) {
      body.system = systemMessage.content;
    }

    // 推理模型可能耗时较长，300秒超时（与 openai/qwen/deepseek 对齐，
    // 此前 AnthropicAdapter 缺 AbortController，接口 hang 时无防御）
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 300000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Anthropic API Error: ${response.status} - ${errorText}`
        );
      }

      const data = (await response.json()) as AnthropicResponse;

      if (data.error) {
        throw new Error(`Anthropic Error: ${data.error.message}`);
      }

      // 提取文本内容
      const textContent = data.content.find(c => c.type === 'text');
      return textContent?.text || '';
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
      const testMessages: AnthropicMessage[] = [
        { role: 'user', content: 'Hi' },
      ];
      await this.chat(testMessages, config);
      return true;
    } catch {
      return false;
    }
  }
}
