// src/web/engine/evaluator.ts - 评测引擎

import { getDatabase } from '../db/database';
import { taskManager } from './task';
import { OpenAIAdapter } from '../../adapters/openai-adapter';
import { AnthropicAdapter } from '../../adapters/anthropic-adapter';
import { GLMAdapter } from '../../adapters/glm-adapter';
import { DeepSeekAdapter } from '../../adapters/deepseek-adapter';
import { QwenAdapter } from '../../adapters/qwen-adapter';
import { OllamaAdapter } from '../../adapters/ollama-adapter';
import { LLMAdapter } from '../../adapters/adapter';
import { ModelConfig } from '../../types';
import { getAllDialogueBenchmarks } from '../../benchmarks/dialogue';
import { getAllCodeBenchmarks } from '../../benchmarks/coding';
import { getAllFunctionCallingBenchmarks } from '../../benchmarks/function-calling';
import { BenchmarkQuestion } from '../../types';
import { PythonSandbox } from '../../sandbox/python-sandbox';

export type WSSender = (data: any) => void;

export class EvaluatorEngine {
  private sandbox = new PythonSandbox();

  /**
   * 运行评测
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

      const total = questions.length * task.configs.length;
      let current = 0;

      // 遍历每个配置
      for (const configId of task.configs) {
        if (taskManager.isCancelled()) {
          await this.cancelEvaluation(db, evaluationId, sendWS);
          return;
        }

        const config = db.prepare('SELECT * FROM configs WHERE id=?').get(configId) as any;
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
            const output = await adapter.chat(
              [{ role: 'user', content: question.content }],
              this.buildModelConfig(config)
            );

            // 评分
            const score = await this.scoreQuestion(question, output);

            // 存储结果
            db.prepare(`
              INSERT INTO results (evaluation_id, config_id, question_id, question_type, category, model_output, score, reference_answer)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(evaluationId, configId, question.id, question.type, question.category, output, score.score, question.referenceAnswer || '');

          } catch (err) {
            console.error(`Error evaluating ${question.id}:`, err);
            // 存储错误结果
            db.prepare(`
              INSERT INTO results (evaluation_id, config_id, question_id, question_type, category, model_output, score, reference_answer)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(evaluationId, configId, question.id, question.type, question.category, `Error: ${(err as Error).message}`, 0, question.referenceAnswer || '');
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

    } catch (err) {
      console.error('Evaluation error:', err);
      db.prepare('UPDATE evaluations SET status=?, completed_at=datetime(?) WHERE id=?')
        .run('FAILED', new Date().toISOString(), evaluationId);

      taskManager.setFailed();
      sendWS({ type: 'error', evaluation_id: evaluationId, message: (err as Error).message });
    }
  }

  /**
   * 取消评测
   */
  private async cancelEvaluation(db: any, evaluationId: string, sendWS: WSSender): Promise<void> {
    db.prepare('UPDATE evaluations SET status=?, completed_at=datetime(?) WHERE id=?')
      .run('CANCELLED', new Date().toISOString(), evaluationId);
    taskManager.setCompleted();
    sendWS({ type: 'cancelled', evaluation_id: evaluationId });
  }

  /**
   * 创建适配器
   */
  private createAdapter(type: string): LLMAdapter {
    switch (type) {
      case 'anthropic':
        return new AnthropicAdapter();
      case 'glm':
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
  private buildModelConfig(dbConfig: any): ModelConfig {
    return {
      name: dbConfig.name,
      type: dbConfig.type,
      endpoint: dbConfig.endpoint,
      apiKey: dbConfig.api_key,
      model: dbConfig.model,
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
