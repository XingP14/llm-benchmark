/**
 * R539 -- the FAILURE-CHANNEL plane: a harness failure is indistinguishable
 * from a wrong answer in every published artifact.
 *
 * R519 / R522 / R524 / R526 / R528 / R531 / R532 / R533 / R535 / R537 audited
 * the per-dimension SCORERS and the EXTERNAL-BENCHMARK channel.  R539 steps
 * down one more level and asks about the channel that every one of them shares:
 * what happens to a sample that could not be evaluated AT ALL?
 *
 * WHAT WAS MEASURED (through the real production classes -- the real
 * `Evaluator`, the real `Scorer`, the real `Reporter`; nothing re-implements
 * the scoring, the aggregation, or the report rendering):
 *
 *   F1  A HARNESS FAILURE IS PUBLISHED AS A ZERO SCORE.
 *       `Scorer.scoreDialogue` catches a judge/API failure and returns
 *       `score: 0`; `Evaluator.evaluateModel` catches a subject failure and
 *       pushes `score: 0`.  There is no third state: a sample either has a
 *       score or has a zero that means "the harness could not evaluate it".
 *
 *       MEASURED (real `Evaluator`, real `Reporter`, a fake adapter whose
 *       judge throws):
 *
 *         broken judge   -> 13 scores, all 0, totalScore 0
 *         broken subject -> 13 scores, all 0, totalScore 0
 *         model that answered every question wrong -> 13 scores, all 0,
 *                                                        totalScore 0
 *
 *   F2  THE PUBLISHED ARTIFACTS ARE BYTE-IDENTICAL.  The Markdown ranking
 *       table, the HTML report and the CSV row are the SAME for a broken
 *       harness and for a model that genuinely scored zero -- after
 *       normalising the model NAME away, the three artifacts compare EQUAL.
 *       The only place the failure is visible is the `detail` field of the raw
 *       `QuestionScore`, and that field is rendered by NEITHER the Markdown,
 *       the HTML, nor the CSV.  Measured:
 *
 *         Markdown carries 评分错误 ? false
 *         HTML     carries 评分错误 ? false
 *         CSV      carries 评分错误 ? false
 *         JSON     carries 评分错误 ? true   (the raw scores[] array)
 *
 *   F3  A HARNESS FAILURE RANKS BELOW A GENUINE WRONG ANSWER.
 *       This is the sharpest form, and it is a DIFFERENT bug from F1/F2: it is
 *       not that the failure is invisible, it is that the failure is visible
 *       as a LOSS.  In the `coding` dimension the genuine-wrong floor is
 *       20 ("代码存在语法错误") -- a verdict the harness actually reached
 *       and actually computed.  A sample that could not be evaluated at all
 *       gets 0.  Measured, real scorer, real sandbox, coding dimension only:
 *
 *         genuine wrong answer (garbage code)  -> 20 per question, total 20
 *         subject unreachable (ECONNREFUSED)   ->  0 per question, total  0
 *
 *       So the ranking says the unreachable model is WORSE than the model
 *       that produced garbage -- even though the garbage model produced
 *       output the harness could evaluate and the unreachable one produced
 *       no output at all.
 *
 *       (NOTE, measured the hard way: an earlier draft of this arm compared
 *       a VALID-CODE answer scoring 15 against garbage scoring 20 and called
 *       that a harness failure.  It is not -- both are ordinary SCORED
 *       verdicts, and the 15-vs-20 inversion is R535's already-documented
 *       str/dict oracle asymmetry.  The `coding` scorer does not call the
 *       judge at all, so the only way a coding sample FAILS is the subject
 *       being unreachable.  R539-5: do not borrow a number from a neighbouring
 *       round's finding and re-label it as this round's.)
 *
 *   F4  THE QUESTION COUNT COUNTS THE FAILED SAMPLES.
 *       `Reporter.generateJSON` publishes `stats.totalQuestions =
 *       results[0].scores.length` and the Markdown prints the same number as
 *       总评测题数.  A run where every judgement failed still claims 13
 *       questions were asked.  The count of ATTEMPTED questions and the
 *       count of EVALUATED questions are the same number, and only one of
 *       them is what the number means.
 *
 * WHY THIS IS A MIGRATION GAP, NOT GREENFIELD
 *
 * The mechanism -- "a sample that could not be evaluated must not be
 * silently averaged in as a zero" -- is not novel.  Every mature harness
 * separates it:
 *   * lm-evaluation-harness (EleutherAI/lm-evaluation-harness) -- an
 *     exception in a sample is recorded as a failed request in the results
 *     table and the aggregate is computed over the samples that were
 *     actually scored; `samples` and `results` are separate lists.
 *   * OpenAI Evals (openai/evals) -- a `Run` keeps `results` separate from
 *     `metadata`, and an eval that raised is not a `Result` with score 0.
 *   * HELM (stanford-crfm/helm) -- a `Scenario` that errors is an
 *     `Error`/`Exception` record, not a `Metric` of value zero; the
 *     leaderboard aggregates `Metric`s.
 *   * SWE-bench (SWE-bench/SWE-bench) -- an instance that fails to
 *     evaluate is reported as `ERROR` in the report JSON, and the resolved
 *     rate is computed over instances with a real result.
 * So the mechanism is solved in adjacent work; this harness implements the
 * pre-abstraction version, where "no result" and "result of zero" are the
 * same value.  Reporting this as greenfield would be wrong.
 *
 * WHAT THIS SUITE DOES AND DOES NOT DO
 *
 * Ships: a test-only suite that PINS the observed (defective) behaviour, so
 * that when a repair is decided, each candidate arm turns RED and the
 * decision stays visible.
 *
 * Does NOT ship: any production change.  Each repair is a product decision:
 *   - should a failed sample be EXCLUDED from the aggregate (and the
 *     denominator shrink with it), or should it be reported as a separate
 *     `errors` count alongside the score?
 *   - should the report CARRY the failure (a per-dimension error count, a
 *     distinct "incomplete" marker on the ranking row), or should the run be
 *     declared FAILED outright?
 *   - should the `coding` dimension's genuine-wrong floor be raised so a
 *     harness failure cannot rank below a real wrong answer?
 * All three are father-gated.  This round delivers THE MEASUREMENT ONLY.
 *
 * METHOD NOTES
 *
 * - **R539-1 pin the RELATION, not a count.**  The headline is "the
 *   published artifacts of a broken harness and of a genuine zero are
 *   EQUAL", not "the score is 0".  A count assertion ("totalScore === 0")
 *   would also be true of a correct implementation that reports an error
 *   count of 13 -- the relation is what distinguishes the two.
 * - **R539-2 normalise the model NAME before comparing artifacts.**  The two
 *   runs necessarily have different model names; comparing raw Markdown
 *   would be trivially false and prove nothing.
 * - **R539-3 the failure detail lives in `detail`, and the reporters do not
 *   render it.**  Asserting on the presence of the string `评分错误` in the
 *   JSON but not in Markdown/HTML/CSV is the F2 evidence.  Scoped to the
 *   reporter output only -- the string also appears in the raw scores[].
 * - **R539-4 the CONTROL is a model that genuinely scores zero.**  Without
 *   it, "the broken harness scores 0" could be satisfied by a harness that
 *   never produces a non-zero score.  The control proves the scorer can
 *   produce 85 and that the zero is reachable by a real wrong answer.
 */
