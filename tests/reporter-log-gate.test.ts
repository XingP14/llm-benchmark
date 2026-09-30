// tests/reporter-log-gate.test.ts
//
// Closes the last dark branch arm in src/core/reporter.ts (branches 55/56 at
// 64a00ab) and the last dark STATEMENT/FUNCTION pair outside the sandbox.
//
//   line 9  `if (shouldLogReports) console.log(...args)` inside logReport
//           -> under jest, NODE_ENV === 'test', so `shouldLogReports` is always
//              false and the entire emission path has ZERO execution. The 5
//              `logReport('...')` calls in saveReport (L555-559) are all
//              no-ops in every one of the 85 suites.
//
// WHY IT IS NOT COSMETIC
//
// This is the ONLY log gate in the shipped surface whose emission path is
// unverified. Its three siblings were all closed in earlier ticks and all
// follow the same shape:
//   - src/web/websocket.ts:9/11   -> tests/web/websocket-sender-fallback-and-log-gate.test.ts
//   - src/core/scorer.ts          -> tests/scorer-console-error-parity.test.ts (L103 source gate)
//   - src/web/engine/evaluator.ts -> tests/web/evaluator-remaining-branch-guards.test.ts
// The scorer's suite only asserts the gate's SOURCE TEXT (the regex at
// scorer-console-error-parity.test.ts:113); the websocket and evaluator suites
// do drive the gate at runtime via jest.isolateModules with a non-test NODE_ENV.
//
// The difference matters because logReport is a MODULE-LEVEL const computed
// once at import time. Poking process.env after the import cannot reach it --
// the only way to execute the true arm is to re-evaluate the module under a
// non-test NODE_ENV. That is exactly what these tests do, and it is the only
// place in the repo that proves the `报告已保存到` banner is actually printed
// for a real user, and that the JEST_WORKER_ID backstop (the second operand,
// which has also never been evaluated anywhere in this file) suppresses it
// even when NODE_ENV is NOT test.
//
// The saveReport tests in reporter.test.ts are the adjacent invariant: they
// assert the four files land on disk but run with the gate closed, so they
// would stay green if logReport were deleted outright. The `not.toBe` on the
// spy below is what turns that into a visible test change.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { EvaluationResult } from '../src/types';

const mockResults: EvaluationResult[] = [
  {
    modelName: 'Gate Model',
    model: {
      name: 'Gate Model',
      endpoint: 'https://api.example.com',
      apiKey: 'not-a-real-key',
      type: 'openai',
    },
    scores: [
      {
        questionId: 'q1',
        category: 'test',
        score: 85,
        dimension: 'dialogue',
        modelOutput: 'output',
      },
    ],
    totalScore: 85,
    dimensions: {
      dialogue: { total: 85, count: 1, average: 85, details: { test: 85 } },
      coding: { total: 75, count: 1, average: 75, details: { test: 75 } },
    },
    timestamp: new Date(0),
    duration: 1000,
  },
];

// A fresh module instance guarantees shouldLogReports is recomputed from the
// env we set below, rather than from whatever the first import in this worker
// observed. Order-independent by construction.
function freshReporter(): typeof import('../src/core/reporter') {
  let mod!: typeof import('../src/core/reporter');
  jest.isolateModules(() => {
    mod = require('../src/core/reporter') as typeof import('../src/core/reporter');
  });
  return mod;
}

const envBackup = {
  NODE_ENV: process.env.NODE_ENV,
  JEST_WORKER_ID: process.env.JEST_WORKER_ID,
};

let outputDir: string;

beforeEach(() => {
  outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reporter-log-gate-'));
});

