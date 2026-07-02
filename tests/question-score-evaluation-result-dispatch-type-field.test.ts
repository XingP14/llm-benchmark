/**
 * v0.6.0 step-v6.0-4 step3 type-layer regression:
 * - QuestionScore 加 dispatchType?: string (optional, 0 functional 破坏)
 * - EvaluationResult 加 dispatchType?: string (同上)
 * - 默认 absent = v0.5 行为不变; 5 fetcher 6d71bef 已发 dispatch_type POST,
 *   本测试钉死类型层字段存在, 让后续 cron 推 fetcher 注入 / reporter.ts 步骤 4 渲染可消费此字段.
 * parallels: evaluator-v050-dispatch-type-wiring.test.ts (5 fetcher dispatchType 4th arg + dispatch_type POST).
 */
import type { QuestionScore, EvaluationResult } from '../src/types';

describe('QuestionScore + EvaluationResult v0.6.0 dispatchType field', () => {
  it('QuestionScore declares optional dispatchType?: string', () => {
    const qs: QuestionScore = {
      questionId: 'qs_test_1',
      category: 'terminal_bench',
      score: 80,
      dimension: 'coding',
      modelOutput: 'output',
      dispatchType: 'agentic_coding',
    };
    expect(qs.dispatchType).toBe('agentic_coding');
  });

  it('QuestionScore without dispatchType stays valid (backward-compat v0.5)', () => {
    const qs: QuestionScore = {
      questionId: 'qs_test_2',
      category: 'webdev_arena',
      score: 75,
      dimension: 'coding',
      modelOutput: 'output',
    };
    expect(qs.dispatchType).toBeUndefined();
  });

  it('EvaluationResult declares optional dispatchType?: string', () => {
    const er: EvaluationResult = {
      modelName: 'test-model',
      model: { name: 'test-model' } as any,
      scores: [],
      totalScore: 0,
      dimensions: {} as any,
      timestamp: new Date(),
      duration: 0,
      dispatchType: 'agentic_coding',
    };
    expect(er.dispatchType).toBe('agentic_coding');
  });

  it('EvaluationResult without dispatchType stays valid (backward-compat v0.5)', () => {
    const er: EvaluationResult = {
      modelName: 'test-model',
      model: { name: 'test-model' } as any,
      scores: [],
      totalScore: 0,
      dimensions: {} as any,
      timestamp: new Date(),
      duration: 0,
    };
    expect(er.dispatchType).toBeUndefined();
  });

  it('5 v0.5 dispatch_type literals are assignable to dispatchType field', () => {
    // 6d71bef 立 5 个 fetcher 各自 dispatchType 默认值
    const literals: Array<QuestionScore['dispatchType']> = [
      'agentic_coding',
      'agentic_fullstack',
      'agentic_swe',
      'process_agentic',
      'long_context_retrieval',
    ];
    expect(literals).toHaveLength(5);
    expect(literals).toEqual(expect.arrayContaining(['agentic_coding', 'agentic_fullstack', 'agentic_swe', 'process_agentic', 'long_context_retrieval']));
  });
});
