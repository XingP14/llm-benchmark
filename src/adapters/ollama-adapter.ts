// src/adapters/ollama-adapter.ts - Ollama 本地模型适配器（OpenAI 兼容）

import { ModelConfig } from '../types';
import { LLMAdapter, fetchWithTimeout, defaultPing, assertOkResponse } from './adapter';

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OllamaResponse {
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
 * Ollama 本地模型适配器
 * 官方 OpenAI 兼容接口: http://localhost:11434/v1
 * 默认模型:
 *   - llama3.2      (Meta 最新轻量)
 *   - qwen2.5       (阿里通义本地版)
 *   - mistral       (Mistral AI)
 *   - codellama     (代码专用)
 *   - deepseek-r1   (推理模型)
 *
 * Ollama 本地运行通常无需 API Key；用户也可在 config.apiKey 中填入反向代理密钥。
 */
export class OllamaAdapter implements LLMAdapter {
  getName(): string {
    return 'Ollama (Local)';
  }

  async chat(
    messages: OllamaMessage[],
    config: ModelConfig
  ): Promise<string> {
    const model = config.model || 'llama3.2';
    // 如果用户在 endpoint 自定义则尊重，否则用 Ollama 默认
    const endpoint = config.endpoint || 'http://localhost:11434';
    const url = `${endpoint.replace(/\/$/, '')}/v1/chat/completions`;

    // Ollama 本地推理一般不需要 API key；若用户提供则使用（支持反向代理）
    const apiKey = config.apiKey || 'ollama';

    // 超时与 AbortController 防御统一由 fetchWithTimeout 提供
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        temperature: 0.7,
        max_tokens: 4096,
      }),
    });

    if (!response.ok) await assertOkResponse(response, 'Ollama');

    const data = (await response.json()) as OllamaResponse;

    if (data.error) {
      throw new Error(`Ollama Error: ${data.error.message}`);
    }

    return data.choices?.[0]?.message?.content || '';
  }

  async ping(config: ModelConfig): Promise<boolean> {
    return defaultPing(this.chat.bind(this), config);
  }
}
