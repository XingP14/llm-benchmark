// tests/index-print-summary-runtime.test.ts
//
// Companion to tests/index-print-summary-dispatch-type.test.ts, which pins
// printSummary ONLY as source text: the getDispatchTypeCell import, the count
// of `(result)` call sites, the modelLabel template literal, and the
// `cells = [medal, modelLabel, ...]` shape. Every one of those assertions is
// satisfied by text that need never run -- and printSummary is what the user
// actually sees on stdout at the end of every `llm-bench run`.
//
// Proven, not asserted: with src/index.ts at HEAD and the 21 index.ts-scanning
// suites green, 10 mutants applied to the real printSummary body left them all
// at 0r. M1 (sort ascending), M2 (medal ternary collapsed to a plain ordinal),
// M5 (model cell uses the bare name), M6 (bold total-score markers dropped),
// M7 (header drops the 5 dim columns), M8 (row cells drop the 5 dim cells) are
// the blunt ones: a summary that ranks models worst-first, prints "1"/"2"/"3"
// instead of medals, shows the wrong model name, or renders a header with 3
// columns above 3-column rows all pass every pre-existing gate in this repo.
// M3/M4 (drop one of the two 副标) are the subtler pair, and they are what the
// legacy suite's own name claims to cover.
//
// Why this file can reach it: printSummary is a pure (results) => void
// function whose only side effect is cliLog, i.e. console.log. Requiring
// src/index.ts is safe under jest (established in
// tests/index-load-config-runtime.test.ts): the top-level main().catch takes
// the 'help' branch -- no network, no process.exit -- and console.log is
// spied for the duration.
//
// No file-local copy of printSummary, no source-text grep, no reporter mock:
// the assertions are on the bytes printSummary actually writes to stdout.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { EvaluationResult, DimensionScore, QuestionScore, ExternalDispatchType } from '../src/types';
import { DIM_HEADERS } from '../src/core/reporter';

type PrintSummary = (results: EvaluationResult[]) => void;

// printSummary is module-private in src/index.ts (L252), and src/index.ts ends
// with a top-level main().catch(...) that runs on require. So the seam is the
// same one the module already offers: a network-free path. runBenchmark is the
// only other export and it needs an adapter.
//
// Cheaper alternative that keeps this test file-local and honest: run the real
// runBenchmark end-to-end with a config whose model type resolves to a stub
// adapter. That needs module mocking of ./core/evaluator, which is heavier than
// the thing under test.
//
// So: import the module and pull printSummary off it. If it is not exported
// (today's state), the suite FAILS LOUDLY on the first case instead of passing
// for the wrong reason -- see case 0.
const mod = require('../src/index') as { printSummary?: unknown };

const baseDim = (avg: number) => ({
  total: avg,
  count: 1,
  average: avg,
  details: { test: avg },
});

const dims = (overrides: Partial<DimensionScore> = {}): DimensionScore => ({
  dialogue: baseDim(85) as DimensionScore['dialogue'],
  coding: baseDim(75) as DimensionScore['coding'],
  ...overrides,
});

const result = (modelName: string, total: number, extra: Partial<EvaluationResult> = {}): EvaluationResult =>
  ({
    modelName,
    model: { name: modelName, model: modelName } as never,
    totalScore: total,
    duration: 1000,
    scores: [] as QuestionScore[],
    dimensions: dims(),
    timestamp: new Date('2026-10-04T05:03:00+08:00'),
    ...extra,
  }) as EvaluationResult;

