// src/web/engine/evaluator.ts - 评测引擎

import { getDatabase } from '../db/database';
import type Database from 'better-sqlite3';
import { taskManager } from './task';
import type { WSSender, WSMessage } from '../websocket';
import { OpenAIAdapter } from '../../adapters/openai-adapter';
import { AnthropicAdapter } from '../../adapters/anthropic-adapter';
import { GLMAdapter } from '../../adapters/glm-adapter';
import { DeepSeekAdapter } from '../../adapters/deepseek-adapter';
import { QwenAdapter } from '../../adapters/qwen-adapter';
import { OllamaAdapter } from '../../adapters/ollama-adapter';
import { LLMAdapter } from '../../adapters/adapter';
import { ModelConfig } from '../../types';
import { errorMessage } from '../../errors';
import { getAllDialogueBenchmarks } from '../../benchmarks/dialogue';
import { getAllCodeBenchmarks } from '../../benchmarks/coding';
import { getAllFunctionCallingBenchmarks } from '../../benchmarks/function-calling';
import { getAllLongContextBenchmarks } from '../../benchmarks/long-context';
import { getAllMultiTurnBenchmarks } from '../../benchmarks/multi-turn';
import { BenchmarkQuestion } from '../../types';
import { MultiTurnQuestion } from '../../benchmarks/multi-turn';
import { PythonSandbox } from '../../sandbox/python-sandbox';

function logEvaluationError(message: string, err: unknown): void {
  if (process.env.NODE_ENV !== 'test' && process.env.JEST_WORKER_ID === undefined) {
    console.error(message, err);
  }
}

/**
 * configs 表的 SQLite 行 shape (与 src/web/db/database.ts 第 100 行 CREATE TABLE 一致).
 * type 字段用 ModelConfig['type'] 字面量联合, 与 buildModelConfig 输出口径一致.
 */
interface ConfigRow {
  id: number;
  user_id: number;
  name: string;
  type: ModelConfig['type'];
  endpoint: string;
  api_key: string;
  model: string | null;
  is_active: number;
  created_at: string;
}

export class EvaluatorEngine {
  private sandbox = new PythonSandbox();

