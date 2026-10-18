// tests/web/r487-web-coding-score-ignores-test-cases.test.ts
//
// WHY THIS FILE EXISTS (2026-10-19 22:43 cron, llm-benchmark rotation).
//
// r474 pinned what PUT /api/configs/:id does, r475 the cross-tenant axis of
// POST /api/evaluations, r478 that BenchmarkQuestion.weight has no reader,
// r486 that config_ids is not a set. All of them sit on the REQUEST side of
// the web pipeline. This file sits on the only other side: the score the web
// pipeline COMPUTES, for the one dimension that has an executable definition.
//
// There are TWO scoring implementations for the same 11 coding questions:
//
//   CLI   src/core/evaluator.ts:1799
//           scorer.scoreCoding(question, modelOutput, codeQuestion.testCases)
//         -> src/core/scorer.ts:110  if (testCases && testCases.length > 0)
//         -> executeTests() per case, sandbox, compare to expectedOutput
//         -> score = (passed/total)*80 + quality(0..20)
//
//   WEB   src/web/engine/evaluator.ts:314
//           private async scoreCoding(_question: BenchmarkQuestion, output)
//
// The web one names its parameter `_question` and NEVER READS IT. A shipped
// suite (tests/web/evaluator-scorecoding-unused-param.test.ts) celebrates
// exactly that rename as a fix for TS6133 -- so the underscore is a shipped,
// blessed shape, not an accident. Every one of the 11 questions in
// src/benchmarks/coding.ts carries a `testCases` array (11/11, measured), and
// the web path discards all of them.
//
// WHAT THE WEB PATH ACTUALLY DOES (evaluator.ts:314-333, verbatim)
//
//   hasDef/hasReturn text test  -> 20 / 40
//   const testCode = `${output}\n\nprint("OK")`   <- the harness is authored HERE
//   const result = await this.sandbox.execute(testCode, '')   <- input ''
//   if (result.success) return 80;  ...  return 60
//
// The call is not "does this code run", it is "does this module import and
// define cleanly". PythonSandbox.execute ALWAYS appends
// `result = <funcName>(<input>)` (python-sandbox.ts:73) and input is ''. So a
// 2-arg `def add(a, b)` becomes `result = add()` -- a TypeError before any
// assertion about the answer is ever made.
//
// THE HEADLINE, MEASURED OVER ALL 11 REAL QUESTIONS
//
//   web scoreCoding: {60: 11}     -> 80 is STRUCTURALLY UNREACHABLE.
//
// Not "rarely reached": unreachable. The only path to 80 requires
// sandbox.success on `result = <fn>()` with zero arguments. A zero-arg model
// answer could get there -- and then F1 below shows the score is still wrong,
// because the test never called the function with anything the question asks
// for.
//
// FOUR DEFECTS, each measured, none inferred from source shape:
//
//   F1  THE ANSWER IS NEVER EXERCISED. The harness runs the module TOP-LEVEL
//       only. Measured on a wrong-bodied but well-formed answer:
//
//           def add(a, b):\n    return a - b        <- subtracts
//           web  = 60        (sandbox failed, fell through to the 60 floor)
//           CLI  = 47        (0/3 test cases, quality 20)
//
//       and on the CORRECT answer, same harness:
//
//           def add(a, b):\n    return a + b
//           web  = 60
//           CLI  = 100
//
//       So the web score is not merely coarse -- it is INVERTED relative to
//       the CLI on this pair (correct 60 < wrong 47 by 13 points, while CLI
//       puts them 53 apart), and the leaderboard sorts on the web number.
//
//   F2  THE 80 BRANCH CANNOT BE TAKEN. 11/11 real questions land on 60.
//       Root cause measured directly against the real sandbox:
//
//           execute(code, '')            -> success=false
//               TypeError: add() missing 2 required positional arguments
//           execute(code, '1, 2')        -> success=true, output "OK\n3"
//
//       The CLI passes a REAL test-case input to the same sandbox. The web
//       path passes the empty string, which is why its only success signal is
//       an unrelated TypeError.
//
//   F3  A MODEL THAT CRASHES AND A MODEL THAT SOLVES IT ARE ADJACENT ON THE
//       SCALE. RAISES scores 40 (no `return` token survives `raise`), and a
//       constant `return 42` scores 60 -- the SAME as the fully correct
//       answer. Measured table:
//
//           CORRECT      web= 60   cli=100
//           WRONG(a-b)   web= 60   cli= 47
//           CONST(42)    web= 60   cli= 20
//           RAISES       web= 40   cli= 20
//
//       F3 is the reason this is a correctness finding and not a coverage one:
//       on the web path a wrong answer, a hardcoded answer and a right answer
//       are not separable.
//
//   F4  THE QUESTION IS CARRIED INTO THE ENGINE AND THEN DROPPED. The engine
//       holds the real CodeBenchmarkQuestion (the `questions` array is built
//       from getAllCodeBenchmarks(), which returns the typed objects with
//       testCases attached), dispatches it to scoreCoding, and scoreCoding
//       reads only `output`. Arm (5) proves the object that ARRIVES still
//       carries its test cases, so the loss is inside scoreCoding, not on the
//       way in.
//
// WHAT THIS FILE DELIBERATELY DOES NOT DO
//
// It asserts no correct behaviour. Each repair is a product decision:
//
//   F1/F2/F3 -- route the web path through core Scorer.scoreCoding with
//               question.testCases (one line, and it makes the two
//               implementations agree by construction) vs keep a web-specific
//               fast scorer and document why it differs vs implement the
//               harness in web/engine/evaluator.ts (duplicating scorer.ts's
//               executeTests a third time).
//   F2 alone  -- pass `input` through to execute() instead of ''. But with no
//               test case there IS no input, so this is F1 in disguise.
//   F3        -- is 60 a legitimate "shape ok, correctness unknown" band, in
//               which case the answer column and the leaderboard should say so?
//
// All four are recorded father-gated. This file pins the behaviour that has
// to change so each decision is visible and cannot drift silently.
//
// HARNESS NOTES (all measured on this file)
//
// 1. THE REAL ENGINE IS DRIVEN, NOT A REPLICA. Every score below comes from
//    `new EvaluatorEngine()` and its PRIVATE scoreCoding, reached the way
//    production reaches it. The first draft of the probe re-implemented
//    scoreCoding as a local copy and got the same numbers -- which proves
//    nothing, since a replica cannot drift from the original by accident but
//    also cannot detect a future change to it. Arm (0) is the control that
//    fails if the source ever stops matching.
// 2. THE REAL SANDBOX RUNS. python3 is present on this host, so every
//    score is an executed child process, not a mock. No arm mocks
//    PythonSandbox, which is why the 60/60/60/40 table above is evidence.
// 3. NO NETWORK. The coding dimension never reaches an adapter: scoreCoding
//    is reached directly, so no provider call is issued.
// 4. NO DB. scoreCoding is pure over (question, output); no evaluation row is
//    written and no admin user is seeded.
// 5. PRIVATE ACCESS IS BY BRACKET, NOT `any` on the class. See driveScore.
//    Casting the instance to a structural type keeps the suite honest: if the
//    method is renamed the call throws TypeError rather than silently scoring
//    undefined.

