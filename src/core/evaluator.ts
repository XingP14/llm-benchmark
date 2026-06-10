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
import { getAllMultiTurnBenchmarks } from '../benchmarks/multi-turn';

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
   *
   * ⚠️ **Harness drift caveat**: 本分数基于 11 题 5 维度自研 harness
   *   (dialogue=3 / coding=2 / function_calling=2 / long_context=2 / multi_turn=2),
   *   同一模型在 lm-evaluation-harness / LiveBench / BenchLM.ai / Vals AI
   *   不同 harness 下可能差 ±10-20 分 (例: Opus 4.8 在 Vals AI SWE-bench
   *   Verified 88.60% vs BenchLM.ai SWE-bench Pro 69.2% = 19.4 分差)。
   *   跨平台对比请用 confidence interval 三角验证, 不要把单 harness 排名当绝对真理。
   *   详见 README 「路线图 / Roadmap (v0.5.0 candidates)」表
   *   "SWE-bench 三源 cross-validation (2026-06)" 段。
   *
   * 📊 **Confidence interval**: 当前 v0.4.0 输出为 mean, 未输出 std / 95% CI;
   *   function_calling / multi_turn / long_context 维度仅 2 题, std 较大,
   *   决策前建议至少跑 3 轮取均值 (3-run mean ± std)。
   *   v0.5.0 真完整 PR (估 30-45min, 跨 6-9 轮 cron 累进)
   *   可加 "bootstrap 95% CI" 真输出到 JSON / CSV 报告。
   *
   * 🔗 **Cross-validation**: 与以下 2026 主流 harness 三角交叉
   *   - LiveBench (https://livebench.ai, frequently-updated 抗污染)
   *   - BenchLM.ai (https://benchlm.ai, 248 models × 225 benchmarks, agentic 主战场)
   *   - Vals AI (https://vals.ai/benchmarks/swebench, 06 月最新 SWE-bench Verified)
   *   - lm-evaluation-harness v0.4.0 (2026-04, config-based + Jinja2 prompt + MPS)
   *   - swebench.com 官方 leaderboard (2026-02-19 更新)
   *   跨 harness 决策前务必查 3 源, 避免 harness-multiplier effect 误判。
   *
   * 参考:
   *   - DigitalApplied "LLM Benchmark Methodology 2026: Reading Leaderboards"
   *     https://www.digitalapplied.com/blog/llm-benchmark-methodology-2026-contamination-leaderboard-guide
   */
  async run(): Promise<EvaluationResult[]> {
    console.log(`\n开始并行评测 ${this.config.models.length} 个模型...`);

    // v0.5.0+ 外部基准 dispatch 路由入口 (沿 06-09 23:03 ROADMAP 段从示例到实现)
    // PR 进度: type ✅ 5 项 / dispatch stub ✅ 5 项 (webdev_arena/terminal_bench/aa_omniscience/benchlm_agentic/cyberseceval3) / 真完整 PR 估 30-45min
    // 完整 PR 在后续 cron 轮次累进: 各平台 fetch + adapter + 评分聚合
    if (this.config._external_benchmarks_roadmap) {
      const ext = this.config._external_benchmarks_roadmap;
      const enabled: string[] = [];
      if (ext.webdev_arena?.enabled) {
        enabled.push(`webdev_arena(api_base=${ext.webdev_arena.api_base ?? '(unset)'}, model_id=${ext.webdev_arena.model_id ?? '(unset)'})`);
      }
      if (ext.terminal_bench?.enabled) {
        enabled.push(`terminal_bench(api_base=${ext.terminal_bench.api_base ?? '(unset)'}, model_id=${ext.terminal_bench.model_id ?? '(unset)'})`);
      }
      if (ext.aa_omniscience?.enabled) {
        enabled.push(`aa_omniscience(api_base=${ext.aa_omniscience.api_base ?? '(unset)'}, model_id=${ext.aa_omniscience.model_id ?? '(unset)'})`);
      }
      // v0.5.0 dispatch stub: BenchLM.ai agentic eval (2026-06-07 发布, 248 模型 × 225 基准, agentic 主战场)
      if (ext.benchlm_agentic?.enabled) {
        const native = ext.benchlm_agentic.native_evals ? ' + Native Evals' : '';
        enabled.push(`benchlm_agentic(api_base=${ext.benchlm_agentic.api_base ?? '(unset)'}, model_id=${ext.benchlm_agentic.model_id ?? '(unset)'}${native})`);
      }
      // v0.5.0 dispatch stub: Meta CyberSecEval 3 (2025-12 发布, 8 项风险跨 offensive security 3 大类, Claude Mythos 5 主战场)
      if (ext.cyberseceval3?.enabled) {
        const cats = ext.cyberseceval3.risk_categories?.join('|') ?? 'all-8';
        enabled.push(`cyberseceval3(api_base=${ext.cyberseceval3.api_base ?? '(unset)'}, model_id=${ext.cyberseceval3.model_id ?? '(unset)'}, risk_categories=${cats})`);
      }
      // v0.5.0 model_id routing hint (2026-06-11): Mythos-class 模型 `claude-fable-5` (Anthropic GA, 2026-06-09)
      // 已知默认走 cyberseceval3 (suite=both) → LiveCodeBench/Terminal-Bench 路径; 也可显式配 `model_id: 'claude-fable-5'`
      // 见 README 「路线图 / Roadmap (v0.5.0 candidates)」表 Mythos-class 模型接入 段
      if (enabled.length > 0) {
        console.info(`[v0.5.0 dispatch skeleton] external benchmarks enabled: ${enabled.join('; ')} (skeleton only — actual invocation pending后续 cron 轮次累进)`);
      }
    }

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
    if (this.config.benchmarks.multi_turn) {
      questions.push(...getAllMultiTurnBenchmarks());
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

    // 多轮对话：把 turns 整体作为 messages 发送，最后一轮 user 作为"问题轮"
    if (question.type === 'multi_turn') {
      const mtQuestion = question as any;
      const turns: Array<{ role: string; content: string }> = mtQuestion.turns || [];
      const modelOutput = await this.adapter.chat(turns, model);
      return scorer.scoreMultiTurn(question, modelOutput);
    }

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
    const mtScores = scores.filter((s) => s.dimension === 'multi_turn');

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
      multi_turn: {
        total: mtScores.reduce((sum, s) => sum + s.score, 0),
        count: mtScores.length,
        average:
          mtScores.length > 0
            ? Math.round(
                mtScores.reduce((sum, s) => sum + s.score, 0) /
                  mtScores.length
              )
            : 0,
        details: this.calculateCategoryDetails(mtScores),
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