afterEach(() => {
  if (envBackup.NODE_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = envBackup.NODE_ENV;
  if (envBackup.JEST_WORKER_ID === undefined) delete process.env.JEST_WORKER_ID;
  else process.env.JEST_WORKER_ID = envBackup.JEST_WORKER_ID;
  fs.rmSync(outputDir, { recursive: true, force: true });
  jest.restoreAllMocks();
});

describe('reporter.ts log gate (line 9)', () => {
  it('prints the report-saved banner when NODE_ENV is not test and no jest worker id is set', () => {
    process.env.NODE_ENV = 'production';
    // Falsy rather than deleted: exercises the SECOND operand of the line-7
    // `&&` (its first ever evaluation in this file) without removing a key
    // other modules in this worker may read.
    process.env.JEST_WORKER_ID = '';

    const spy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const { Reporter } = freshReporter();
    Reporter.saveReport(mockResults, outputDir);

    // The banner is a 5-line block: the header plus one line per artefact.
    // Assert the header and the CSV footer verbatim, and the file count via
    // the spy's own calls rather than a hardcoded 5 so a future artefact
    // addition does not silently break the count without the gate being wrong.
    const messages = spy.mock.calls.map((c) => c.join(' '));
    const header = messages.find((m) => m.includes('报告已保存到'));
    expect(header).toBe(`\n报告已保存到: ${outputDir}`);
    expect(messages.some((m) => m.includes('.json'))).toBe(true);
    expect(messages.some((m) => m.includes('.md'))).toBe(true);
    expect(messages.some((m) => m.includes('.html'))).toBe(true);
    expect(messages.some((m) => m.includes('.csv'))).toBe(true);

    // The gate emitting is not a substitute for the work: the 4 artefacts
    // must actually be on disk. Otherwise a regression that threw before
    // reaching the log calls could produce a vacuous pass.
    const files = fs.readdirSync(outputDir);
    expect(files.filter((f) => f.endsWith('.json'))).toHaveLength(1);
    expect(files.filter((f) => f.endsWith('.md'))).toHaveLength(1);
    expect(files.filter((f) => f.endsWith('.html'))).toHaveLength(1);
    expect(files.filter((f) => f.endsWith('.csv'))).toHaveLength(1);
  });

  it('suppresses the banner when a jest worker id is present despite NODE_ENV=production', () => {
    process.env.NODE_ENV = 'production';
    process.env.JEST_WORKER_ID = '3';

    const spy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const { Reporter } = freshReporter();
    Reporter.saveReport(mockResults, outputDir);

    expect(spy).not.toHaveBeenCalled();
    // Same four artefacts, still written -- the gate governs logging only.
    // This is the distinction that reporter.test.ts's saveReport cases cannot
    // see, because there the gate is closed by NODE_ENV rather than by the
    // backstop operand.
    const files = fs.readdirSync(outputDir);
    expect(files.filter((f) => f.endsWith('.csv'))).toHaveLength(1);
  });

  it('suppresses the banner under NODE_ENV=test even with the worker id cleared', () => {
    // The other half of the line-7 `&&`: with NODE_ENV=test the first operand
    // is false and the JEST_WORKER_ID backstop is never even consulted. Pinned
    // because deleting the NODE_ENV operand entirely would still leave the two
    // tests above green -- this is the only case that catches it.
    process.env.NODE_ENV = 'test';
    delete process.env.JEST_WORKER_ID;

    const spy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const { Reporter } = freshReporter();
    Reporter.saveReport(mockResults, outputDir);

    expect(spy).not.toHaveBeenCalled();
  });

  it('keeps the gate a module-level decision: re-importing under test env stays quiet', () => {
    // A non-test instance is created first so the "quiet" case below cannot
    // pass merely because no non-test import happened to exist in this worker.
    process.env.NODE_ENV = 'production';
    process.env.JEST_WORKER_ID = '';
    const loud = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const { Reporter: LoudReporter } = freshReporter();
    LoudReporter.saveReport(mockResults, outputDir);
    expect(loud).toHaveBeenCalled();
    loud.mockClear();
    jest.restoreAllMocks();

    process.env.NODE_ENV = 'test';
    const quiet = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const { Reporter: QuietReporter } = freshReporter();
    QuietReporter.saveReport(mockResults, outputDir);

    // Two module instances, two different gate values, from the same process
    // and the same env-mutation API. If the gate were read per-call instead of
    // frozen at import, the second instance would reuse the first's value.
    expect(quiet).not.toHaveBeenCalled();
  });
});
