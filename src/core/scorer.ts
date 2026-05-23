// src/core/scorer.ts - 评分器

import { BenchmarkQuestion, QuestionScore, ModelConfig } from '../types';
import { LLMAdapter } from '../adapters/adapter';
import { PythonSandbox } from '../sandbox/python-sandbox';
import { TestResult } from '../sandbox/executor';

/**
 * 评分器 - 使用 LLM 对答案进行评分
 */
export class Scorer {
  private adapter: LLMAdapter;
  private model: ModelConfig;
  private sandbox: PythonSandbox;

  constructor(adapter: LLMAdapter, model: ModelConfig) {
    this.adapter = adapter;
    this.model = model;
    this.sandbox = new PythonSandbox();
  }

  /**
   * 对对话评测答案进行评分
   */
  async scoreDialogue(
    question: BenchmarkQuestion,
    modelOutput: string
  ): Promise<QuestionScore> {
    const prompt = this.buildDialogueScoringPrompt(question, modelOutput);

    try {
      const scoreText = await this.adapter.chat(
        [{ role: 'user', content: prompt }],
        this.model
      );

      const score = this.parseScore(scoreText);

      return {
        questionId: question.id,
        category: question.category,
        score: score,
        dimension: 'dialogue',
        modelOutput: modelOutput,
        detail: scoreText,
      };
    } catch (error) {
      console.error(`评分失败 [${question.id}]:`, error);
      return {
        questionId: question.id,
        category: question.category,
        score: 0,
        dimension: 'dialogue',
        modelOutput: modelOutput,
        detail: `评分错误: ${(error as Error).message}`,
      };
    }
  }

  /**
   * 对代码评测答案进行评分
   */
  async scoreCoding(
    question: BenchmarkQuestion,
    modelOutput: string,
    testCases?: Array<{ input: string; expectedOutput: string; description: string }>
  ): Promise<QuestionScore> {
    // 检查语法
    const syntaxValid = this.checkSyntax(modelOutput);

    if (!syntaxValid) {
      return {
        questionId: question.id,
        category: question.category,
        score: 20,
        dimension: 'coding',
        modelOutput: modelOutput,
        detail: '代码存在语法错误',
      };
    }

    // 执行测试用例
    if (testCases && testCases.length > 0) {
      const testResults = await this.executeTests(modelOutput, testCases);
      const passed = testResults.filter((r) => r.passed).length;
      const total = testResults.length;
      const testScore = (passed / total) * 80;

      // 代码质量评分
      const qualityScore = this.evaluateCodeQuality(modelOutput);

      return {
        questionId: question.id,
        category: question.category,
        score: Math.round(testScore + qualityScore),
        dimension: 'coding',
        modelOutput: modelOutput,
        detail: `测试通过: ${passed}/${total}, 质量评分: ${qualityScore.toFixed(1)}`,
      };
    }

    // 无测试用例时使用 LLM 评分
    return this.scoreWithLLM(question, modelOutput);
  }

  private buildDialogueScoringPrompt(
    question: BenchmarkQuestion,
    modelOutput: string
  ): string {
    return `你是一个客观的评分员。请根据以下标准对回答进行评分：

【题目】
${question.content}

【参考答案】
${question.referenceAnswer || '无'}

【待评回答】
${modelOutput}

【评分标准】
- 100分：完全准确，格式正确，符合要求
- 80-90分：基本准确，有小瑕疵
- 60-70分：部分正确，有明显问题
- 40-50分：不太准确，理解有误
- 0-30分：完全错误或不相关

请只返回一个0-100之间的数字作为评分，不要返回其他内容。`;
  }

  private async scoreWithLLM(
    question: BenchmarkQuestion,
    modelOutput: string
  ): Promise<QuestionScore> {
    const prompt = `你是一个客观的代码评审员。请根据以下标准对代码进行评分：

【题目】
${question.content}

【待评代码】
${modelOutput}

【评分标准】
- 语法正确性 (40%): 代码能否正常运行
- 逻辑正确性 (30%): 解决方案是否合理
- 代码质量 (20%): 可读性、风格、最佳实践
- 算法效率 (10%): 时间/空间复杂度

请只返回一个0-100之间的数字作为评分，不要返回其他内容。`;

    try {
      const scoreText = await this.adapter.chat(
        [{ role: 'user', content: prompt }],
        this.model
      );

      const score = this.parseScore(scoreText);

      return {
        questionId: question.id,
        category: question.category,
        score: score,
        dimension: 'coding',
        modelOutput: modelOutput,
        detail: scoreText,
      };
    } catch (error) {
      return {
        questionId: question.id,
        category: question.category,
        score: 0,
        dimension: 'coding',
        modelOutput: modelOutput,
        detail: `评分错误: ${(error as Error).message}`,
      };
    }
  }

  private parseScore(text: string): number {
    const match = text.match(/(\d+(?:\.\d+)?)/);
    if (match) {
      const score = parseFloat(match[1]);
      return Math.min(100, Math.max(0, score));
    }
    return 0;
  }

  private checkSyntax(code: string): boolean {
    try {
      const hasDef = code.includes('def ');
      const hasReturn = code.includes('return') || code.includes('print');
      return hasDef && hasReturn;
    } catch {
      return false;
    }
  }

  /**
   * 使用沙盒执行测试用例
   */
  private async executeTests(
    code: string,
    testCases: Array<{ input: string; expectedOutput: string; description: string }>
  ): Promise<TestResult[]> {
    const results: TestResult[] = [];

    for (const tc of testCases) {
      try {
        const result = await this.sandbox.execute(code, tc.input);
        
        // 比较输出（去除首尾空白）
        const actual = result.output.trim();
        const expected = tc.expectedOutput.trim();
        const passed = result.success && actual === expected;

        results.push({
          input: tc.input,
          expectedOutput: tc.expectedOutput,
          description: tc.description,
          actual: actual,
          passed: passed,
        });
      } catch (error) {
        results.push({
          input: tc.input,
          expectedOutput: tc.expectedOutput,
          description: tc.description,
          actual: `执行错误: ${(error as Error).message}`,
          passed: false,
        });
      }
    }

    return results;
  }

  private evaluateCodeQuality(code: string): number {
    let score = 40;

    if (code.includes('#') || code.includes('"""')) {
      score += 10;
    }

    const funcMatch = code.match(/def\s+(\w+)\s*\(/);
    if (funcMatch && !funcMatch[1].startsWith('_')) {
      score += 10;
    }

    if (code.match(/\b[a-z_][a-z0-9_]*\b/i)) {
      score += 10;
    }

    if (code.includes('return')) {
      score += 10;
    }

    return Math.min(40, score);
  }
}