  /**
   * 运行评测
   *
   * v0.5.0+ 外部基准 dispatch 钩子点 (沿 06-09 23:03 ROADMAP 段从示例到实现):
   *   - CLI 路径 (src/core/evaluator.ts `run()`): type 段 ✅ 6 项 / dispatch skeleton ✅
   *     (webdev_arena / terminal_bench / aa_omniscience / benchlm_agentic / cyberseceval3 / swe_bench_pro)
   *   - Web 路径 (本类 `run()`): task model 当前仅含 5 维度布尔开关
   *     (includeDialogue/Coding/FunctionCalling/LongContext/MultiTurn), **未**传递
   *     `_external_benchmarks_roadmap` 段; 后续 cron 轮次需扩展:
   *       (a) `src/web/engine/task.ts` `EvaluationTask` 加 `externalBenchmarks?:
   *           ExternalBenchmarkRoadmap` 字段 + `startTask()` 增 1 参数
   *       (b) `src/web/routes/evaluations.ts` POST `/` 接受 `req.body._external_benchmarks_roadmap`
   *           透传到 `taskManager.startTask(...)`
   *       (c) 本类 `run()` 顶部加与 CLI 端对称的 dispatch 入口
   *           (console.info 列 enabled 列表, 0 真实 API 调用)
   *     真完整 PR 估 30-45min (跨 6-9 轮 cron 累进), v0.5.0 不发版。
   *   - 详见 README 「v0.5.0 PR 进度」段 + ROADMAP 「v0.5.0 dispatch PR 真启用」段
   */
  async run(evaluationId: string, sendWS: WSSender): Promise<void> {
    const db = getDatabase();
    const task = taskManager.getCurrentTask();
    if (!task) return;

    try {
      taskManager.setRunning();
      sendWS({ type: 'start', evaluation_id: evaluationId });

      // 更新数据库状态
      db.prepare('UPDATE evaluations SET status=?, started_at=datetime(?) WHERE id=?')
        .run('RUNNING', new Date().toISOString(), evaluationId);

      // 获取所有题目
      const questions: BenchmarkQuestion[] = [];
      if (task.includeDialogue) questions.push(...getAllDialogueBenchmarks());
      if (task.includeCoding) questions.push(...getAllCodeBenchmarks());
      if (task.includeFunctionCalling) questions.push(...getAllFunctionCallingBenchmarks());
      if (task.includeLongContext) questions.push(...getAllLongContextBenchmarks());
      if (task.includeMultiTurn) questions.push(...getAllMultiTurnBenchmarks());

      const total = questions.length * task.configs.length;
      let current = 0;

      // 遍历每个配置
      for (const configId of task.configs) {
        if (taskManager.isCancelled()) {
          await this.cancelEvaluation(db, evaluationId, sendWS);
          return;
        }

        const config = db.prepare('SELECT * FROM configs WHERE id=?').get(configId) as ConfigRow;
        if (!config) continue;

        const adapter = this.createAdapter(config.type);

        // 遍历每道题
        for (const question of questions) {
          if (taskManager.isCancelled()) {
            await this.cancelEvaluation(db, evaluationId, sendWS);
            return;
          }

          current++;
          const progress = Math.round((current / total) * 100);

          try {
            // 调用 LLM
            let output: string;
            if (question.type === 'multi_turn') {
              const mtQuestion = question as MultiTurnQuestion;
              const turns: Array<{ role: string; content: string }> = mtQuestion.turns || [];
              output = await adapter.chat(turns, this.buildModelConfig(config));
            } else {
              output = await adapter.chat(
                [{ role: 'user', content: question.content }],
                this.buildModelConfig(config)
              );
            }

            // 评分
            const score = await this.scoreQuestion(question, output);

            // 存储结果
            db.prepare(`
              INSERT INTO results (evaluation_id, config_id, question_id, question_type, category, model_output, score, reference_answer)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(evaluationId, configId, question.id, question.type, question.category, output, score.score, question.referenceAnswer || '');

          } catch (err: unknown) {
            logEvaluationError(`Error evaluating ${question.id}:`, err);
            // 存储错误结果
            db.prepare(`
              INSERT INTO results (evaluation_id, config_id, question_id, question_type, category, model_output, score, reference_answer)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(evaluationId, configId, question.id, question.type, question.category, `Error: ${errorMessage(err)}`, 0, question.referenceAnswer || '');
          }

          // 推送进度
          sendWS({
            type: 'progress',
            evaluation_id: evaluationId,
            progress,
            current,
            total,
            config_name: config.name,
            question_id: question.id
          });
        }
      }

      // 更新完成状态
      db.prepare('UPDATE evaluations SET status=?, completed_at=datetime(?) WHERE id=?')
        .run('COMPLETED', new Date().toISOString(), evaluationId);

      taskManager.setCompleted();
      sendWS({ type: 'completed', evaluation_id: evaluationId });

    } catch (err: unknown) {
      logEvaluationError('Evaluation error:', err);
      db.prepare('UPDATE evaluations SET status=?, completed_at=datetime(?) WHERE id=?')
        .run('FAILED', new Date().toISOString(), evaluationId);

      taskManager.setFailed();
      sendWS({ type: 'error', evaluation_id: evaluationId, message: errorMessage(err) });
    }
  }

  /**
   * 取消评测
   */
  private async cancelEvaluation(db: Database.Database, evaluationId: string, sendWS: WSSender): Promise<void> {
    db.prepare('UPDATE evaluations SET status=?, completed_at=datetime(?) WHERE id=?')
      .run('CANCELLED', new Date().toISOString(), evaluationId);
    taskManager.setCompleted();
    sendWS({ type: 'cancelled', evaluation_id: evaluationId });
  }

  /**
   * 创建适配器
   */
  private createAdapter(type: string): LLMAdapter {
    // 与 src/index.ts CLI 路径对齐：toLowerCase + 接受 'zhipu' 别名,
    // 避免老 v0.2.0 时期配置 (type: "ZHIPU" / "zhipu") 走 default → OpenAI
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
      default:
        return new OpenAIAdapter();
    }
  }

