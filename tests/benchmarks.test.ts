// tests/benchmarks.test.ts

import {
  getAllDialogueBenchmarks,
  getDialogueByCategory,
} from '../src/benchmarks/dialogue';
import {
  getAllCodeBenchmarks,
  getCodeByCategory,
  getTestCases,
} from '../src/benchmarks/coding';

describe('Dialogue Benchmarks', () => {
  it('should have benchmarks', () => {
    const benchmarks = getAllDialogueBenchmarks();
    expect(benchmarks.length).toBeGreaterThan(0);
  });

  it('should have required fields', () => {
    const benchmarks = getAllDialogueBenchmarks();
    benchmarks.forEach((b) => {
      expect(b.id).toBeDefined();
      expect(b.category).toBeDefined();
      expect(b.content).toBeDefined();
      expect(b.type).toBe('dialogue');
      expect(b.weight).toBeGreaterThan(0);
    });
  });

  it('should filter by category', () => {
    const factual = getDialogueByCategory('factual_accuracy');
    factual.forEach((b) => {
      expect(b.category).toBe('factual_accuracy');
    });
  });

  it('should have multiple categories', () => {
    const benchmarks = getAllDialogueBenchmarks();
    const categories = new Set(benchmarks.map((b) => b.category));
    expect(categories.size).toBeGreaterThan(3);
  });
});

describe('Code Benchmarks', () => {
  it('should have benchmarks', () => {
    const benchmarks = getAllCodeBenchmarks();
    expect(benchmarks.length).toBeGreaterThan(0);
  });

  it('should have test cases', () => {
    const benchmarks = getAllCodeBenchmarks();
    benchmarks.forEach((b) => {
      expect(b.testCases).toBeDefined();
      expect(b.testCases.length).toBeGreaterThan(0);
    });
  });

  it('should have language specified', () => {
    const benchmarks = getAllCodeBenchmarks();
    benchmarks.forEach((b) => {
      expect(b.language).toBeDefined();
    });
  });

  it('should get test cases by id', () => {
    const testCases = getTestCases();
    expect(testCases.size).toBeGreaterThan(0);
  });

  it('should filter by category', () => {
    const algorithms = getCodeByCategory('algorithms');
    algorithms.forEach((b) => {
      expect(b.category).toBe('algorithms');
    });
  });
});
