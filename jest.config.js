/** @type {import('ts-jest').JestConfigWithTsJest} */
// v0.5.0+ coverage scope (tightened 2026-06-28 01:23 cron)
// 与 CI 一致: .github/workflows/ci.yml 用 `npm test` = `jest --runInBand --coverage`,
// 故 coverage 阈值会在 CI 跑 (06-20 cron 注释说 CI 不带 --coverage 是错的, 实际 .github/workflows/ci.yml 第 51 行是 `run: npm test`).
// 06-20 cron 阈值下调 95/95/95/95→85/80/85/65 但实测 src/core/evaluator.ts (1366 行 CLI 引擎) 拉低到
//   statements 52.26 / branches 25.85 / lines 53.28 / functions 60.65 (5.74% on core/evaluator.ts only),
//   因为 src/core/evaluator.ts 是 CLI 引擎, 通过 web harness (src/web/engine/evaluator.ts 325 行, 测过)
//   间接触发, 没必要把所有 CLI 路径都加单测 (相当于 6 维度 × 8 dispatch × 真实 fetch = 48 个 mock 测试, ROI 低).
// 本轮收紧 collectCoverageFrom 到 6 个有测试覆盖的目录 (src/adapters/* src/core/reporter.ts src/core/scorer.ts
//   src/errors.ts src/sandbox/python-sandbox.ts src/types/* src/web/**/*), 排除 src/core/evaluator.ts (CLI 引擎)
//   + src/index.ts (re-export) + src/sandbox/executor.ts (sandbox cli).
//   (2026-10-02 01:03 cron) src/benchmarks/** + src/cli/** 拉回 scope: 这两个目录此前无 isolated test 而被整体排除,
//   但 benchmarks 的 3 个 getXByCategory helper 是 core/evaluator.ts 按 category dispatch 的真实产品路径, 已被
//   tests/benchmarks-by-category.test.ts 覆盖; cli/cli_log.ts 早已 100%。实测阈值 statements 99.36 / branches 98.86
//   / lines 99.7 / functions 96.92, 阈值保持 statements 90 / branches 70 / lines 90 / functions 85 不变。
//   (2026-10-02 05:03 cron) src/core/evaluator.ts 也拉回 scope —— 上面 06-20 那段 "1366 行 CLI 引擎 / 52.26 stmts" 的
//   理由已被证伪: 文件现在是 2050 行, 且自 00:29-03:29 一系列的 real-code 测试 (evaluator-dimensions /
//   evaluator-dispatch-defaults / benchmarks-by-category, 1096 tests) 已把它压到 91.68 stmts / 78.43 branches /
//   86.86 lines / 92.78 functions —— 四道 90/70/90/85 闸门全部有富余。exclude 的是"没人测的引擎",
//   现在不是了, exclude 本身就成了覆盖率报告里的盲区。
//   阈值保持 90/70/90/85 不变: 这次是让真实阈值第一次真正约束到 evaluator.ts, 不是为了让数字好看而下调。
// 后续 v0.6.0: 补 src/web/engine/evaluator.ts 8 dispatch 真实 fetch 单测 + CLI 入口 mock (JSON 快照),
//   把 branches 78.43 往 90 推。
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: [
    // tested modules (每个目录/文件都有对应 *.test.ts)
    'src/adapters/**/*.ts',
    'src/benchmarks/**/*.ts',
    'src/cli/**/*.ts',
    'src/core/reporter.ts',
    'src/core/scorer.ts',
    'src/core/evaluator.ts',
    'src/errors.ts',
    'src/sandbox/python-sandbox.ts',
    'src/types/**/*.ts',
    'src/web/**/*.ts',
    // explicit excludes (CLI 引擎 / re-export / sandbox cli / 无 isolated test)
    '!src/**/*.d.ts',
    '!src/index.ts',                          // re-export barrel
    '!src/sandbox/executor.ts',               // 沙箱 CLI 入口, 测过 python-sandbox 即可
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 85,
      lines: 90,
      statements: 90,
    },
  },
  testTimeout: 10000,
  transformIgnorePatterns: [
    '/node_modules/(?!uuid)',
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
};
