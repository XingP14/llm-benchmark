// src/adapters/glm-adapter.ts - 智谱 GLM 适配器（OpenAI 兼容）

import { ModelConfig } from '../types';
import { LLMAdapter, fetchWithTimeout, defaultPing, assertOkResponse, buildOpenAIChatBody } from './adapter';

interface GLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface GLMResponse {
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
 * 智谱 GLM 适配器
 * 官方 OpenAI 兼容接口: https://open.bigmodel.cn/api/paas/v4
 * 默认模型:
 *   - glm-4          (标准对话)
 *   - glm-4-plus     (高质量)
 *   - glm-4-air      (轻量快速)
 *   - glm-z1-air     (推理模型)
 */
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

    // 超时与 AbortController 防御统一由 fetchWithTimeout 提供
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: buildOpenAIChatBody(model, messages, 2048),
    });

    if (!response.ok) await assertOkResponse(response, 'GLM');

    const data = (await response.json()) as GLMResponse;

    if (data.error) {
      throw new Error(`GLM Error: ${data.error.message}`);
    }

    return data.choices[0]?.message?.content || '';
  }

  async ping(config: ModelConfig): Promise<boolean> {
    return defaultPing(this.chat.bind(this), config);
  }
}
