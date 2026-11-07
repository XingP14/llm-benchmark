/**
 * R535 -- the CODING dimension: an oracle that scores the wrong answer higher
 * than the right one, and a web plane that never runs the tests at all.
 *
 * R519 / R522 / R524 / R526 / R528 / R531 / R532 / R533 audited the other
 * dimensions of this harness. R535 takes the LAST unmeasured one: `coding`.
 *
 * WHAT WAS MEASURED (through the real production classes -- the real
 * `Scorer`, the real `PythonSandbox`, the real benchmark data, the real
 * `Evaluator` aggregation, the real `EvaluatorEngine`; nothing re-implements
 * the scoring or the execution):
 *
 *   F1  THE ORACLE REWARDS A WRONG ANSWER.  `code-string-001` declares
 *       `expectedOutput: '"olleh"'` -- the expected stdout carries the
 *       DOUBLE-QUOTE characters of the Python SOURCE literal, not the data.
 *       The child prints the RESULT, and `print()` of a `str` emits no
 *       quotes.  Measured against the real sandbox:
 *
 *         CORRECT   `return s[::-1]`                  -> stdout `olleh`    0/3
 *         WRONG     `return '"' + s[::-1] + '"'`      -> stdout `"olleh"`  3/3
 *
 *       Through the real `Scorer.scoreCoding` that is score=15 for the
 *       correct implementation and score=95 for the wrong one.  A model
 *       that writes the textbook answer is punished; a model that wraps the
 *       result in quotes is rewarded.
 *
 *       The defect is a `str` vs `dict` ASYMMETRY, and it is exactly scoped:
 *       `code-ds-001` expects `"{'h': 1, 'e': 1, ...}"`, and for a dict
 *       `print(d) == repr(d)`, so that question is accidentally correct.
 *       Only the questions whose expected value is a STRING are broken.
 *
 *   F2  THE WEB PLANE NEVER RUNS THE TEST CASES.  `src/web/engine/
 *       evaluator.ts` `scoreCoding` ignores `testCases` entirely: it awards
 *       80 for any code containing `def ` and `return` that the sandbox
 *       executes without error, 60 when the execution fails, and 20/40 for
 *       missing syntax.  But the web sandbox calls the function with NO
 *       argument (`print("OK")` appended to the source), so every benchmark
 *       function -- which all take a parameter -- raises TypeError and the
 *       score is 60 for EVERY implementation.  Measured: correct 60,
 *       wrong 60, garbage 60.  The only thing that moves the number is
 *       giving the function a DEFAULT argument, which makes the zero-arg
 *       call succeed -> 80.  The web plane measures a function SIGNATURE,
 *       not an answer.
 *
 *   F3  THE DECLARED WEIGHTS ARE NEVER READ.  `BenchmarkQuestion.weight` is
 *       documented as 评分权重, is populated with 1 / 1.5 / 2 / 2.5 across
 *       all five benchmark sets, and is surfaced by GET /api/questions --
 *       but NO aggregation reads it.  `calculateTotalScore` is an unweighted
 *       mean and `buildDimEntry` is an unweighted mean, so a `weight: 2`
 *       algorithms question and a `weight: 1` syntax question contribute
 *       exactly the same to every published total.
 *
 * WHY THIS IS A MIGRATION GAP, NOT GREENFIELD
 *
 * The assertion-based oracle is already published and widely used:
 *   * EvalPlus (evalplus/evalplus, 1838 stars, Apache-2.0, NeurIPS 2023 &
 *     COLM 2024) -- "Rigourous evaluation of LLM-synthesized code"; its
 *     HumanEval+ / MBPP+ ground truths are ASSERTIONS, i.e. the reference
 *     solution is run against executable checks rather than compared to a
 *     hand-typed stdout string.
 *   * HumanEval / MBPP -- the original `assert`-style harnesses.
 *   * LiveCodeBench (LiveCodeBench/LiveCodeBench, 973 stars, MIT) -- keeps
 *     per-test-case results, not one string.
 * So the mechanism is solved in adjacent work; this harness implements the
 * pre-assertion version. Reporting this as greenfield would be wrong.
 *
 * WHAT THIS SUITE DOES AND DOES NOT DO
 *
 * Ships: a test-only suite that PINS the observed (defective) behaviour, so
 * that when a repair is decided, each candidate arm turns RED and the
 * decision stays visible.
 *
 * Does NOT ship: any production change. Each repair is a product decision
 * (per docs/PROJECT-GOVERNANCE.md, "Design Rules": cross-cutting changes
 * that touch scoring algorithms or benchmark dimensions need a design note
 * before code):
 *   - should the coding oracle become assertion-based (canonical), or should
 *     the expected strings be corrected to `str()` semantics?
 *   - should the web plane run the same test cases the CLI plane runs?
 *   - should `weight` actually weight the aggregate, or should the field be
 *     removed from the public API contract?
 *
 * All three are father-gated. This round delivers THE MEASUREMENT ONLY.
 */
