// src/adapters/openai-adapter.ts - OpenAI 兼容接口适配器

import { ModelConfig } from '../types';
import { LLMAdapter } from './adapter';

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenAIResponse {
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
        max_tokens: 2048,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `OpenAI API Error: ${response.status} - ${errorText}`
      );
    }

    const data = await response.json() as OpenAIResponse;

    if (data.error) {
      throw new Error(`OpenAI Error: ${data.error.message}`);
    }

    return data.choices[0]?.message?.content || '';
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
