// src/adapters/adapter.ts - 适配器接口

import { ModelConfig } from '../types';

/**
 * LLM 适配器接口
 * 所有模型适配器需实现此接口
 */
export interface LLMAdapter {
  /**
   * 发送对话请求
   */
  chat(
    messages: Array<{ role: string; content: string }>,
    config: ModelConfig
  ): Promise<string>;

  /**
   * 测试连接是否正常
   */
  ping(config: ModelConfig): Promise<boolean>;

  /**
   * 获取适配器名称
   */
  getName(): string;
}
