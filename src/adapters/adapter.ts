// src/adapters/adapter.ts - 适配器接口与共享工具

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

/**
 * 默认 API 请求超时时间（毫秒）。
 * 推理模型（如 deepseek-reasoner、qwen3-max、o1 系列）单次响应可能耗时数分钟，
 * 因此 5 分钟可覆盖绝大多数真实场景；超过则视为接口 hang，统一抛 "API 请求超时"。
 */
export const DEFAULT_API_TIMEOUT_MS = 300000;

/**
 * 带超时与 AbortController 防御的 fetch 包装。
 *
 * 6 个适配器（openai / qwen / deepseek / glm / anthropic / ollama）原本各自
 * 手写 5 行 "AbortController + setTimeout + clearTimeout + AbortError → 友好错误"
 * 模式，存在三处隐患：
 *   1. 成功路径上 clearTimeout 与 try/catch 中 clearTimeout 容易漏掉一处导致 Node 进程挂起
 *   2. 错误消息字面量散落 6 处，后续调整文案需要 6 处对齐
 *   3. timeout 数值 300000 散落 6 处，魔数无法参数化
 *
 * 抽到此处后，行为 1:1 保留：
 *   - 默认超时 300s
 *   - AbortError → 'API 请求超时 (300s)'（与原消息字面量保持一致，确保现有测试断言不变）
 *   - 其他错误原样上抛
 *   - 成功响应 resolve 一个 fetch Response，由调用方继续 .ok / .json() / .text()
 *
 * @param url       请求 URL
 * @param init      fetch RequestInit（headers / body / method 等），signal 会被覆盖
 * @param timeoutMs 可选超时（毫秒），默认 300000 (5 分钟)
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number = DEFAULT_API_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    return response;
  } catch (err: any) {
    if (err && err.name === 'AbortError') {
      throw new Error('API 请求超时 (300s)');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
