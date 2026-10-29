// tests/web/r519-web-coding-score-ignores-test-cases.test.ts
//
// WHY THIS FILE EXISTS (2026-10-30 02:03 cron, llm-benchmark rotation).
//
// The repository ships ELEVEN coding benchmarks (MEASURED 2026-10-30 05:03,
// census over `getAllCodeBenchmarks()`: 11 benchmarks, 35 test cases, 0 of
// them carry an empty input -- ids code-basic-001/002, code-string-001/002,
// code-array-001/002, code-algo-001/002/003, code-ds-001/002), each with its
// own `testCases` (src/benchmarks/coding.ts: `CodeBenchmarkQuestion.testCases`).
// The CLI evaluates them through `Scorer.scoreCoding(question, output,
// question.testCases)` (src/core/evaluator.ts:1799), which EXECUTES each test
// case and COMPARES the output with `expectedOutput`.
//
// The Web UI's evaluator does not:
//
//   src/web/engine/evaluator.ts:305
//     private async scoreCoding(_question: BenchmarkQuestion, output: string)
//
//   -- the question is DISCARDED (the parameter is named `_question`), so the
//      benchmark's test cases are never read; and
//
//   src/web/engine/evaluator.ts:320
//     const result = await this.sandbox.execute(testCode, '');
//
//   -- the sandbox is invoked with an EMPTY input, and PythonSandbox builds
//      `result = <funcName>(<input>)` (src/sandbox/python-sandbox.ts:180), so
//      the generated function is called with ZERO ARGUMENTS.
//
// Every one of the eleven benchmark functions takes at least one argument
// (measured: 0 of the 35 test cases carry an empty input), so the call raises
// `TypeError: add() missing 2 required positional arguments`, the sandbox
// reports `success: false`, and the scorer falls through to `return { score:
// 60 }`.
//
// MEASURED (real web engine, real PythonSandbox, real python3, no mock of
// the sandbox):
//
//   CORRECT answer `def add(a, b): return a + b`   -> 60 on ALL 11 coding
//                                                      questions
//   WRONG   answer `def add(a, b): return a - b`   -> 60 on ALL 11 coding
//                                                      questions
//   ... and the SAME code through the CLI Scorer    -> 95 (correct) vs 42
//                                                      (wrong)
//
// So the Web UI's coding score is a function of the FUNCTION'S ARITY, not of
// the answer's correctness. Arm (5) shows the inversion: a WRONG zero-argument
// answer scores 80, which is HIGHER than a CORRECT two-argument answer's 60.
//
// The `results` table's `test_results` column (src/web/db/database.ts:157) is
// declared and written by NO insert anywhere in src/ (arm 6) -- the shape where
// a per-test-case result would have landed. The CLI computes the per-case
// `TestResult[]` inside `Scorer.executeTests` and then throws it away too:
// `QuestionScore` has no field to carry it.
//
// WHAT THIS FILE DELIBERATELY DOES NOT DO
//
// It asserts no correct behaviour, and it ships no production change. The
// repair is a product decision:
//
//   F1/F2 -- adopt the CLI's shape (run the benchmark's test cases and compare
//            their outputs), or keep the web ladder (20/40/50/60/80) and only
//            add the test cases as an extra signal? The second changes what a
//            stored score MEANS, so every already-stored web result is
//            re-interpreted.
//   F3     -- the CLI and the web scoring ladders are DIFFERENT on purpose
//            (the web one is a cheap heuristic, the CLI one is test-driven).
//            Should the web path REPLACE its ladder with the CLI's, or run
//            both?
//   F4     -- `results.test_results`: write the per-case results, drop the
//            column, or leave it declared and unwritten?
//
// All four are recorded father-gated. Pinning the CURRENT behaviour makes each
// decision visible and stops it drifting silently; when a policy lands, the
// matching arm below is the RED that has to be updated.
//
// HARNESS NOTES (all measured on this file)
//
// 1. THE SANDBOX IS REAL.  The arms that score code drive the production
//    `PythonSandbox`, which spawns `python3`.  A mocked sandbox cannot
//    distinguish "the call threw" from "the answer was wrong" -- which is the
//    whole subject of the finding.  The cost is ~40 python3 spawns (measured
//    ~150ms each), so the file runs in the tens of seconds, not milliseconds.
// 2. THE ADAPTER IS MOCKED.  `chat()` returns the code under test.  No network
//    call is made; the sandbox is the only subprocess.
// 3. NO CREDENTIAL IS EVER PRINTED.  The seeded api_key is a placeholder and
//    is never echoed.