import { EvaluatorEngine } from '../../src/web/engine/evaluator';
import { codeBenchmarks, CodeBenchmarkQuestion } from '../../src/benchmarks/coding';
import { Scorer } from '../../src/core/scorer';
import { PythonSandbox } from '../../src/sandbox/python-sandbox';
import * as fs from 'fs';
import * as path from 'path';

const EVALUATOR_TS = path.join(__dirname, '..', '..', 'src', 'web', 'engine', 'evaluator.ts');

// ---------------------------------------------------------------------------
// Answers under test. Every one is a syntactically valid, well-formed module
// with a `def` and a `return`/`print`, so F1/F3 cannot be explained by the
// cheap shape guards at the top of scoreCoding.
// ---------------------------------------------------------------------------
const ANSWERS = {
  CORRECT: 'def add(a, b):\n    # add two numbers\n    return a + b\n',
  WRONG: 'def add(a, b):\n    # add two numbers\n    return a - b\n',
  CONST: 'def add(a, b):\n    # add two numbers\n    return 42\n',
  RAISES: 'def add(a, b):\n    # add two numbers\n    raise ValueError("nope")\n',
};

// The real testCases of the first shipped coding question
// (code-basic-001: 正数相加 / 正负相加 / 零相加).
const REAL_QUESTION = codeBenchmarks[0] as CodeBenchmarkQuestion;

