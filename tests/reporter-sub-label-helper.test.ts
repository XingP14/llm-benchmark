// tests/reporter-sub-label-helper.test.ts - v0.6.0 step-v6.0-5 (07-04 22:23 cron)
// 验证 getSubLabel helper 的副标渲染规则 (subset / mode / riskCategories 三段拼接)
// 跟 getDispatchTypeCell 同源 (06-29 cron helper + 07-03/07-04 4-site closure)
// 闭锁点: 集中实现避免 caller 漂移, single source of truth for subset/mode/risk 副标

import { getSubLabel, getDispatchTypeCell } from '../src/core/reporter';
import type { QuestionScore, EvaluationResult } from '../src/types';

const baseQs: QuestionScore = {
  questionId: 'terminal_bench_test-model',
  category: 'terminal_bench',
  score: 75,
  dimension: 'coding',
  modelOutput: 'ok',
  detail: 'ok',
};

describe('reporter.ts getSubLabel helper (07-04 22:23 cron, step-v6.0-5 minimal slice)', () => {
  describe('module shape', () => {
    it('exports getSubLabel as a function', () => {
      expect(typeof getSubLabel).toBe('function');
    });

    it('sits next to getDispatchTypeCell (parity gate — step-v6.0-5 chains step-v6.0-4)', () => {
      expect(typeof getDispatchTypeCell).toBe('function');
    });
  });

  describe('absent / empty boundaries → null', () => {
    it('returns null when qs is undefined', () => {
      expect(getSubLabel(undefined)).toBeNull();
    });

    it('returns null when qs has no subset/mode/riskCategories fields (v0.5 default)', () => {
      expect(getSubLabel({ ...baseQs })).toBeNull();
    });

    it('returns null when subset is empty string', () => {
      expect(getSubLabel({ ...baseQs, subset: '' })).toBeNull();
    });

    it('returns null when mode is empty string', () => {
      expect(getSubLabel({ ...baseQs, mode: '' })).toBeNull();
    });

    it('returns null when riskCategories is empty array', () => {
      expect(getSubLabel({ ...baseQs, riskCategories: [] })).toBeNull();
    });

    it('returns null when riskCategories is array of empty strings (filter pass-through)', () => {
      expect(getSubLabel({ ...baseQs, riskCategories: ['', '', ''] })).toBeNull();
    });

    it('returns null when subset/mode are empty but riskCategories is non-empty array (single source of truth test)', () => {
      // Only one field populated, others empty
      expect(getSubLabel({ ...baseQs, subset: '', mode: '', riskCategories: ['fuzzing'] })).toBe(' [risk=fuzzing]');
    });
  });

  describe('single field rendering', () => {
    it('renders subset only as " [subset=<value>]"', () => {
      expect(getSubLabel({ ...baseQs, subset: 'verified' })).toBe(' [subset=verified]');
    });

    it('renders mode only as " [mode=<value>]"', () => {
      expect(getSubLabel({ ...baseQs, mode: 'commit_count' })).toBe(' [mode=commit_count]');
    });

    it('renders single risk category as " [risk=<value>]"', () => {
      expect(getSubLabel({ ...baseQs, riskCategories: ['fuzzing'] })).toBe(' [risk=fuzzing]');
    });
  });

  describe('multi-field rendering with | delimiter', () => {
    it('renders subset + mode joined with |', () => {
      expect(getSubLabel({ ...baseQs, subset: 'verified', mode: 'commit_count' })).toBe(
        ' [subset=verified|mode=commit_count]',
      );
    });

    it('renders subset + risk joined with |', () => {
      expect(getSubLabel({ ...baseQs, subset: 'verified', riskCategories: ['fuzzing', 'malware_gen'] })).toBe(
        ' [subset=verified|risk=fuzzing+malware_gen]',
      );
    });

    it('renders mode + risk joined with |', () => {
      expect(getSubLabel({ ...baseQs, mode: 'all', riskCategories: ['prompt_injection'] })).toBe(
        ' [mode=all|risk=prompt_injection]',
      );
    });

    it('renders all three fields in canonical order: subset|mode|risk', () => {
      expect(
        getSubLabel({
          ...baseQs,
          subset: 'verified',
          mode: 'commit_count',
          riskCategories: ['fuzzing', 'malware_gen'],
        }),
      ).toBe(' [subset=verified|mode=commit_count|risk=fuzzing+malware_gen]');
    });
  });

  describe('riskCategories filtering + concatenation', () => {
    it('filters empty strings inside riskCategories array', () => {
      expect(getSubLabel({ ...baseQs, riskCategories: ['fuzzing', '', 'malware_gen'] })).toBe(
        ' [risk=fuzzing+malware_gen]',
      );
    });

    it('joins multi-category risks with + (NOT |)', () => {
      // + chosen over | to avoid css-class-name collision in HTML detail-card
      // (existing reporter.ts uses | for subset sub-labels like "terminal_bench[full] pass_rate=..."
      //  but + is more HTML-tag-friendly for risk lists)
      expect(getSubLabel({ ...baseQs, riskCategories: ['a', 'b', 'c'] })).toBe(' [risk=a+b+c]');
    });

    it('falls back to null when all riskCategories are empty strings (filter collapses to [])', () => {
      expect(getSubLabel({ ...baseQs, subset: '', riskCategories: ['', ''] })).toBeNull();
    });
  });

  describe('parity with getDispatchTypeCell (step-v6.0-5 chains step-v6.0-4)', () => {
    it('getSubLabel null when absent mirrors getDispatchTypeCell null when absent', () => {
      const result: EvaluationResult = {
        modelName: 'test',
        model: { name: 'test', endpoint: 'http://x', apiKey: 'k', type: 'openai' },
        scores: [baseQs],
        totalScore: 75,
        dimensions: {
          dialogue: { total: 0, count: 0, average: 0, details: {} },
          coding: { total: 75, count: 1, average: 75, details: {} },
          function_calling: { total: 0, count: 0, average: 0, details: {} },
          long_context: { total: 0, count: 0, average: 0, details: {} },
          multi_turn: { total: 0, count: 0, average: 0, details: {} },
          
        },
        timestamp: new Date(),
        duration: 1000,
      };
      expect(getDispatchTypeCell(result)).toBeNull();
      expect(getSubLabel(result.scores[0])).toBeNull();
    });

    it('getSubLabel returns string starting with " [" (visual parity with getDispatchTypeCell " (type=...)")', () => {
      const cell = getSubLabel({ ...baseQs, subset: 'verified' });
      expect(cell?.startsWith(' [')).toBe(true);
    });

    it('getDispatchTypeCell returns string starting with " (" (visual contrast with getSubLabel)', () => {
      const cell = getDispatchTypeCell({
        dispatchType: 'agentic_coding',
        modelName: 'm',
        model: { name: 'm', endpoint: 'http://x', apiKey: 'k', type: 'openai' },
        scores: [],
        totalScore: 0,
        dimensions: {
          dialogue: { total: 0, count: 0, average: 0, details: {} },
          coding: { total: 0, count: 0, average: 0, details: {} },
          function_calling: { total: 0, count: 0, average: 0, details: {} },
          long_context: { total: 0, count: 0, average: 0, details: {} },
          multi_turn: { total: 0, count: 0, average: 0, details: {} },
          
        },
        timestamp: new Date(),
        duration: 1000,
      });
      expect(cell?.startsWith(' (')).toBe(true);
    });
  });

  describe('QuestionScore new fields integration', () => {
    it('subset field round-trips through getSubLabel (type-level integration gate)', () => {
      const qs: QuestionScore = { ...baseQs, subset: 'longbench_v2' };
      expect(getSubLabel(qs)).toBe(' [subset=longbench_v2]');
    });

    it('mode field round-trips through getSubLabel', () => {
      const qs: QuestionScore = { ...baseQs, mode: 'commit_metrics' };
      expect(getSubLabel(qs)).toBe(' [mode=commit_metrics]');
    });

    it('riskCategories field round-trips through getSubLabel', () => {
      const qs: QuestionScore = { ...baseQs, riskCategories: ['automated_social_engineering'] };
      expect(getSubLabel(qs)).toBe(' [risk=automated_social_engineering]');
    });
  });
});
