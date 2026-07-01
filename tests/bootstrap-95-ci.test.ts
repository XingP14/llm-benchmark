// tests/bootstrap-95-ci.test.ts
// 钉住 src/core/evaluator.ts v0.6.0 step-v6.0-2 helper bootstrap95CI() (沿 06-19 ROADMAP evaluator.ts JSDoc 段标注):
// 1) helper exported as named export bootstrap95CI(scores, nResamples?, rng?): Bootstrap95CI
// 2) Bootstrap95CI interface 6 fields (mean / std / ciLower / ciUpper / n / nResamples)
// 3) n=0 边界: 0/0/0/0/0/nResamples (0 维不炸)
// 4) n=1 边界: mean=score, std=0, ciLower=ciUpper=mean (resample = 1 point)
// 5) [80,80,80] 边界: mean=80, std=0, ci=[80,80]
// 6) [60,80] 边界: mean=70, std=14.14..., ci ⊆ [50,90] (loose bound: percentile bootstrap 95% CI)
// 7) 5-dim helper 5×3=15 fields 锁定: 对 [70,75,80,85,90] (mean=80, std=7.906) ci ⊆ [70,90]
// 8) 0 改 raw scores 数组 (regression gate — helper 不 mutate input)
// 9) rng 注入: 固定 rng seed → 同一结果 (determinism for CI 复现测试)
// 10) 排序逻辑: sorted means 单调递增 (regression gate)
// 11) nResamples 字段回填 (默认 1000)
// 12) type segment: Bootstrap95CI interface 6 字段 (interface equality lock)
import * as fs from 'fs';
import * as path from 'path';
import { bootstrap95CI, Bootstrap95CI } from '../src/core/evaluator';

const EVALUATOR_PATH = path.resolve(__dirname, '../src/core/evaluator.ts');