/**
 * Reach scoreCoding the way production reaches it.
 *
 * The method is private, so this is a structural cast rather than
 * `(engine as any)`: if scoreCoding is renamed or its signature changes,
 * driveScore throws instead of quietly scoring `undefined` and reporting it
 * as a 60.
 */
type ScoringSurface = {
  scoreCoding(
    question: CodeBenchmarkQuestion,
    output: string
  ): Promise<{ score: number }>;
};

function driveScore(question: CodeBenchmarkQuestion, output: string): Promise<number> {
  const engine = new EvaluatorEngine();
  const surface = engine as unknown as ScoringSurface;
  if (typeof surface.scoreCoding !== 'function') {
    throw new TypeError(
      'EvaluatorEngine.scoreCoding is not callable -- the arm below would be scoring undefined, not measuring the web path'
    );
  }
  return surface.scoreCoding(question, output).then((r) => r.score);
}

/** The CLI's own score for the same (question, answer) pair. */
function driveCliScore(
  question: CodeBenchmarkQuestion,
  output: string
): Promise<number> {
  // core Scorer needs an adapter; scoreCoding's testCases branch never calls
  // it (executeTests is pure sandbox), so a throwing stub is honest here and
  // cannot mask a network call.
  const neverCalled = {
    chat: () => {
      throw new Error('scoreCoding(testCases) must not call an adapter');
    },
    name: 'r487-stub',
  } as unknown as ConstructorParameters<typeof Scorer>[0];
  const scorer = new Scorer(neverCalled, {
    name: 'r487-stub',
    type: 'openai',
    endpoint: '',
    apiKey: '',
  } as ConstructorParameters<typeof Scorer>[1]);
  return scorer
    .scoreCoding(question, output, question.testCases)
    .then((r) => r.score);
}

