// src/types/index.ts - 类型定义

/**
 * 模型配置
 */
export interface ModelConfig {
  /** 模型名称 (显示名) */
  name: string;
  /** API endpoint URL */
  endpoint: string;
  /** API Key */
  apiKey: string;
  /** 模型类型 (用于适配器选择) */
  type: 'openai' | 'anthropic' | 'glm' | 'deepseek' | 'qwen' | 'ollama' | 'custom';
  /** 可选: 具体模型名 (如 gpt-4, gpt-3.5-turbo) */
  model?: string;
  /** 可选: 额外参数 */
  params?: Record<string, any>;
}

/**
 * 评测配置
 */
export interface BenchmarkConfig {
  /** 模型列表 */
  models: ModelConfig[];
  /** 评测维度开关 */
  benchmarks: {
    dialogue: boolean;
    coding: boolean;
    function_calling: boolean;
    /** v0.4.0+ 新增：长上下文理解（默认 false，需 32k+ context 模型） */
    long_context?: boolean;
    /** v0.4.0+ 新增：多轮对话一致性（默认 false） */
    multi_turn?: boolean;
  };
  /** 输出目录 */
  output?: string;
  /** 并发数 (默认 3) */
  concurrency?: number;
  /** 评测次数 (默认 1) */
  runs?: number;
  /** v0.5.0+ 外部基准路线图 (roadmap-only, 默认 undefined; PR 进度: type ✅ / dispatch ⏳) */
  _external_benchmarks_roadmap?: ExternalBenchmarkRoadmap;
}

/**
 * 评测题目类型
 */
export interface BenchmarkQuestion {
  /** 题目 ID */
  id: string;
  /** 题目类别 */
  category: string;
  /** 题目内容 */
  content: string;
  /** 参考答案 (用于评分) */
  referenceAnswer?: string;
  /** 评分权重 */
  weight: number;
  /** 评测类型 */
  type: 'dialogue' | 'coding' | 'function_calling' | 'long_context' | 'multi_turn';
  /** 额外提示 (给模型的 system prompt) */
  systemPrompt?: string;
}

/**
 * 代码评测专用: 代码测试用例
 */
export interface CodeTestCase {
  /** 输入 */
  input: string;
  /** 期望输出 */
  expectedOutput: string;
  /** 测试描述 */
  description: string;
}

/**
 * 评测结果
 */
export interface EvaluationResult {
  /** 模型名称 */
  modelName: string;
  /** 模型配置 */
  model: ModelConfig;
  /** 各题目得分 */
  scores: QuestionScore[];
  /** 总分 (0-100) */
  totalScore: number;
  /** 各维度得分 */
  dimensions: DimensionScore;
  /** 评测时间 */
  timestamp: Date;
  /** 耗时 (ms) */
  duration: number;
}

/**
 * 单题得分
 */
export interface QuestionScore {
  /** 题目 ID */
  questionId: string;
  /** 题目类别 */
  category: string;
  /** 得分 (0-100) */
  score: number;
  /** 评测维度 */
  dimension: 'dialogue' | 'coding' | 'function_calling' | 'long_context' | 'multi_turn';
  /** 模型输出 */
  modelOutput: string;
  /** 评测详情 (LLM 判定) */
  detail?: string;
}

/**
 * 维度得分
 */
export interface DimensionScore {
  dialogue: {
    total: number;
    count: number;
    average: number;
    details: Record<string, number>;
  };
  coding: {
    total: number;
    count: number;
    average: number;
    details: Record<string, number>;
  };
  function_calling: {
    total: number;
    count: number;
    average: number;
    details: Record<string, number>;
  };
  /** v0.4.0+ 新增：长上下文理解评分汇总（可选，启用 long_context 评测时存在） */
  long_context?: {
    total: number;
    count: number;
    average: number;
    details: Record<string, number>;
  };
  /** v0.4.0+ 新增：多轮对话一致性评分汇总（可选，启用 multi_turn 评测时存在） */
  multi_turn?: {
    total: number;
    count: number;
    average: number;
    details: Record<string, number>;
  };
}

/**
 * v0.5.0+ 外部基准路线图 (roadmap-only, 沿 06-09 23:03 ROADMAP 段从示例到实现)
 * PR 进度: type 段 ✅ / dispatch ⏳ / 真完整 PR 估 30-45min
 */
export interface ExternalBenchmarkRoadmap {
  /** webdev-arena: 全栈代码生成 + 实时对抗评分 */
  webdev_arena?: {
    enabled: boolean;
    api_base?: string;
    model_id?: string;
  };
  /** terminal-bench 2.0: agentic coding */
  terminal_bench?: {
    enabled: boolean;
    api_base?: string;
    model_id?: string;
  };
  /** AA Omniscience: 幻觉 + 知识 */
  aa_omniscience?: {
    enabled: boolean;
    api_base?: string;
    model_id?: string;
  };
  /** BenchLM.ai: agentic eval 24 项 (Design2Code / Vision2Web / Native Evals) — 2026-06-07 发布, 248 模型 × 225 基准 */
  benchlm_agentic?: {
    enabled: boolean;
    api_base?: string;
    model_id?: string;
    /** 是否启用 Native Evals 子集 (默认 false) */
    native_evals?: boolean;
  };
  /** Meta CyberSecEval 3: LLM 安全 / 8 项风险 (offensive security: 自动化社工 / 手动 offensive cyber / 自主 offensive cyber) */
  cyberseceval3?: {
    enabled: boolean;
    api_base?: string;
    model_id?: string;
    /** 评测风险维度 (default: 全部 8 项) */
    risk_categories?: Array<
      | 'automated_social_engineering'
      | 'manual_offensive_cyber'
      | 'autonomous_offensive_cyber'
    >;
  };
}

/**
 * 对比报告
 */
export interface ComparisonReport {
  /** 评测结果列表 */
  results: EvaluationResult[];
  /** 评测时间 */
  generatedAt: Date;
  /** 评测统计 */
  stats: {
    totalModels: number;
    totalQuestions: number;
  };
}