import { Scorer } from '../src/core/scorer';
import { PythonSandbox } from '../src/sandbox/python-sandbox';
import { getAllCodeBenchmarks } from '../src/benchmarks/coding';
import { Evaluator } from '../src/core/evaluator';
import { EvaluatorEngine } from '../src/web/engine/evaluator';
import type { LLMAdapter } from '../src/adapters/adapter';
import type { BenchmarkConfig, ModelConfig, QuestionScore } from '../src/types';
import type { CodeBenchmarkQuestion } from '../src/benchmarks/coding';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const MODEL: ModelConfig = {
  name: 'r535-probe',
  type: 'openai',
  endpoint: 'http://localhost:1/v1',
  apiKey: 'probe',
  model: 'r535-probe',
};

function stubAdapter(chat?: LLMAdapter['chat']): LLMAdapter {
  return { chat: chat ?? (async () => '') } as unknown as LLMAdapter;
}

const QUESTIONS = getAllCodeBenchmarks();

function byId(id: string): CodeBenchmarkQuestion {
  const q = QUESTIONS.find((x) => x.id === id);
  if (!q) throw new Error(`no such coding question: ${id}`);
  return q;
}

const baseConfig: BenchmarkConfig = {
  models: [MODEL],
  benchmarks: { dialogue: false, coding: false },
};

const ev = (): any => new Evaluator(baseConfig, stubAdapter()) as any;

const score = (id: string, cat: string, v: number): QuestionScore => ({
  questionId: id, category: cat, score: v, dimension: 'coding', modelOutput: '',
});

/** The textbook implementation of `reverse_string`. */
const CORRECT = 'def reverse_string(s):\n    return s[::-1]\n';

/** A WRONG implementation that happens to satisfy the broken expected output. */
const WRONG_BUT_PASSES = 'def reverse_string(s):\n    return \'"\' + s[::-1] + \'"\'\n';

/** An obviously wrong implementation. */
const WRONG = 'def reverse_string(s):\n    return "nonsense"\n';

// ---------------------------------------------------------------------------

