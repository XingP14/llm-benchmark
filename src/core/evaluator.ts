// src/core/evaluator.ts - 评测引擎

import {
  BenchmarkConfig,
  BenchmarkQuestion,
  EvaluationResult,
  DimensionScore,
  QuestionScore,
  ModelConfig,
} from '../types';
import { LLMAdapter } from '../adapters/adapter';
import { Scorer } from './scorer';
import { getAllDialogueBenchmarks } from '../benchmarks/dialogue';
import { getAllCodeBenchmarks } from '../benchmarks/coding';
import { getAllFunctionCallingBenchmarks } from '../benchmarks/function-calling';
import { getAllLongContextBenchmarks } from '../benchmarks/long-context';

/**
 * 评测引擎 - 协调整个评测流程
 */
export class Evaluator {
  private config: BenchmarkConfig;
  private adapter: LLMAdapter;
  private progressCallback?: (progress: number) => void;

  constructor(
    config: BenchmarkConfig,
    adapter: LLMAdapter,
    progressCallback?: (progress: number) => void
  ) {
    this.config = config;
    this.adapter = adapter;
    this.progressCallback = progressCallback;
  }

  /**
   * 运行评测 - 所有模型并行执行
   */
  async run(): Promise<EvaluationResult[]> {
    console.log(`\n开始并行评测 ${this.config.models.length} 个模型...`);
    const results = await Promise.all(
      this.config.models.map((model, i) => {
        console.log(`\n启动评测: ${model.name}`);
        return this.evaluateModel(model, i);
      })
    );
    return results;
  }

  private async evaluateModel(
    model: ModelConfig,
    modelIndex: number
  ): Promise<EvaluationResult> {
    const startTime = Date.now();
    const scores: QuestionScore[] = [];

    const questions: BenchmarkQuestion[] = [];

    if (this.config.benchmarks.dialogue) {
      questions.push(...getAllDialogueBenchmarks());
    }
    if (this.config.benchmarks.coding) {
      questions.push(...getAllCodeBenchmarks());
    }
    if (this.config.benchmarks.function_calling) {
      questions.push(...getAllFunctionCallingBenchmarks());
    }
    if (this.config.benchmarks.long_context) {
      questions.push(...getAllLongContextBenchmarks());
    }

    for (let i = 0; i < questions.length; i++) {
      const question = questions[i];
      const progress =
        ((modelIndex * questions.length + i + 1) /
          (this.config.models.length * questions.length)) *
        100;

      if (this.progressCallback) {
        this.progressCallback(progress);
      }

      const startTime = new Date().toISOString().slice(11,19);
      console.log(
        `  [${model.name}] ${i + 1}/${questions.length}: ${question.id} (${startTime})`
      );

      try {
        const score = await this.evaluateQuestion(question, model);
        scores.push(score);
      } catch (error) {
        console.error(`    评测失败: ${(error as Error).message}`);
        scores.push({
          questionId: question.id,
          category: question.category,
          score: 0,
          dimension: question.type,
          modelOutput: '',
          detail: `评测错误: ${(error as Error).message}`,
        });
      }
    }

    const totalScore = this.calculateTotalScore(scores);
    const dimensions = this.calculateDimensions(scores);
    const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✅ [${model.name}] 评测完成! 总分: ${totalScore}, 耗时: ${durationSec}s`);

    return {
      modelName: model.name,
      model: model,
      scores: scores,
      totalScore: totalScore,
      dimensions: dimensions,
      timestamp: new Date(),
      duration: Date.now() - startTime,
    };
  }

  private async evaluateQuestion(
    question: BenchmarkQuestion,
    model: ModelConfig
  ): Promise<QuestionScore> {
    const scorer = new Scorer(this.adapter, model);

    const messages: Array<{ role: string; content: string }> = [];

    if (question.systemPrompt) {
      messages.push({ role: 'system', content: question.systemPrompt });
    }

    messages.push({ role: 'user', content: question.content });

    const modelOutput = await this.adapter.chat(messages, model);

    if (question.type === 'coding') {
      const codeQuestion = question as any;
      return scorer.scoreCoding(question, modelOutput, codeQuestion.testCases);
    }

    if (question.type === 'function_calling') {
      return scorer.scoreFunctionCalling(question, modelOutput);
    }

    if (question.type === 'long_context') {
      return scorer.scoreLongContext(question, modelOutput);
    }

    return scorer.scoreDialogue(question, modelOutput);
  }

  private calculateTotalScore(scores: QuestionScore[]): number {
    if (scores.length === 0) return 0;

    const totalWeighted = scores.reduce((sum, score) => sum + score.score, 0);

    return Math.round(totalWeighted / scores.length);
  }

  private calculateDimensions(scores: QuestionScore[]): DimensionScore {
    const dialogueScores = scores.filter((s) => s.dimension === 'dialogue');
    const codingScores = scores.filter((s) => s.dimension === 'coding');
    const fcScores = scores.filter((s) => s.dimension === 'function_calling');
    const lcScores = scores.filter((s) => s.dimension === 'long_context');

    return {
      dialogue: {
        total: dialogueScores.reduce((sum, s) => sum + s.score, 0),
        count: dialogueScores.length,
        average:
          dialogueScores.length > 0
            ? Math.round(
                dialogueScores.reduce((sum, s) => sum + s.score, 0) /
                  dialogueScores.length
              )
            : 0,
        details: this.calculateCategoryDetails(dialogueScores),
      },
      coding: {
        total: codingScores.reduce((sum, s) => sum + s.score, 0),
        count: codingScores.length,
        average:
          codingScores.length > 0
            ? Math.round(
                codingScores.reduce((sum, s) => sum + s.score, 0) /
                  codingScores.length
              )
            : 0,
        details: this.calculateCategoryDetails(codingScores),
      },
      function_calling: {
        total: fcScores.reduce((sum, s) => sum + s.score, 0),
        count: fcScores.length,
        average:
          fcScores.length > 0
            ? Math.round(
                fcScores.reduce((sum, s) => sum + s.score, 0) /
                  fcScores.length
              )
            : 0,
        details: this.calculateCategoryDetails(fcScores),
      },
      long_context: {
        total: lcScores.reduce((sum, s) => sum + s.score, 0),
        count: lcScores.length,
        average:
          lcScores.length > 0
            ? Math.round(
                lcScores.reduce((sum, s) => sum + s.score, 0) /
                  lcScores.length
              )
            : 0,
        details: this.calculateCategoryDetails(lcScores),
      },
    };
  }

  private calculateCategoryDetails(
    scores: QuestionScore[]
  ): Record<string, number> {
    const details: Record<string, number> = {};
    const categories = new Set(scores.map((s) => s.category));

    for (const category of categories) {
      const categoryScores = scores.filter((s) => s.category === category);
      details[category] = Math.round(
        categoryScores.reduce((sum, s) => sum + s.score, 0) /
          categoryScores.length
      );
    }

    return details;
  }
}
