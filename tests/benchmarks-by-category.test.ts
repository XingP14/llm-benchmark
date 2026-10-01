// tests/benchmarks-by-category.test.ts
// Tick 2026-10-02 01:03: src/benchmarks/** entered coverage scope via jest.config.js
// collectCoverageFrom. The three newly-scoped files (function-calling, long-context,
// multi-turn) each had exactly one uncovered function: the exported
// getXByCategory(category) helper plus its inline filter callback. These are real
// product paths (core/evaluator.ts dispatches by category), so they are covered
// rather than excluded.

import {
  getAllFunctionCallingBenchmarks,
  getFunctionCallingByCategory,
} from '../src/benchmarks/function-calling';
import {
  getAllLongContextBenchmarks,
  getLongContextByCategory,
} from '../src/benchmarks/long-context';
import {
  getAllMultiTurnBenchmarks,
  getMultiTurnByCategory,
} from '../src/benchmarks/multi-turn';

describe('FunctionCalling getFunctionCallingByCategory', () => {
  it('returns only questions of the requested category', () => {
    const all = getAllFunctionCallingBenchmarks();
    expect(all.length).toBeGreaterThan(0);
    const category = all[0].category;
    const filtered = getFunctionCallingByCategory(category);
    expect(filtered.length).toBeGreaterThan(0);
    filtered.forEach((q) => expect(q.category).toBe(category));
  });

  it('returns an empty array for an unknown category', () => {
    expect(getFunctionCallingByCategory('__no_such_category__')).toEqual([]);
  });
});

describe('LongContext getLongContextByCategory', () => {
  it('returns only questions of the requested category', () => {
    const all = getAllLongContextBenchmarks();
    expect(all.length).toBeGreaterThan(0);
    const category = all[0].category;
    const filtered = getLongContextByCategory(category);
    expect(filtered.length).toBeGreaterThan(0);
    filtered.forEach((q) => expect(q.category).toBe(category));
  });

  it('returns an empty array for an unknown category', () => {
    expect(getLongContextByCategory('__no_such_category__')).toEqual([]);
  });
});

describe('MultiTurn getMultiTurnByCategory', () => {
  it('returns only questions of the requested category', () => {
    const all = getAllMultiTurnBenchmarks();
    expect(all.length).toBeGreaterThan(0);
    const category = all[0].category;
    const filtered = getMultiTurnByCategory(category);
    expect(filtered.length).toBeGreaterThan(0);
    filtered.forEach((q) => expect(q.category).toBe(category));
  });

  it('returns an empty array for an unknown category', () => {
    expect(getMultiTurnByCategory('__no_such_category__')).toEqual([]);
  });
});