describe('r535 -- the coding dimension', () => {
  describe('F1 -- the oracle rewards a wrong answer and punishes the correct one', () => {
    it('the CORRECT implementation fails its own question\'s test cases', async () => {
      const scorer = new Scorer(stubAdapter(), MODEL);
      const q = byId('code-string-001');
      const out = await scorer.scoreCoding(q, CORRECT, q.testCases);
      // 0 of 3 test cases pass.  The implementation is textbook-correct.
      expect(out.detail).toContain('测试通过: 0/3');
    });

    it('a WRONG implementation passes all three test cases', async () => {
      const scorer = new Scorer(stubAdapter(), MODEL);
      const q = byId('code-string-001');
      const out = await scorer.scoreCoding(q, WRONG_BUT_PASSES, q.testCases);
      expect(out.detail).toContain('测试通过: 3/3');
    });

    it('the correct answer scores LOWER than the wrong answer', async () => {
      const scorer = new Scorer(stubAdapter(), MODEL);
      const q = byId('code-string-001');
      const correct = await scorer.scoreCoding(q, CORRECT, q.testCases);
      const wrong = await scorer.scoreCoding(q, WRONG_BUT_PASSES, q.testCases);
      // The defect's sharpest form: the ordering is INVERTED.
      expect(correct.score).toBeLessThan(wrong.score);
      expect(correct.score).toBe(15);
      expect(wrong.score).toBe(95);
    });

    it('the expected output carries the SOURCE literal\'s quotes, not the data', async () => {
      const q = byId('code-string-001');
      for (const tc of q.testCases) {
        // The INPUT is a Python source literal: `"hello"` (7 bytes, quoted).
        // The EXPECTED was authored by rewriting that source text, so it
        // keeps the quotes: `"olleh"`.
        expect(tc.input.startsWith('"')).toBe(true);
        expect(tc.expectedOutput.startsWith('"')).toBe(true);
        expect(tc.expectedOutput.endsWith('"')).toBe(true);
        // The DATA -- what the function actually receives -- is unquoted.
        const data = tc.input.slice(1, -1);
        expect(tc.expectedOutput).toBe(`"${data.split('').reverse().join('')}"`);
      }
    });

    it('the real sandbox prints the RESULT with no quotes, so the expected never matches', async () => {
      const sandbox = new PythonSandbox(8000);
      const q = byId('code-string-001');
      const tc = (q.testCases)[0];
      const res = await sandbox.execute(CORRECT, tc.input);
      expect(res.success).toBe(true);
      // The child ran fine; the stdout simply lacks the quote characters.
      expect(res.output).toBe('olleh');
      expect(res.output).not.toBe(tc.expectedOutput);
      expect(res.output.length).toBe(tc.expectedOutput.length - 2);
    });

    it('the defect is a str-vs-dict asymmetry: dict questions are accidentally correct', () => {
      // `print(d)` == `repr(d)` for a dict, so a dict-shaped expected output
      // DOES match.  A str-shaped one never does.  Assert the SHAPE of the
      // scope, not a transcribed count of broken questions.
      const broken: string[] = [];
      const accidentallyOk: string[] = [];
      for (const q of QUESTIONS) {
        for (const tc of q.testCases) {
          const e = tc.expectedOutput.trim();
          if (/^\{.*\}$/.test(e)) accidentallyOk.push(q.id);
          else if (/^"[^"]*"$/.test(e)) broken.push(q.id);
        }
      }
      expect(new Set(broken)).toEqual(new Set(['code-string-001']));
      expect(new Set(accidentallyOk)).toEqual(new Set(['code-ds-001']));
    });

    it('every OTHER coding question\'s reference solution passes its own cases', async () => {
      // The control for F1: the defect is NOT "the harness cannot execute
      // code".  Ten of eleven questions are self-consistent, measured against
      // the real sandbox with hand-written reference implementations.
      const REFERENCE: Record<string, string> = {
        'code-basic-001': 'def add(a, b):\n    return a + b\n',
        'code-basic-002': 'def is_even(n):\n    return n % 2 == 0\n',
        'code-string-002': 'def count_vowels(s):\n    return sum(1 for c in s.lower() if c in "aeiou")\n',
        'code-array-001': 'def find_max(arr):\n    return max(arr)\n',
        'code-array-002': 'def has_duplicate(arr):\n    return len(arr) != len(set(arr))\n',
        'code-algo-001': 'def is_prime(n):\n    if n < 2:\n        return False\n    i = 2\n    while i * i <= n:\n        if n % i == 0:\n            return False\n        i += 1\n    return True\n',
        'code-algo-002': 'def fibonacci(n):\n    a, b = 0, 1\n    for _ in range(n):\n        a, b = b, a + b\n    return a\n',
        'code-algo-003': 'def sort_array(arr):\n    return sorted(arr)\n',
        'code-ds-001': 'def char_count(s):\n    d = {}\n    for c in s:\n        d[c] = d.get(c, 0) + 1\n    return d\n',
        'code-ds-002': 'def merge_sorted(arr1, arr2):\n    return sorted(list(arr1) + list(arr2))\n',
      };
      const sandbox = new PythonSandbox(8000);
      for (const [id, code] of Object.entries(REFERENCE)) {
        const q = byId(id);
        let passed = 0;
        for (const tc of q.testCases) {
          const res = await sandbox.execute(code, tc.input);
          if (res.success && (res.output || '').trim() === tc.expectedOutput.trim()) passed += 1;
        }
        expect({ id, passed, of: q.testCases.length }).toEqual({ id, passed: q.testCases.length, of: q.testCases.length });
      }
    });
  });

  describe('F2 -- the web scoring plane never runs the test cases', () => {
    it('the web plane gives a CORRECT answer and a WRONG answer the same score', async () => {
      const engine = new EvaluatorEngine() as any;
      const q = byId('code-string-001');
      const correct = await engine.scoreCoding(q, CORRECT);
      const wrong = await engine.scoreCoding(q, WRONG);
      expect(correct.score).toBe(wrong.score);
      expect(correct.score).toBe(60);
    });

    it('the web plane never reads `testCases` -- the field is not even in scope', () => {
      // The signature is `scoreCoding(_question, output)` -- the question's
      // test cases are never consulted.  Assert the SHAPE of the API.
      const engine = new EvaluatorEngine() as any;
      const fn = engine.scoreCoding.bind(engine);
      expect(fn.length).toBe(2);
    });

    it('the only thing that moves the web score is a DEFAULT ARGUMENT, not correctness', async () => {
      const engine = new EvaluatorEngine() as any;
      const q = byId('code-string-001');
      // The web sandbox calls the function with NO argument, so a function
      // that REQUIRES one raises TypeError -> the execution "fails" -> 60.
      const required = await engine.scoreCoding(q, 'def reverse_string(s):\n    return s[::-1]\n');
      // A function with a DEFAULT argument can be called with no argument,
      // so the execution succeeds -> 80 -- regardless of whether it is right.
      const withDefault = await engine.scoreCoding(q, 'def reverse_string(s="x"):\n    return "nonsense"\n');
      expect(required.score).toBe(60);
      expect(withDefault.score).toBe(80);
      // The wrong answer with a default argument outscores the correct one
      // without one: the plane measures a signature, not an answer.
      expect(withDefault.score).toBeGreaterThan(required.score);
    });

    it('the CLI plane and the web plane disagree on the same code', async () => {
      const scorer = new Scorer(stubAdapter(), MODEL);
      const engine = new EvaluatorEngine() as any;
      const q = byId('code-string-001');
      const cli = await scorer.scoreCoding(q, CORRECT, q.testCases);
      const web = await engine.scoreCoding(q, CORRECT);
      // The CLI plane runs the test cases and finds 0/3; the web plane does
      // not run them at all.
      expect(cli.detail).toContain('测试通过: 0/3');
      expect(web.score).toBe(60);
    });
  });

  describe('F3 -- the declared weights are never read by any aggregation', () => {
    it('the benchmark data really does declare distinct weights', () => {
      const weights = new Set(QUESTIONS.map((q) => q.weight));
      expect(weights.size).toBeGreaterThan(1);
      // The README's published table for the coding dimension.
      expect(QUESTIONS.find((q) => q.category === 'algorithms')!.weight).toBe(2);
      expect(QUESTIONS.find((q) => q.category === 'syntax')!.weight).toBe(1);
    });

    it('calculateTotalScore is an UNWEIGHTED mean -- a weight-2 and a weight-1 question count the same', () => {
      // REAL benchmark ids with REAL declared weights: code-algo-001 (weight
      // 2, algorithms) and code-basic-001 (weight 1, syntax).
      const total = ev().calculateTotalScore([
        score('code-algo-001', 'algorithms', 100),
        score('code-basic-001', 'syntax', 0),
      ]);
      // (100 + 0) / 2 = 50.  A weighted mean would be (100*2 + 0*1) / 3 = 67.
      expect(total).toBe(50);
    });

    it('the dimension average is ALSO unweighted', () => {
      const dims = ev().calculateDimensions([
        score('code-algo-001', 'algorithms', 100),
        score('code-basic-001', 'syntax', 0),
      ]);
      expect(dims.coding.average).toBe(50);
    });

    it('the two real questions really do carry the two real weights', () => {
      expect(byId('code-algo-001').weight).toBe(2);
      expect(byId('code-basic-001').weight).toBe(1);
    });

    it('no aggregation in the source reads `.weight`', () => {
      // The only reader of `.weight` in src/ is the API route that re-emits
      // it to clients.  Pin the SHAPE: the aggregation reads scores, not
      // weights.  (Asserting on a source string is a proxy; the behavioural
      // assertions above are the primary evidence.)
      const fs = require('fs');
      const path = require('path');
      const src = fs.readFileSync(
        path.join(__dirname, '../src/core/evaluator.ts'), 'utf8',
      ) as string;
      const totalBody = src.split('private calculateTotalScore')[1]?.split('private')[0] ?? '';
      const dimBody = src.split('private buildDimEntry')[1]?.split('private')[0] ?? '';
      expect(totalBody).not.toContain('weight');
      expect(dimBody).not.toContain('weight');
    });
  });
});