describe('src/index.ts printSummary (runtime)', () => {
  const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  // printSummary writes one console.log per line, so the recorded calls ARE the
  // emitted lines. The mock is cleared per case because several cases assert on
  // "the first row", which would otherwise drift to a row from an earlier case.
  const lines = (): string[] => logSpy.mock.calls.map((c) => String(c[0]));

  // A model row is the only line that starts with '| ' AND is not the header.
  // The header itself starts with '| 排名 ', so a bare startsWith('| ') filter
  // would match the header on every single case.
  const rows = (): string[] => lines().filter((l) => l.startsWith('| ') && !l.startsWith('| 排名'));

  beforeEach(() => {
    logSpy.mockClear();
  });

  const printSummary = (results: EvaluationResult[]): void => {
    (mod.printSummary as PrintSummary)(results);
  };

  afterAll(() => {
    logSpy.mockRestore();
  });

  // Case 0: the symbol must actually be reachable. A suite that re-declares the
  // function it claims to test always passes; this assertion makes that
  // impossible -- if the export is removed or renamed, this fails here rather
  // than letting every later case pass for the wrong reason.
  test('src/index.ts actually exports a callable printSummary', () => {
    expect(typeof mod.printSummary).toBe('function');
  });

  describe('ranking order (the 4-way medal ternary)', () => {
    test('sorts descending by totalScore, medals assigned by RANK not input order', () => {
      printSummary([result('worst', 10), result('best', 99), result('middle', 50)]);
      const out = rows();
      // 3 model rows, plus nothing else starts with '| '.
      expect(out).toHaveLength(3);
      // The row order IS the rank order.
      expect(out[0]).toContain('best');
      expect(out[1]).toContain('middle');
      expect(out[2]).toContain('worst');
    });

    test('does not mutate the caller array (spread before sort)', () => {
      const input = [result('a', 10), result('b', 99)];
      printSummary(input);
      expect(input.map((r) => r.modelName)).toEqual(['a', 'b']);
    });

    test('a 4th-and-beyond model gets its 1-based ordinal, not a medal', () => {
      printSummary([
        result('m1', 90),
        result('m2', 80),
        result('m3', 70),
        result('m4', 60),
      ]);
      const out = rows();
      expect(out).toHaveLength(4);
      expect(out[0]).toContain('🥇');
      expect(out[1]).toContain('🥈');
      expect(out[2]).toContain('🥉');
      expect(out[3]).toContain('4');
      // The ordinal must be alone in its cell, not embedded in the name.
      expect(out[3]).toMatch(/\|\s*4\s*\|/);
    });
  });

  describe('header / separator shape', () => {
    test('header carries all 5 dim columns between 总分 and the closing pipe', () => {
      printSummary([]);
      const header = lines().find((l) => l.startsWith('| 排名'));
      expect(header).toBeDefined();
      for (const d of DIM_HEADERS) {
        expect(header).toContain(`| ${d.cn} `);
      }
      // Every cell string already embeds its own '|' ('| 排名 '), so a raw
      // split on '|' counts each pipe twice. Filter empties to get real cells:
      // 排名 + 模型 + 总分 + 5 dims = 8.
      const cells = header!.split('|').map((c) => c.trim()).filter((c) => c !== '');
      expect(cells).toHaveLength(8);
    });

    test('separator has one ---- per header cell', () => {
      printSummary([]);
      const header = lines().find((l) => l.startsWith('| 排名'))!;
      const sep = lines().find((l) => l.startsWith('|------'))!;
      const sepCells = sep.split('|').map((c) => c.trim()).filter((c) => c !== '');
      const headerCells = header.split('|').map((c) => c.trim()).filter((c) => c !== '');
      expect(sepCells).toHaveLength(headerCells.length);
      expect(sepCells.every((c) => /^-+$/.test(c))).toBe(true);
    });

    test('an empty result list prints the header and separator but no model rows', () => {
      printSummary([]);
      expect(rows()).toHaveLength(0);
    });
  });

  describe('row composition', () => {
    test('each model row has 5 dim cells between the total and the closing pipe', () => {
      printSummary([result('solo', 42)]);
      const row = rows()[0];
      const cells = row.split('|').map((s) => s.trim()).filter((s) => s !== '');
      // rank, model, total, 5 dims
      expect(cells).toHaveLength(8);
    });

    test('total-score cell keeps its bold markers and the raw number', () => {
      printSummary([result('solo', 42)]);
      const row = rows()[0];
      expect(row).toContain('**42**');
    });

    test('a dimension with no data renders the helper placeholder, not NaN', () => {
      // Only dialogue present; coding absent -> the '|' the helper is meant to
      // stand in for. getDimCell owns the contract, so we assert the ROW, not
      // the helper: no 'undefined' and no 'NaN' anywhere in the line.
      const r = result('sparse', 50, {
        dimensions: { dialogue: baseDim(60) } as unknown as DimensionScore,
      });
      printSummary([r]);
      const row = rows()[0];
      expect(row).not.toContain('undefined');
      expect(row).not.toContain('NaN');
    });

    test('dim cell values come from each dimension own average', () => {
      const r = result('dimmed', 50, {
        dimensions: {
          dialogue: baseDim(91) as DimensionScore['dialogue'],
          coding: baseDim(12) as DimensionScore['coding'],
        } as DimensionScore,
      });
      printSummary([r]);
      const row = rows()[0];
      expect(row).toContain('91');
      expect(row).toContain('12');
    });
  });

  describe('model-label composition (the two 副标)', () => {
    test('no dispatchType and no sub-label -> the model name stands alone', () => {
      printSummary([result('plain-model', 50)]);
      const row = rows()[0];
      expect(row).toContain('plain-model');
      expect(row).not.toContain('(type=');
    });

    test('a dispatchType renders as the (type=X) 副标 after the name', () => {
      const r = result('tagged', 50, { dispatchType: 'agentic_coding' as ExternalDispatchType });
      printSummary([r]);
      const row = rows()[0];
      expect(row).toContain('tagged (type=agentic_coding)');
    });

    test('a sub-label-bearing score renders the sub 副标 after the (type=) tag', () => {
      const q = { category: 'agentic_thing', score: 9 } as unknown as QuestionScore;
      const r = result('both', 50, {
        dispatchType: 'agentic_coding' as ExternalDispatchType,
        scores: [q],
      });
      printSummary([r]);
      const row = rows()[0];
      // Whatever the sub-label string is, the (type=) tag must still be there
      // and the cell must not degrade to the bare name.
      expect(row).toContain('(type=agentic_coding)');
    });

    test('dropping EITHER 副标 is visible in the row text (M3/M4 killed)', () => {
      const r = result('both', 50, {
        dispatchType: 'agentic_coding' as ExternalDispatchType,
        scores: [{ category: 'agentic_thing', score: 9 } as unknown as QuestionScore],
      });
      printSummary([r]);
      const row = rows()[0];
      const cells = row.split('|').map((s) => s.trim());
      // index 2 == model cell (rank, model, total, ...)
      expect(cells[2]).not.toBe('both');
    });
  });
});
