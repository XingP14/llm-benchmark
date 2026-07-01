// tests/reporter-5dim-ci-helper.test.ts
// v0.6.0 step-v6.0-4 step1 regression: pin getDimCi / getDimCiCell helper
// (parallels 06-20 cron getDimCell extraction + 06-29 03:23 cron getDimValue refactor)
// 数据层 Bootstrap95CI 已在 evaluator.ts b3cb35e (step-v6.0-2) 实现,
// reporter.ts 报表层需 helper 暴露 ci 字段供未来 md/html/csv 渲染。

import { getDimCi, getDimCiCell } from '../src/core/reporter';
import { DimensionScore } from '../src/types';

const baseDim = (avg: number, ci?: { mean: number; std: number; ciLower: number; ciUpper: number; n: number; nResamples: number }): { total: number; count: number; average: number; details: Record<string, number>; ci?: typeof ci } => ({
  total: avg,
  count: 1,
  average: avg,
  details: { test: avg },
  ci,
});

describe('reporter getDimCi helper (v0.6.0 step-v6.0-4 step1)', () => {
  describe('existence + signature gates', () => {
    test('getDimCi is exported function', () => {
      expect(typeof getDimCi).toBe('function');
    });
    test('getDimCiCell is exported function', () => {
      expect(typeof getDimCiCell).toBe('function');
    });
    test('getDimCi returns null when dimensions undefined', () => {
      expect(getDimCi(undefined, 'dialogue')).toBeNull();
    });
    test('getDimCiCell returns "-" when dimensions undefined', () => {
      expect(getDimCiCell(undefined, 'dialogue')).toBe('-');
    });
  });

  describe('ci field routing', () => {
    test('returns full Bootstrap95CI when ci present + n > 0', () => {
      const dims: DimensionScore = {
        dialogue: baseDim(85, { mean: 85, std: 3.5, ciLower: 78, ciUpper: 92, n: 5, nResamples: 1000 }),
        coding: baseDim(75),
      };
      const ci = getDimCi(dims, 'dialogue');
      expect(ci).not.toBeNull();
      expect(ci!.mean).toBe(85);
      expect(ci!.std).toBe(3.5);
      expect(ci!.ciLower).toBe(78);
      expect(ci!.ciUpper).toBe(92);
      expect(ci!.n).toBe(5);
      expect(ci!.nResamples).toBe(1000);
    });
    test('returns null when ci absent (v0.4 legacy data path)', () => {
      const dims: DimensionScore = {
        dialogue: baseDim(85), // no ci field
        coding: baseDim(75),
      };
      expect(getDimCi(dims, 'dialogue')).toBeNull();
    });
    test('returns null when ci present but n=0 (evaluator.ts 0-score safeguard)', () => {
      const dims: DimensionScore = {
        dialogue: baseDim(0, { mean: 0, std: 0, ciLower: 0, ciUpper: 0, n: 0, nResamples: 1000 }),
        coding: baseDim(75),
      };
      expect(getDimCi(dims, 'dialogue')).toBeNull();
    });
    test('returns null when key dim missing entirely', () => {
      const dims: DimensionScore = {
        dialogue: baseDim(85),
        coding: baseDim(75),
        // multi_turn undefined
      };
      expect(getDimCi(dims, 'multi_turn')).toBeNull();
    });
  });

  describe('getDimCiCell display formatting', () => {
    test('formats mean ±std [ciLower, ciUpper] to 1 decimal', () => {
      const dims: DimensionScore = {
        dialogue: baseDim(85, { mean: 85, std: 3.5, ciLower: 78.4, ciUpper: 92.6, n: 5, nResamples: 1000 }),
        coding: baseDim(75),
      };
      expect(getDimCiCell(dims, 'dialogue')).toBe('85.0 ±3.5 [78.4, 92.6]');
    });
    test('returns "-" when ci absent (graceful degradation for v0.4 legacy data)', () => {
      const dims: DimensionScore = {
        dialogue: baseDim(85),
        coding: baseDim(75),
      };
      expect(getDimCiCell(dims, 'dialogue')).toBe('-');
    });
    test('returns "-" when n=0', () => {
      const dims: DimensionScore = {
        dialogue: baseDim(0, { mean: 0, std: 0, ciLower: 0, ciUpper: 0, n: 0, nResamples: 1000 }),
        coding: baseDim(75),
      };
      expect(getDimCiCell(dims, 'dialogue')).toBe('-');
    });
    test('does not mutate dimensions.ci source field', () => {
      const ciField = { mean: 85, std: 3.5, ciLower: 78, ciUpper: 92, n: 5, nResamples: 1000 };
      const dims: DimensionScore = {
        dialogue: baseDim(85, ciField),
        coding: baseDim(75),
      };
      const before = JSON.stringify(dims.dialogue!.ci);
      getDimCiCell(dims, 'dialogue');
      getDimCi(dims, 'dialogue');
      expect(JSON.stringify(dims.dialogue!.ci)).toBe(before);
    });
  });

  describe('cross-dim independence (no shared mutable state)', () => {
    test('returns independent ci objects per dim key', () => {
      const dims: DimensionScore = {
        dialogue: baseDim(85, { mean: 85, std: 3.5, ciLower: 78, ciUpper: 92, n: 5, nResamples: 1000 }),
        coding: baseDim(75, { mean: 75, std: 2.1, ciLower: 71, ciUpper: 79, n: 5, nResamples: 1000 }),
      };
      const dCi = getDimCi(dims, 'dialogue');
      const cCi = getDimCi(dims, 'coding');
      expect(dCi!.mean).toBe(85);
      expect(cCi!.mean).toBe(75);
      expect(dCi).not.toBe(cCi);
    });
    test('function_calling optional dim path works', () => {
      const dims: DimensionScore = {
        dialogue: baseDim(85),
        coding: baseDim(75),
        function_calling: baseDim(65, { mean: 65, std: 5.0, ciLower: 55, ciUpper: 75, n: 3, nResamples: 1000 }),
      };
      expect(getDimCiCell(dims, 'function_calling')).toBe('65.0 ±5.0 [55.0, 75.0]');
    });
  });
});
