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
  };
  /** 输出目录 */
  output?: string;
  /** 并发数 (默认 3) */
  concurrency?: number;
  /** 评测次数 (默认 1) */
  runs?: number;
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
  type: 'dialogue' | 'coding';
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
  dimension: 'dialogue' | 'coding';
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