import { Evaluator } from '../src/core/evaluator';
import { Reporter } from '../src/core/reporter';
import type { LLMAdapter } from '../src/adapters/adapter';
import type { BenchmarkConfig, ModelConfig } from '../src/types';

const mkModel = (name: string): ModelConfig => ({
  name,
  type: 'openai',
  endpoint: 'http://localhost:1/v1',
  apiKey: 'test-key',
  model: name,
});

function configWith(
  models: ModelConfig[],
  dims: Partial<BenchmarkConfig['benchmarks']> = {},
): BenchmarkConfig {
  return {
    models,
    benchmarks: {
      dialogue: true,
      coding: false,
      function_calling: false,
      long_context: false,
      multi_turn: false,
      ...dims,
    },
  } as unknown as BenchmarkConfig;
}

/**
 * The judge (the LLM-as-scorer) is DOWN.  The SUBJECT works and answers.
 * Nothing about the subject's answers is wrong -- the harness could not
 * evaluate them.
 */
function brokenJudgeAdapter(): LLMAdapter {
  return {
    chat: async (messages: Array<{ role: string; content: string }>) => {
      const content = String(messages?.[0]?.content ?? '');
      if (content.includes('评分员')) throw new Error('JUDGE DOWN');
      return 'ANSWER';
    },
    ping: async () => true,
    getName: () => 'r539-broken-judge',
  } as unknown as LLMAdapter;
}

/** The SUBJECT (the model under test) is unreachable. */
function unreachableSubjectAdapter(): LLMAdapter {
  return {
    chat: async () => {
      throw new Error('ECONNREFUSED 127.0.0.1:9999');
    },
    ping: async () => true,
    getName: () => 'r539-unreachable-subject',
  } as unknown as LLMAdapter;
}

/** The judge works.  The model answered every question wrong. */
function genuineZeroAdapter(): LLMAdapter {
  return {
    chat: async (messages: Array<{ role: string; content: string }>) => {
      const content = String(messages?.[0]?.content ?? '');
      return content.includes('评分员') ? '0' : 'WRONG ANSWER';
    },
    ping: async () => true,
    getName: () => 'r539-genuine-zero',
  } as unknown as LLMAdapter;
}