  /**
   * 构建模型配置
   */
  private buildModelConfig(dbConfig: ConfigRow): ModelConfig {
    return {
      name: dbConfig.name,
      type: dbConfig.type,
      endpoint: dbConfig.endpoint,
      apiKey: dbConfig.api_key,
      model: dbConfig.model ?? undefined,
    };
  }

  /**
   * 评分
   */
  private async scoreQuestion(question: BenchmarkQuestion, output: string): Promise<{ score: number }> {
    if (question.type === 'dialogue') {
      return this.scoreDialogue(question, output);
    } else if (question.type === 'function_calling') {
      return this.scoreFunctionCalling(question, output);
    } else if (question.type === 'long_context') {
      return this.scoreLongContext(question, output);
    } else if (question.type === 'multi_turn') {
      return this.scoreMultiTurn(question, output);
    } else {
      return this.scoreCoding(question, output);
    }
  }

  private async scoreFunctionCalling(question: BenchmarkQuestion, output: string): Promise<{ score: number }> {
    const { Scorer } = require('../../core/scorer');
    // Web 端 scorer 复用 core 的 Scorer（adapter 用于在 web 端走 LLM 评分的场景；这里仅做工具调用结构匹配）
    const dummyModel = { name: 'web', type: 'openai' as const, endpoint: '', apiKey: '' };
    const scorer = new Scorer(this.createAdapter('openai'), dummyModel);
    const result = await scorer.scoreFunctionCalling(question, output);
    return { score: result.score };
  }

  /**
   * 长上下文评分（Web 端）
   * 复用 core Scorer 的 keyFacts 命中算法
   */
  private async scoreLongContext(question: BenchmarkQuestion, output: string): Promise<{ score: number }> {
    const { Scorer } = require('../../core/scorer');
    const dummyModel = { name: 'web', type: 'openai' as const, endpoint: '', apiKey: '' };
    const scorer = new Scorer(this.createAdapter('openai'), dummyModel);
    const result = await scorer.scoreLongContext(question, output);
    return { score: result.score };
  }

  /**
   * 多轮对话一致性评分（Web 端）
   * 复用 core Scorer 的 required/forbidden 评分算法
   */
  private async scoreMultiTurn(question: BenchmarkQuestion, output: string): Promise<{ score: number }> {
    const { Scorer } = require('../../core/scorer');
    const dummyModel = { name: 'web', type: 'openai' as const, endpoint: '', apiKey: '' };
    const scorer = new Scorer(this.createAdapter('openai'), dummyModel);
    const result = await scorer.scoreMultiTurn(question, output);
    return { score: result.score };
  }

  /**
   * 对话评分
   */
  private async scoreDialogue(question: BenchmarkQuestion, output: string): Promise<{ score: number }> {
    const ref = question.referenceAnswer || '';
    let score = 50;

    // 检查是否包含参考答案的关键部分
    if (ref) {
      const keyPart = ref.split(/[，。、,.]/)[0];
      if (output.includes(keyPart)) {
        score += 30;
      }
    }

    // 检查回答长度
    if (output.length > 10) {
      score += 20;
    }

    return { score: Math.min(100, score) };
  }

  /**
   * 代码评分
   */
  private async scoreCoding(question: BenchmarkQuestion, output: string): Promise<{ score: number }> {
    // 基本语法检查
    const hasDef = output.includes('def ');
    const hasReturn = output.includes('return') || output.includes('print');

    if (!hasDef) return { score: 20 };
    if (!hasReturn) return { score: 40 };

    // 尝试执行代码
    try {
      const funcMatch = output.match(/def\s+(\w+)\s*\(/);
      if (!funcMatch) return { score: 50 };

      // 简单执行测试
      const testCode = `${output}\n\nprint("OK")`;
      const result = await this.sandbox.execute(testCode, '');

      if (result.success) {
        return { score: 80 };
      }
    } catch {}

    return { score: 60 };
  }
}
