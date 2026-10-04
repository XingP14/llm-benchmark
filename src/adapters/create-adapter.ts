// src/adapters/create-adapter.ts - 供应商路由单点真源 (single source of truth)
//
// WHY THIS FILE EXISTS
//
// The vendor-routing switch used to exist TWICE, byte-for-byte in behaviour
// and hand-maintained in both places:
//
//   * src/index.ts:26            `function createAdapter(type)`    (CLI path)
//   * src/web/engine/evaluator.ts:198  `private createAdapter(type)` (web path)
//
// Both are the ONLY thing standing between a user's `type:` field and the
// adapter that speaks that provider's wire protocol, so a mis-route is a
// SILENT wrong-vendor request (an OpenAI-shaped POST carrying a GLM/Qwen
// key), not a crash.
//
// These two copies have ALREADY drifted once. ecf1e07 realigned them by
// hand -- the web copy had been case-sensitive and had no 'zhipu' alias
// while the CLI copy had both -- which is the whole argument for this file:
// a hand-alignment is not an invariant, only a shared function is. Nothing
// stopped the same drift from returning on the next edit to either copy.
//
// The routing contract itself (case-insensitive + alias table + OpenAI
// default) is pinned at runtime by BOTH call paths' existing suites:
//   * tests/index-create-adapter-runtime.test.ts          (CLI copy)
//   * tests/web/evaluator-adapter-type-routing.test.ts     (web copy)
// Both drive this module now, so a regression in either surface is one
// edit away from failing both suites instead of one.
//
// `openai` is deliberately NOT a case label: it reaches OpenAIAdapter
// through `default:`, which is also where an unknown type lands. That
// fallback is pinned as behaviour, not blessed -- a typo'd `type` still
// silently becomes a wrong-vendor request, and changing it to throw is a
// behaviour change that belongs in its own commit.

import { LLMAdapter } from './adapter';
import { OpenAIAdapter } from './openai-adapter';
import { AnthropicAdapter } from './anthropic-adapter';
import { GLMAdapter } from './glm-adapter';
import { DeepSeekAdapter } from './deepseek-adapter';
import { QwenAdapter } from './qwen-adapter';
import { OllamaAdapter } from './ollama-adapter';

/**
 * 创建适配器
 */
export function createAdapter(type: string): LLMAdapter {
  // toLowerCase + 'zhipu' 别名, 避免老 v0.2.0 时期配置 (type: "ZHIPU" / "zhipu")
  // 走 default → OpenAI, 把 GLM/Qwen key 发到错误的供应商。
  switch (type.toLowerCase()) {
    case 'anthropic':
      return new AnthropicAdapter();
    case 'glm':
    case 'zhipu':
      return new GLMAdapter();
    case 'deepseek':
      return new DeepSeekAdapter();
    case 'qwen':
    case 'tongyi':
    case 'dashscope':
      return new QwenAdapter();
    case 'ollama':
    case 'local':
      return new OllamaAdapter();
    case 'openai':
    default:
      return new OpenAIAdapter();
  }
}