/** The judge works and gives a real, high score.  The CONTROL for F4. */
function workingJudgeAdapter(): LLMAdapter {
  return {
    chat: async (messages: Array<{ role: string; content: string }>) => {
      const content = String(messages?.[0]?.content ?? '');
      return content.includes('评分员') ? '85' : 'ANSWER';
    },
    ping: async () => true,
    getName: () => 'r539-working-judge',
  } as unknown as LLMAdapter;
}

/**
 * Replace the model name so two runs' artifacts can be compared byte-wise.
 *
 * The artifacts also carry TWO wall-clock values that differ between any two
 * runs: the report timestamp (`评测时间` / `generatedAt`) and the run
 * duration (`duration_s` / `评测耗时`).  Those are NOT part of the finding --
 * they are clock noise -- so they must be normalised away BEFORE the
 * comparison, or the equality arm is a coin flip.  This is R539-6: an arm
 * that compares two artifacts must normalise every field that is not the
 * subject, or it measures the clock.
 */
const normaliseName = (s: string, name: string): string => s.split(name).join('MODEL');

/** Strip the wall-clock fields: the report timestamp and the duration. */
function normaliseClock(s: string): string {
  return s
    // Markdown / HTML header timestamp: `**评测时间**: 2026/11/11 02:45:21`
    .replace(/\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}/g, 'TIMESTAMP')
    // Markdown / HTML duration: `12.3s` (one decimal) and `1.23s` (two)
    .replace(/\b\d+\.\d+s\b/g, 'DURATION')
    // CSV duration column: `0.02` (two decimals, bare)
    .replace(/,(\d+\.\d+),(\d+)$/gm, ',DURATION,$2');
}

