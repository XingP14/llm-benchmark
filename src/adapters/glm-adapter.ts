// src/adapters/glm-adapter.ts - 智谱 GLM 适配器

import { ModelConfig } from '../types';
import { LLMAdapter } from './adapter';

interface GLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface GLMResponse {
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
  }>;
  error?: {
    message: string;
    type: string;
  };
}

export class GLMAdapter implements LLMAdapter {
  getName(): string {
    return 'Zhipu GLM';
  }

  async chat(
    messages: GLMMessage[],
    config: ModelConfig
  ): Promise<string> {
    const model = config.model || 'glm-4';
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
        `GLM API Error: ${response.status} - ${errorText}`
      );
    }

    const data = await response.json() as GLMResponse;

    if (data.error) {
      throw new Error(`GLM Error: ${data.error.message}`);
    }

    return data.choices[0]?.message?.content || '';
  }

  async ping(config: ModelConfig): Promise<boolean> {
    try {
      const testMessages: GLMMessage[] = [
        { role: 'user', content: 'Hi' },
      ];
      await this.chat(testMessages, config);
      return true;
    } catch {
      return false;
    }
  }
}