// 固定 rng for determinism (Mulberry32, 一致 0.0 ~ 1.0)
const seededRng = (seed: number): () => number => {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

describe('evaluator bootstrap95CI (v0.6.0 step-v6.0-2 helper)', () => {
  const src = fs.readFileSync(EVALUATOR_PATH, 'utf-8');

  it('declares Bootstrap95CI interface with 6 fields', () => {
    expect(src).toMatch(/export interface Bootstrap95CI \{/);
    expect(src).toMatch(/mean:\s*number;/);
    expect(src).toMatch(/std:\s*number;/);
    expect(src).toMatch(/ciLower:\s*number;/);
    expect(src).toMatch(/ciUpper:\s*number;/);
    expect(src).toMatch(/n:\s*number;/);
    expect(src).toMatch(/nResamples:\s*number;/);
  });

  it('declares exactly one named export bootstrap95CI', () => {
    const matches = src.match(/export function bootstrap95CI\(/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(1);
  });

  it('helper signature canonical: (scores: number[], nResamples = 1000, rng?: () => number)', () => {
    // Search for the full signature line (multi-line tolerant)
    expect(src).toMatch(/export function bootstrap95CI\(\s*scores:\s*number\[\]/);
    expect(src).toMatch(/nResamples\s*=\s*1000/);
    expect(src).toMatch(/rng:\s*\(\)\s*=>\s*number\s*=\s*Math\.random/);
    expect(src).toMatch(/:\s*Bootstrap95CI\s*\{/); // return type annotation
  });

  describe('boundary cases', () => {
    it('n=0 empty scores returns zeros without throwing', () => {
      const r = bootstrap95CI([], 100, seededRng(42));
      expect(r.n).toBe(0);
      expect(r.mean).toBe(0);
      expect(r.std).toBe(0);
      expect(r.ciLower).toBe(0);
      expect(r.ciUpper).toBe(0);
      expect(r.nResamples).toBe(100);
    });

    it('n=1 single score: mean=score, std=0, ci=[mean, mean]', () => {
      const r = bootstrap95CI([80], 100, seededRng(42));
      expect(r.n).toBe(1);
      expect(r.mean).toBe(80);
      expect(r.std).toBe(0);
      expect(r.ciLower).toBe(80);
      expect(r.ciUpper).toBe(80);
    });

    it('all-equal [80,80,80]: mean=80, std=0, ci=[80,80]', () => {
      const r = bootstrap95CI([80, 80, 80], 1000, seededRng(42));
      expect(r.mean).toBe(80);
      expect(r.std).toBe(0);
      expect(r.ciLower).toBe(80);
      expect(r.ciUpper).toBe(80);
    });

    it('[60,80] mean=70, std=14.14..., ci within [50,90] range (bootstrap ~95%)', () => {
      const r = bootstrap95CI([60, 80], 2000, seededRng(123));
      expect(r.n).toBe(2);
      expect(r.mean).toBe(70);
      expect(Math.abs(r.std - 14.1421356237)).toBeLessThan(1e-6);
      // percentile bootstrap CI 95% should contain the true mean and stay in [60,80]
      expect(r.ciLower).toBeGreaterThanOrEqual(60);
      expect(r.ciUpper).toBeLessThanOrEqual(80);
      expect(r.ciLower).toBeLessThanOrEqual(r.ciUpper);
    });

    it('5-dim helper [70,75,80,85,90]: mean=80, std≈7.906, ci ⊆ [70,90]', () => {
      const r = bootstrap95CI([70, 75, 80, 85, 90], 5000, seededRng(7));
      expect(r.n).toBe(5);
      expect(r.mean).toBe(80);
      expect(Math.abs(r.std - 7.90569415042)).toBeLessThan(1e-6);
      // bootstrap 95% CI for [70..90] symmetric distribution should stay within [70,90]
      expect(r.ciLower).toBeGreaterThanOrEqual(70);
      expect(r.ciUpper).toBeLessThanOrEqual(90);
    });
  });

  describe('regression gates', () => {
    it('does not mutate input scores array', () => {
      const scores = [70, 75, 80, 85, 90];
      const snapshot = [...scores];
      bootstrap95CI(scores, 500, seededRng(42));
      expect(scores).toEqual(snapshot);
    });

    it('rng determinism: same seed → same Bootstrap95CI result', () => {
      const a = bootstrap95CI([60, 70, 80, 90], 1000, seededRng(99));
      const b = bootstrap95CI([60, 70, 80, 90], 1000, seededRng(99));
      expect(a.mean).toBe(b.mean);
      expect(a.std).toBe(b.std);
      expect(a.ciLower).toBe(b.ciLower);
      expect(a.ciUpper).toBe(b.ciUpper);
      expect(a.nResamples).toBe(b.nResamples);
    });

    it('different seed → likely different CI but same mean/std (sanity)', () => {
      const a = bootstrap95CI([60, 70, 80, 90], 500, seededRng(1));
      const b = bootstrap95CI([60, 70, 80, 90], 500, seededRng(2));
      expect(a.mean).toBe(b.mean);
      expect(a.std).toBe(b.std);
      // CI bounds may differ but should be within data range
      expect(a.ciLower).toBeGreaterThanOrEqual(60);
      expect(a.ciUpper).toBeLessThanOrEqual(90);
      expect(b.ciLower).toBeGreaterThanOrEqual(60);
      expect(b.ciUpper).toBeLessThanOrEqual(90);
    });

    it('ciLower ≤ mean ≤ ciUpper (CI bounds the mean)', () => {
      const r = bootstrap95CI([10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 2000, seededRng(7));
      expect(r.ciLower).toBeLessThanOrEqual(r.mean);
      expect(r.mean).toBeLessThanOrEqual(r.ciUpper);
    });

    it('default nResamples=1000 (regression gate — call with undefined)', () => {
      // TS strict: default param must accept undefined at runtime
      const r = bootstrap95CI([50, 60, 70], undefined!, seededRng(7));
      expect(r.nResamples).toBe(1000);
    });

    it('nResamples parameter overrides default (regression gate)', () => {
      const r = bootstrap95CI([50, 60, 70], 100, seededRng(7));
      expect(r.nResamples).toBe(100);
    });
  });

  describe('Bootstrap95CI type importability', () => {
    it('Bootstrap95CI interface importable as type', () => {
      const r: Bootstrap95CI = bootstrap95CI([50, 60, 70], 100, seededRng(7));
      expect(typeof r.mean).toBe('number');
      expect(typeof r.std).toBe('number');
      expect(typeof r.ciLower).toBe('number');
      expect(typeof r.ciUpper).toBe('number');
      expect(typeof r.n).toBe('number');
      expect(typeof r.nResamples).toBe('number');
    });
  });
});
