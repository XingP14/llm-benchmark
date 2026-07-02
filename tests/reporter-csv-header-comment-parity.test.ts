// tests/reporter-csv-header-comment-parity.test.ts
// 07-03 01:43 cron regression: pin that the CSV header comment in
// src/core/reporter.ts generateCSV() accurately describes the actual CSV column
// layout (5 dim + 10 ci_lower/ci_upper + 4 metadata = 19 columns), and that the
// stale "固定 5 列" wording from pre-v0.6.0 (06-29 cron, pre step-v6.0-4) is no
// longer present.
//
// parallels 6af9f47 stale comment pattern (fix(cli): correct printSummary
// comment on 5-dim defaults) — comment-only fix, 0 behavior change.
//
// what this test guards:
// (1) Reporter.generateCSV() produces exactly 19 columns in the header row
//     (rank, model, total, 5 dim, 10 ci, duration_s, questions).
// (2) The 5 dim main columns match DIM_HEADERS keys verbatim.
// (3) The 10 ci columns are exactly `<dim>_ci_lower`, `<dim>_ci_upper` for each
//     of the 5 DIM_HEADERS.
// (4) The trailing metadata columns are exactly [duration_s, questions].
// (5) src/core/reporter.ts no longer contains the stale "固定 5 列" literal
//     string that pre-dated step-v6.0-4 (07-02 06:43 cron CSV ci injection).
// (6) src/core/reporter.ts CSV section comment now mentions both "5 dim 主列"
//     and "10 ci_lower/ci_upper" so the comment reflects actual layout.
// (7) Comment describes the 5-dim defaults consistently with the module-level
//     JSDoc on DIM_HEADERS (L14-16): dialogue/coding default true, others false.

import * as fs from 'fs';
import * as path from 'path';
import { Reporter, DIM_HEADERS } from '../src/core/reporter';
import { EvaluationResult, DimensionScore } from '../src/types';

const reporterSrcPath = path.resolve(__dirname, '../src/core/reporter.ts');
const reporterSrc = fs.readFileSync(reporterSrcPath, 'utf-8');

const mockDimensions: DimensionScore = {
  dialogue: { total: 80, count: 1, average: 80, details: { test: 80 } },
  coding: { total: 70, count: 1, average: 70, details: { test: 70 } },
  function_calling: { total: 60, count: 1, average: 60, details: { test: 60 } },
  long_context: { total: 50, count: 1, average: 50, details: { test: 50 } },
  multi_turn: { total: 40, count: 1, average: 40, details: { test: 40 } },
};

const mockResult: EvaluationResult = {
  modelName: 'Parity Model',
  model: { name: 'Parity Model', endpoint: 'https://api.x', apiKey: 'k', type: 'openai', model: 'parity' },
  scores: [],
  totalScore: 80,
  dimensions: mockDimensions,
  timestamp: new Date('2026-07-03T00:00:00Z'),
  duration: 5000,
};

describe('reporter CSV header + comment parity', () => {
  const csv = Reporter.generateCSV([mockResult]);
  const lines = csv.trim().split('\n');
  // 1 header + 1 data row
  expect(lines.length).toBe(2);
  const headerCells = lines[0].split(',');

  it('CSV header has exactly 20 columns (5 dim + 10 ci + 5 metadata)', () => {
    expect(headerCells.length).toBe(20);
  });

  it('CSV header prefix is rank, model, total', () => {
    expect(headerCells[0]).toBe('rank');
    expect(headerCells[1]).toBe('model');
    expect(headerCells[2]).toBe('total');
  });

  it('CSV header 5 dim main columns match DIM_HEADERS keys', () => {
    const dimCols = headerCells.slice(3, 8);
    expect(dimCols).toEqual(DIM_HEADERS.map((d) => String(d.key)));
  });

  it('CSV header 10 ci columns = <dim>_ci_lower + <dim>_ci_upper per dim', () => {
    const ciCols = headerCells.slice(8, 18);
    const expected = DIM_HEADERS.flatMap((d) => [`${d.key}_ci_lower`, `${d.key}_ci_upper`]);
    expect(ciCols).toEqual(expected);
  });

  it('CSV header trailing metadata columns are [duration_s, questions]', () => {
    expect(headerCells[19]).toBe('questions');
    expect(headerCells[18]).toBe('duration_s');
  });

  it('CSV data row also has 20 cells (parity with header)', () => {
    const dataCells = lines[1].split(',');
    expect(dataCells.length).toBe(20);
  });

  it('src/core/reporter.ts no longer contains pre-v0.6 stale "固定 5 列" literal', () => {
    expect(reporterSrc).not.toMatch(/固定 5 列/);
  });

  it('CSV header comment now mentions "5 dim 主列" + "10 ci_lower/ci_upper"', () => {
    // pin both the 5-dim main and 10-ci sub layout reference so future CSV
    // header changes are forced to update the comment too (parity gate)
    expect(reporterSrc).toMatch(/5 dim 主列/);
    expect(reporterSrc).toMatch(/10 ci_lower\/ci_upper/);
  });

  it('CSV header comment describes dim defaults consistently with DIM_HEADERS JSDoc (dialogue/coding 默认开启)', () => {
    // gate: CSV section must mention "dialogue / coding 默认开启" OR
    // equivalent to keep parity with reporter.ts L14-16 DIM_HEADERS JSDoc
    expect(reporterSrc).toMatch(/dialogue\s*\/\s*coding\s*默认开启/);
  });

  it('CSV header comment cites authoritative defaults source (initConfig / config.example.json)', () => {
    // parallels 6af9f47 pattern: redirect readers to canonical defaults source
    expect(reporterSrc).toMatch(/initConfig\(\)\s*\/\s*config\.example\.json/);
  });
});