import express, { Express } from 'express';
import { EvaluatorEngine } from '../../src/web/engine/evaluator';
import { taskManager } from '../../src/web/engine/task';
import { Scorer } from '../../src/core/scorer';
import { PythonSandbox } from '../../src/sandbox/python-sandbox';
import { getAllCodeBenchmarks } from '../../src/benchmarks/coding';
import { resetDatabase, initAdminUser, resetSingleton, getDatabase } from '../../src/web/db/database';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import type { LLMAdapter } from '../../src/adapters/adapter';
import type { ModelConfig } from '../../src/types';

// The adapter is mocked (harness note 2): the code under test comes back from
// chat(), and nothing else about the adapter is the subject.
jest.mock('../../src/adapters/openai-adapter', () => ({
  OpenAIAdapter: jest.fn().mockImplementation(() => ({
    chat: jest.fn(),
    getName: () => 'OpenAI Compatible',
  })),
}));

const { OpenAIAdapter } = require('../../src/adapters/openai-adapter');

/** Set the code that the (mocked) adapter will return for EVERY question. */
function setModelOutput(code: string): void {
  (OpenAIAdapter as jest.Mock).mockImplementation(() => ({
    chat: jest.fn().mockResolvedValue(code),
    getName: () => 'OpenAI Compatible',
  }));
}

/**
 * Run the REAL web engine over the REAL coding benchmark set and return the
 * score of every coding result row it wrote.
 *
 * Nothing here is a re-implementation of the engine: `EvaluatorEngine.run()`,
 * `taskManager`, the SQLite database and `PythonSandbox` are all production
 * code.  Only the adapter's `chat()` is mocked (harness note 2).
 */
async function scoreAllCodingQuestions(_code: string): Promise<number[]> {
  const db = getDatabase();
  const admin = db.prepare('SELECT id FROM users WHERE username=?').get('admin') as { id: number };

  const cfg = db
    .prepare(
      "INSERT INTO configs (user_id, name, type, endpoint, api_key, model) " +
        "VALUES (?, 'R519', 'openai', 'https://example.invalid/v1', 'sk-placeholder', 'gpt-4')",
    )
    .run(admin.id);
  const configId = cfg.lastInsertRowid as number;

  const taskId = taskManager.startTask(admin.id, [configId], false, true);
  db.prepare(
    "INSERT INTO evaluations (id, user_id, status, include_dialogue, include_coding) " +
      "VALUES (?, ?, 'PENDING', 0, 1)",
  ).run(taskId, admin.id);

  const engine = new EvaluatorEngine();
  await engine.run(taskId, () => {});

  const rows = db
    .prepare(
      "SELECT score FROM results WHERE evaluation_id=? AND question_type='coding' ORDER BY question_id",
    )
    .all(taskId) as Array<{ score: number }>;
  return rows.map((r) => r.score);
}

/** The CLI-side scorer, driven with the benchmark's OWN test cases. */
const cliModel: ModelConfig = { name: 'r519', type: 'openai', endpoint: '', apiKey: 'x' };
const cliAdapter: LLMAdapter = {
  getName: () => 'r519',
  chat: async () => 'never called',
  ping: async () => false,
};

const CORRECT_ADD = 'def add(a, b):\n    return a + b';
const WRONG_ADD = 'def add(a, b):\n    return a - b';
const WRONG_ZERO_ARG = 'def add():\n    return 0';