describe('R539 -- the failure-channel plane', () => {
  describe('F1 -- a harness failure is published as a zero score', () => {
    it('arm A: a broken JUDGE yields a zero for every sample', async () => {
      const ev = new Evaluator(configWith([mkModel('broken')]), brokenJudgeAdapter());
      const r = (await ev.run())[0];

      expect(r.scores.length).toBeGreaterThan(0);
      for (const s of r.scores) expect(s.score).toBe(0);
      expect(r.totalScore).toBe(0);
    });

    it('arm A2: an unreachable SUBJECT yields a zero for every sample', async () => {
      const ev = new Evaluator(configWith([mkModel('unreach')]), unreachableSubjectAdapter());
      const r = (await ev.run())[0];

      expect(r.scores.length).toBeGreaterThan(0);
      for (const s of r.scores) expect(s.score).toBe(0);
      expect(r.totalScore).toBe(0);
    });

    it('arm B (CONTROL): a working judge produces a non-zero score -- the zero is not the scorer default', async () => {
      const ev = new Evaluator(configWith([mkModel('working')]), workingJudgeAdapter());
      const r = (await ev.run())[0];

      expect(r.totalScore).toBe(85);
      expect(r.dimensions.dialogue.average).toBe(85);
      // So a score of 0 is reachable by a REAL wrong answer too -- which is
      // exactly what makes F2 sharp.
      const genuine = (await new Evaluator(configWith([mkModel('genuine')]), genuineZeroAdapter()).run())[0];
      expect(genuine.totalScore).toBe(0);
    });
  });

  describe('F2 -- the published artifacts of a broken harness and of a genuine zero are EQUAL', () => {
    it('arm C: the published dimensions are byte-identical', async () => {
      const broken = (await new Evaluator(configWith([mkModel('A-broken')]), brokenJudgeAdapter()).run())[0];
      const genuine = (await new Evaluator(configWith([mkModel('B-genuine')]), genuineZeroAdapter()).run())[0];

      expect(JSON.stringify(broken.dimensions)).toBe(JSON.stringify(genuine.dimensions));
      expect(broken.totalScore).toBe(genuine.totalScore);
    });

    it('arm C2: the Markdown, HTML and CSV artifacts are byte-identical after the model NAME and the CLOCK are normalised', async () => {
      const broken = (await new Evaluator(configWith([mkModel('A-broken')]), brokenJudgeAdapter()).run())[0];
      const genuine = (await new Evaluator(configWith([mkModel('B-genuine')]), genuineZeroAdapter()).run())[0];

      const norm = (s: string, name: string): string => normaliseClock(normaliseName(s, name));

      expect(norm(Reporter.generateMarkdown([broken]), 'A-broken')).toBe(
        norm(Reporter.generateMarkdown([genuine]), 'B-genuine'),
      );
      expect(norm(Reporter.generateHTML([broken]), 'A-broken')).toBe(
        norm(Reporter.generateHTML([genuine]), 'B-genuine'),
      );
      expect(norm(Reporter.generateCSV([broken]), 'A-broken')).toBe(
        norm(Reporter.generateCSV([genuine]), 'B-genuine'),
      );
    });

    it('arm D: the failure IS visible in the raw JSON, and in NEITHER of the three human-facing artifacts', async () => {
      const broken = (await new Evaluator(configWith([mkModel('broken')]), brokenJudgeAdapter()).run())[0];

      // The raw score carries the failure...
      expect(broken.scores[0].detail).toContain('评分错误');

      // ...and the JSON report carries it, because the JSON report IS the
      // raw scores[] array.
      expect(JSON.stringify(Reporter.generateJSON([broken]))).toContain('评分错误');

      // ...but none of the three artifacts a human reads does.
      expect(Reporter.generateMarkdown([broken])).not.toContain('评分错误');
      expect(Reporter.generateHTML([broken])).not.toContain('评分错误');
      expect(Reporter.generateCSV([broken])).not.toContain('评分错误');
    });
  });

  describe('F3 -- a harness failure ranks BELOW a genuine wrong answer', () => {
    it('arm E: the coding dimension gives a genuine wrong answer 20 and an unevaluable sample 0', async () => {
      // The genuine wrong answer: garbage that is not even valid Python.
      // This is a verdict the harness REACHED and COMPUTED.
      const garbage: LLMAdapter = {
        chat: async () => 'this is not code at all !!!',
        ping: async () => true,
        getName: () => 'r539-garbage',
      } as unknown as LLMAdapter;

      // The subject is unreachable: there is NO output to evaluate.  The
      // `coding` scorer never calls the judge, so this is the only way a
      // coding sample can fail.
      const unreachable: LLMAdapter = {
        chat: async () => {
          throw new Error('ECONNREFUSED 127.0.0.1:9999');
        },
        ping: async () => true,
        getName: () => 'r539-unreachable',
      } as unknown as LLMAdapter;

      const codingOnly = configWith([mkModel('m')], { dialogue: false, coding: true });
      const genuine = (await new Evaluator(codingOnly, garbage).run())[0];
      const broken = (await new Evaluator(codingOnly, unreachable).run())[0];

      // The genuine wrong answer gets the coding floor.
      expect(genuine.dimensions.coding.average).toBe(20);
      expect(genuine.dimensions.coding.count).toBeGreaterThan(0);

      // The unevaluable sample gets zero.
      expect(broken.dimensions.coding.average).toBe(0);
      // ...and the sample COUNT is the same, so the zero is not "no samples".
      expect(broken.dimensions.coding.count).toBe(genuine.dimensions.coding.count);

      // The sharp form: the broken run is ranked BELOW the genuine wrong
      // answer, even though the broken run produced no output to evaluate
      // and the genuine one produced output the harness could score.
      expect(broken.totalScore).toBeLessThan(genuine.totalScore);
    });
  });

  describe('F4 -- the published question count counts the failed samples', () => {
    it('arm F: a run where every judgement failed still claims to have asked every question', async () => {
      const broken = (await new Evaluator(configWith([mkModel('broken')]), brokenJudgeAdapter()).run())[0];
      const working = (await new Evaluator(configWith([mkModel('working')]), workingJudgeAdapter()).run())[0];

      // Same count -- the failures are indistinguishable from the answers
      // in the published count.
      expect(Reporter.generateJSON([broken]).stats.totalQuestions).toBe(
        Reporter.generateJSON([working]).stats.totalQuestions,
      );
      expect(Reporter.generateJSON([broken]).stats.totalQuestions).toBe(broken.scores.length);
      expect(Reporter.generateMarkdown([broken])).toContain(
        `**总评测题数**: ${broken.scores.length}`,
      );
    });
  });

  describe('F5 -- the two failure kinds are ALSO indistinguishable from each other', () => {
    it('arm G: a broken JUDGE and an unreachable SUBJECT publish the same numbers', async () => {
      const judgeDown = (await new Evaluator(configWith([mkModel('A-judge')]), brokenJudgeAdapter()).run())[0];
      const subjectDown = (await new Evaluator(configWith([mkModel('B-subject')]), unreachableSubjectAdapter()).run())[0];

      expect(judgeDown.totalScore).toBe(subjectDown.totalScore);
      expect(JSON.stringify(judgeDown.dimensions)).toBe(JSON.stringify(subjectDown.dimensions));
      // ...but their `detail` strings differ, so the raw array still tells
      // them apart -- which is exactly why the JSON is the only artifact
      // where the failure is visible at all.
      expect(judgeDown.scores[0].detail).not.toBe(subjectDown.scores[0].detail);
    });
  });
});