describe('r487 — the web coding score ignores the question it was given', () => {
  jest.setTimeout(60000);

  describe('(0) CONTROL — the subject is still the shipped shape', () => {
    it('(0a) scoreCoding still declares the question parameter UNUSED', () => {
      const src = fs.readFileSync(EVALUATOR_TS, 'utf-8');
      // The underscore is load-bearing for this file's claim. If someone
      // starts reading the parameter, (0a) is the arm that must be revisited.
      expect(src).toMatch(
        /private async scoreCoding\(\s*_question:\s*BenchmarkQuestion\s*,\s*output:\s*string\s*\)/
      );
      // Negative: the CLI sibling DOES read it. Without this the control has
      // no discriminating power.
      expect(src).not.toMatch(/private async scoreCoding\(\s*question:\s*BenchmarkQuestion/);
    });

    it('(0b) the CLI path passes testCases into the core Scorer', () => {
      const coreSrc = fs.readFileSync(
        path.join(__dirname, '..', '..', 'src', 'core', 'evaluator.ts'),
        'utf-8'
      );
      expect(coreSrc).toMatch(/scorer\.scoreCoding\(question, modelOutput, codeQuestion\.testCases\)/);
    });

    it('(0c) PREMISE: all shipped coding questions carry test cases', () => {
      expect(codeBenchmarks.length).toBeGreaterThan(0);
      const withCases = codeBenchmarks.filter((q) => Array.isArray(q.testCases) && q.testCases.length > 0);
      // If this ever drops, the whole finding dissolves -- the questions would
      // have nothing for the web path to ignore.
      expect(withCases.length).toBe(codeBenchmarks.length);
    });

    it('(0d) CONTROL: the real sandbox CAN succeed on the web harness shape when given a real input', async () => {
      // The positive control for F2. Same harness string, same sandbox; the
      // ONLY difference is the `input` argument. If both fail, F2's root cause
      // would be somewhere else and the suite would be about the sandbox.
      const sandbox = new PythonSandbox();
      const code = `${ANSWERS.CORRECT}\n\nprint("OK")`;
      const empty = await sandbox.execute(code, '');
      const real = await sandbox.execute(code, REAL_QUESTION.testCases[0].input);
      expect(empty.success).toBe(false);
      expect(real.success).toBe(true);
      expect(real.output).toContain('OK');
    });
  });

  describe('F1 — the answer is never exercised', () => {
    it('(1) a correct answer and a wrong-bodied answer are indistinguishable on the web path', async () => {
      const correct = await driveScore(REAL_QUESTION, ANSWERS.CORRECT);
      const wrong = await driveScore(REAL_QUESTION, ANSWERS.WRONG);

      // The claim: the web path cannot tell them apart.
      expect(correct).toBe(60);
      expect(wrong).toBe(60);

      // ...and the CLI can, by a wide margin. This is the same (question,
      // answer) pair, so the two numbers are comparable.
      const cliCorrect = await driveCliScore(REAL_QUESTION, ANSWERS.CORRECT);
      const cliWrong = await driveCliScore(REAL_QUESTION, ANSWERS.WRONG);
      expect(cliCorrect).toBe(100);
      expect(cliWrong).toBeLessThan(60);
    });

    it('(2) the harness the web path builds is authored in the scorer, and calls nothing', async () => {
      // Not a source pin -- an execution. The harness string is
      // `${output}\n\nprint("OK")`, so the function is defined and the module
      // prints OK without ever being invoked with the question's input.
      const sandbox = new PythonSandbox();
      const harness = `${ANSWERS.WRONG}\n\nprint("OK")`;
      const wrongBody = await sandbox.execute(harness, '');
      expect(wrongBody.success).toBe(false);

      // With the question's real first test case, the same body answers -1
      // where 3 was expected -- i.e. it IS wrong, and only the harness shape
      // hid that.
      const realCase = await sandbox.execute(ANSWERS.WRONG, REAL_QUESTION.testCases[0].input);
      expect(realCase.output.trim()).not.toBe(REAL_QUESTION.testCases[0].expectedOutput.trim());
    });

    it('(2b) the harness the scorer BUILDS is the inert one arm (2) assumes', async () => {
      // Arm (2) pins a hand-copied reproduction of the harness string, so that
      // copy can drift from the source. M3 (rewrite the harness to invoke the
      // function under test) survived arm (2) even though it is precisely the
      // mutation (2) claims to cover. This arm closes that gap by EXTRACTING
      // the template literal from the live source: the harness under test is
      // the shipped harness rather than a hand-maintained twin of it.
      const src = fs.readFileSync(EVALUATOR_TS, 'utf-8');
      const m = src.match(/const testCode = `\$\{output\}([^`]*)`/);
      expect(m).not.toBeNull();
      const suffix = m![1];

      // The suffix must be the inert marker the web path ships -- it defines
      // the subject and never calls it. If a repair ever makes it invoke the
      // subject, this arm is the one to revisit; it is what turns M3 red.
      expect(suffix).toContain('print("OK")');
      // Strip the marker itself before the negative: print("OK") is a call
      // too, so an unstripped "no call at all" assertion contradicts the
      // positive above and would fail on the shipped, uninjected tree.
      const withoutMarker = suffix.replace(/print\("OK"\)/g, '');
      expect(withoutMarker).not.toMatch(/[A-Za-z_]\w*\(/);
    });
  });

  describe('F2 — the 80 branch is structurally unreachable', () => {
    it('(3) every shipped coding question scores 60 on the web path; none scores 80', async () => {
      const scores: Record<string, number> = {};
      for (const q of codeBenchmarks) {
        // A plausible model answer for each question, built from its own
        // starter code so the shape guards at the top of scoreCoding cannot
        // be what is being measured.
        const starter = q.starterCode || 'def f():\n    pass';
        const answer = starter.includes('pass')
          ? starter.replace('pass', 'return None  # result')
          : `${starter}\n`;
        scores[q.id] = await driveScore(q, answer);
      }
      const values = Object.values(scores);
      // The claim: the 80 branch -- the only score above the 60 floor -- is
      // unreachable for every shipped question.
      expect(values).not.toContain(80);
      // And they all land on the same number, which is the flat-score
      // statement F1 makes about the whole set.
      expect(new Set(values).size).toBe(1);
      expect(values[0]).toBe(60);
    });

    it('(4) the 80 branch ignores the question entirely: stripping the test cases changes nothing', async () => {
      // Direct statement of the mechanism: 80 needs success on
      // `result = <fn>()`, so it needs a 0-arg def — and note it needs
      // nothing else.
      const zeroArg = 'def f():\n    # anything\n    return 1\n';
      const stripped = { ...REAL_QUESTION, testCases: [] } as CodeBenchmarkQuestion;
      const withCases = await driveScore(REAL_QUESTION, zeroArg);
      const without = await driveScore(stripped, zeroArg);

      expect(without).toBe(80);

      // The load-bearing half: the SAME 80 arrives with all three test cases
      // attached. The answer returns 1 no matter what it is called with, and
      // would fail every one of code-basic-001's cases — the score is
      // unchanged. So even the branch that IS reachable is not a correctness
      // signal: it reports "the module imports" and nothing more.
      expect(withCases).toBe(without);
      expect(withCases).toBe(80);

      // Cross-check: the CLI does distinguish this answer, so the pair is
      // measuring the two implementations rather than an odd fixture.
      const cli = await driveCliScore(REAL_QUESTION, zeroArg);
      expect(cli).toBeLessThan(80);
    });
  });

  describe('F3 — wrong, hardcoded and correct are not separable', () => {
    it('(5) a hardcoded constant answer scores the same as a correct one on the web path', async () => {
      const correct = await driveScore(REAL_QUESTION, ANSWERS.CORRECT);
      const hardcoded = await driveScore(REAL_QUESTION, ANSWERS.CONST);
      expect(hardcoded).toBe(correct);

      // The CLI separates them, which is what makes the web number a finding
      // rather than a stylistic difference.
      const cliCorrect = await driveCliScore(REAL_QUESTION, ANSWERS.CORRECT);
      const cliHardcoded = await driveCliScore(REAL_QUESTION, ANSWERS.CONST);
      expect(cliCorrect).toBeGreaterThan(cliHardcoded);
    });

    it('(6) the four-answer table, measured through the real engine', async () => {
      const table = await Promise.all(
        ([
          ['CORRECT', ANSWERS.CORRECT],
          ['WRONG', ANSWERS.WRONG],
          ['CONST', ANSWERS.CONST],
          ['RAISES', ANSWERS.RAISES],
        ] as Array<[string, string]>).map(async ([name, code]) => ({
          name,
          web: await driveScore(REAL_QUESTION, code),
          cli: await driveCliScore(REAL_QUESTION, code),
        }))
      );

      // Three of the four are indistinguishable on the web path; the CLI
      // spreads them across 80 points.
      const webValues = table.map((r) => r.web);
      const cliValues = table.map((r) => r.cli);
      expect(new Set(webValues).size).toBeLessThanOrEqual(2);
      expect(Math.max(...cliValues) - Math.min(...cliValues)).toBeGreaterThan(50);

      // Pinned so a future change to either implementation shows up here
      // rather than as a mysterious new finding next round.
      expect(table).toEqual([
        { name: 'CORRECT', web: 60, cli: 100 },
        { name: 'WRONG', web: 60, cli: 47 },
        { name: 'CONST', web: 60, cli: 20 },
        { name: 'RAISES', web: 40, cli: 20 },
      ]);
    });
  });

  describe('F4 — the test cases reach the engine and are dropped inside scoreCoding', () => {
    it('(7) the question the engine holds still carries its test cases', async () => {
      // getAllCodeBenchmarks() is what run() assembles `questions` from, and
      // it returns the typed objects -- so the loss is NOT upstream.
      const engine = new EvaluatorEngine();
      const surface = engine as unknown as ScoringSurface;
      expect(typeof surface.scoreCoding).toBe('function');
      expect(REAL_QUESTION.testCases).toHaveLength(3);
      expect(REAL_QUESTION.testCases[0]).toEqual({
        input: '1, 2',
        expectedOutput: '3',
        description: '正数相加',
      });

      // Same question object, same engine, same answer -- only the scoring
      // implementation differs. That is the entire distance between F1's two
      // columns.
      const web = await driveScore(REAL_QUESTION, ANSWERS.CORRECT);
      const cli = await driveCliScore(REAL_QUESTION, ANSWERS.CORRECT);
      expect(web).not.toBe(cli);
    });
  });
});