describe('r519 — the web coding score ignores the benchmark\'s test cases', () => {
  beforeAll(() => {
    resetSingleton();
    initAdminUser();
  });

  beforeEach(() => {
    resetDatabase();
    taskManager.clear();
  });

  // (0) PREMISE.  Two source facts, both load-bearing for the arms below.
  //
  //   P1 -- the web scorer DISCARDS the question (the parameter is named
  //         `_question`), so the benchmark's test cases cannot reach it;
  //   P2 -- the web scorer calls the sandbox with an EMPTY input, so the
  //         generated function is invoked with zero arguments;
  //   P3 -- the CLI scorer DOES pass the test cases, so the two paths are
  //         written differently in the SAME repository.
  //
  // If a later commit repairs the web path, these arms go red first and say
  // which arm has to be updated with the policy.
  it('(0) premise: the web scorer discards the question and calls the sandbox with an empty input', () => {
    const webSrc = readFileSync(join(__dirname, '../../src/web/engine/evaluator.ts'), 'utf8');

    const webScoringLine = webSrc
      .split('\n')
      .find((l) => l.includes('private async scoreCoding'))!;
    expect(webScoringLine).toBeTruthy();
    // P1: the question is not used.
    expect(webScoringLine).toContain('_question');
    expect(webScoringLine).not.toMatch(/scoreCoding\(question\b/);

    // P2: the sandbox is called with an empty input.
    const sandboxCall = webSrc.split('\n').find((l) => l.includes('this.sandbox.execute('))!;
    expect(sandboxCall).toBeTruthy();
    expect(sandboxCall).toContain("execute(testCode, '')");

    // P3: the CLI path passes the benchmark's test cases.
    const cliSrc = readFileSync(join(__dirname, '../../src/core/evaluator.ts'), 'utf8');
    expect(cliSrc).toContain('scorer.scoreCoding(question, modelOutput, codeQuestion.testCases)');

    // And the sandbox builds `result = <func>(<input>)` -- the line that turns
    // an empty input into a zero-argument call.
    const sandboxSrc = readFileSync(join(__dirname, '../../src/sandbox/python-sandbox.ts'), 'utf8');
    expect(sandboxSrc).toContain('result = ${funcName}(${input})');
  });

  // (1) F1a.  A CORRECT coding answer scores 60 on every coding question.
  //     60 is the "the sandbox call threw" arm of the web ladder
  //     (src/web/engine/evaluator.ts:327), not a quality judgement.
  it('(1) F1a: a CORRECT coding answer scores 60 on every coding question', async () => {
    setModelOutput(CORRECT_ADD);
    const scores = await scoreAllCodingQuestions(CORRECT_ADD);

    expect(scores.length).toBeGreaterThan(0);
    expect(new Set(scores).size).toBe(1);
    expect(scores[0]).toBe(60);
  }, 120000);

  // (2) F1b.  THE HEADLINE.  A WRONG coding answer scores EXACTLY the same.
  //     The web coding score cannot tell the two answers apart, so a model
  //     that is systematically wrong is scored identically to one that is
  //     systematically right.
  it('(2) F1b: a WRONG coding answer scores identically to a CORRECT one', async () => {
    setModelOutput(CORRECT_ADD);
    const correct = await scoreAllCodingQuestions(CORRECT_ADD);

    resetDatabase();
    taskManager.clear();
    setModelOutput(WRONG_ADD);
    const wrong = await scoreAllCodingQuestions(WRONG_ADD);

    expect(correct.length).toBe(wrong.length);
    expect(wrong).toEqual(correct);
  }, 180000);

  // (3) F2.  THE MECHANISM.  The failure is the MISSING ARGUMENT, not the
  //     answer.  Driving the SAME correct code with the benchmark's OWN first
  //     test case succeeds and prints the expected value -- so the code is
  //     right, and it is the web path's empty input that made the call fail.
  it('(3) F2: the correct answer runs fine under the benchmark\'s own test case', async () => {
    const q = getAllCodeBenchmarks()[0];
    expect(q.testCases.length).toBeGreaterThan(0);

    const sandbox = new PythonSandbox();
    const tc = q.testCases[0];

    // The production call shape the CLI uses: the test case's input.
    const withInput = await sandbox.execute(CORRECT_ADD, tc.input);
    expect(withInput.success).toBe(true);
    expect(withInput.output.trim()).toBe(tc.expectedOutput.trim());

    // The production call shape the web path uses: an empty input.
    const withEmpty = await sandbox.execute(CORRECT_ADD, '');
    expect(withEmpty.success).toBe(false);
    expect(String(withEmpty.error)).toContain('missing');
  }, 60000);

  // (4) F3.  THE CONTRAST.  The sibling scorer IN THE SAME REPOSITORY runs
  //     the benchmark's test cases and DOES distinguish the two answers.  A
  //     bare "the web score is 60" would be a statement about the web path
  //     alone; the comparison is what makes it a statement about THIS
  //     repository having two different scoring paths.
  it('(4) F3: the CLI scorer distinguishes the same two answers (95 vs 42)', async () => {
    const q = getAllCodeBenchmarks()[0];
    const scorer = new Scorer(cliAdapter, cliModel);

    const correct = await scorer.scoreCoding(q, CORRECT_ADD, q.testCases);
    const wrong = await scorer.scoreCoding(q, WRONG_ADD, q.testCases);

    expect(correct.score).toBeGreaterThan(wrong.score);
    expect(correct.detail).toContain(`${q.testCases.length}/${q.testCases.length}`);
    expect(wrong.detail).not.toContain(`${q.testCases.length}/${q.testCases.length}`);
  }, 60000);

  // (5) F3'.  THE INVERSION.  A WRONG zero-argument answer scores 80 --
  //     HIGHER than a CORRECT two-argument answer's 60.  The web coding score
  //     is a function of the function's ARITY, and it rewards a wrong answer
  //     that happens to be callable with no arguments.
  it('(5) F3\': a WRONG zero-argument answer scores HIGHER than a CORRECT one', async () => {
    setModelOutput(WRONG_ZERO_ARG);
    const zeroArg = await scoreAllCodingQuestions(WRONG_ZERO_ARG);

    resetDatabase();
    taskManager.clear();
    setModelOutput(CORRECT_ADD);
    const correct = await scoreAllCodingQuestions(CORRECT_ADD);

    // The zero-argument answer RUNS (the sandbox only checks the exit code),
    // so it lands on the 80 arm of the web ladder.
    expect(Math.max(...zeroArg)).toBe(80);
    // ...and that is strictly HIGHER than the correct answer's 60.
    expect(Math.max(...zeroArg)).toBeGreaterThan(Math.max(...correct));
  }, 180000);

  // (6) F4.  THE COLUMN WITH NO WRITER.  `results.test_results` is declared
  //     in the schema, and NO insert statement anywhere in src/ writes it --
  //     the shape where the per-test-case results would have landed.  The
  //     census is over src/ (not over tests/), and it is not vacuous: it
  //     finds the inserts that DO exist.
  it('(6) F4: results.test_results is declared and written by no insert in src/', () => {
    const schema = readFileSync(join(__dirname, '../../src/web/db/database.ts'), 'utf8');
    expect(schema).toContain('test_results TEXT');

    const srcRoot = join(__dirname, '../../src');
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const p = join(dir, entry);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith('.ts')) files.push(p);
      }
    };
    walk(srcRoot);
    expect(files.length).toBeGreaterThan(10);

    const inserts = files.filter((f) => readFileSync(f, 'utf8').includes('INSERT INTO results'));
    // Not vacuous: the production insert(s) exist.
    expect(inserts.length).toBeGreaterThan(0);
    for (const f of inserts) {
      expect(readFileSync(f, 'utf8')).not.toContain('test_results');
    }
  });

  // (7) F4'.  THE INFORMATION IS PRESENT AND ALREADY SERVED.  Every coding
  //     benchmark carries test cases, and GET /api/questions already hands
  //     them to the browser -- so the web path does not lack the data, it
  //     discards it.  (The census: 0 of the benchmark test cases carry an
  //     empty input, which is why the zero-argument call fails everywhere.)
  it('(7) F4\': the test cases exist, are non-empty, and are already served to the browser', () => {
    const benchmarks = getAllCodeBenchmarks();
    expect(benchmarks.length).toBeGreaterThan(0);

    for (const b of benchmarks) {
      expect(b.testCases.length).toBeGreaterThan(0);
      for (const tc of b.testCases) {
        expect(tc.input.length).toBeGreaterThan(0);
      }
    }

    // The route already serialises them.
    const questionsSrc = readFileSync(join(__dirname, '../../src/web/routes/questions.ts'), 'utf8');
    expect(questionsSrc).toContain('test_cases: q.testCases?.map');
  });
});
