// jest.probe.config.js — threshold-disabled measurement probe ONLY. Never CI.
// Created 2026-10-02 03:03 cron: evaluate whether src/core/evaluator.ts can join
// the real coverage scope. Run the real `npm test` to enforce anything.
const base = require('./jest.config.js');

module.exports = {
  ...base,
  collectCoverageFrom: [
    'src/adapters/**/*.ts',
    'src/benchmarks/**/*.ts',
    'src/cli/**/*.ts',
    'src/core/evaluator.ts',
    'src/core/reporter.ts',
    'src/core/scorer.ts',
    'src/errors.ts',
    'src/sandbox/python-sandbox.ts',
    'src/types/**/*.ts',
    'src/web/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
    '!src/sandbox/executor.ts',
  ],
  coverageThreshold: undefined,
  // Write the probe to a SEPARATE directory. Without this, a probe run
  // overwrites coverage/coverage-summary.json with evaluator-in-scope numbers,
  // and tests/verify-coverage-thresholds-script.test.ts (which reads that file
  // off disk) then reports 4 spurious failures on the NEXT `npm test`.
  // That happened on 2026-10-02 03:26 and cost a debugging round.
  // Hit exactly this: ALWAYS run a probe with a distinct coverageDirectory.
  coverageDirectory: '<rootDir>/_tmp/scratch/coverage-probe',
  coverageReporters: ['text-summary', 'json-summary'],
};
