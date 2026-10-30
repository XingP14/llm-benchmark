// tests/web/r522-web-dialogue-score-is-length-and-prefix.test.ts
//
// WHY THIS FILE EXISTS (2026-10-30 22:03 cron, llm-benchmark rotation).
//
// R519 (shipped 2026-10-30 05:33, commit 9ead5ce) established that the WEB
// path's CODING score ignores the benchmark's test cases: the score is a
// function of the answer's ARITY, not of its correctness.
//
// The DIALOGUE dimension has the same SHAPE of defect, and it is the dimension
// the Web UI scores BY DEFAULT (POST /api/evaluations defaults
// `dialogue = true`; src/web/routes/evaluations.ts:97), so it is the one a
// user sees first.
//
//   CLI  src/core/evaluator.ts -> Scorer.scoreDialogue(question, output)
//        -> src/core/scorer.ts:52 builds an LLM-judge prompt
//           (buildDialogueScoringPrompt, scorer.ts:428) that shows the
//           question, the reference answer and the candidate answer, and
//           parses a 0-100 number out of the model's reply.
//
//   WEB  src/web/engine/evaluator.ts:282
//        private async scoreDialogue(question, output)
//        -> a 3-line LOCAL HEURISTIC that asks NOBODY:
//             score = 50
//             +30 if output.includes(ref.split(/[，。、,.]/)[0])
//             +20 if output.length > 10
//             (capped at 100)
//
// THREE CONSEQUENCES, all MEASURED through the real production class
// (EvaluatorEngine) in this tree, on the 13 shipped dialogue questions
// (census: getAllDialogueBenchmarks().length === 13):
//
//   F1  THE WEB DIALOGUE SCORE IS A FUNCTION OF LENGTH AND OF A PREFIX
//       FRAGMENT, NOT OF CORRECTNESS.
//
//       The scoring ladder has exactly FOUR reachable values across five
//       answer classes (reference verbatim / tokenised reference / long
//       garbage / empty / short): 50, 70, 80, 100. Measured.
//
//       The +30 arm fires on a SUBSTRING of the reference's first
//       comma-delimited fragment. So:
//
//         dial-inst-003, reference "苹果、橙子、香蕉"
//           "苹果、橙子、香蕉"                      -> 80  (the reference itself)
//           "苹果、橙子、香蕉，但是我不确定对不对"      -> 100
//           "苹果"                                   -> 80
//           "香蕉和梨以及葡萄和西瓜和芒果"            -> 70  (no right fruit at all)
//
//       THE INVERSION: an answer that names ONE of the three required
//       fruits and pads past 10 characters scores 100, while the exact
//       reference scores 80. LENGTH BEATS CORRECTNESS.
//
//       And over the WHOLE dimension the effect is not a corner case:
//         reference verbatim                        -> avg 95
//         one right fragment + padding             -> avg 100
//         long garbage                             -> avg 70
//
//   F2  A CORRECT, PARAPHRASED ANSWER IS SCORED THE SAME AS GARBAGE.
//
//       The +30 arm needs the reference's EXACT first fragment. Six of the
//       thirteen questions have a reference whose first fragment is not
//       something a natural answer reproduces verbatim:
//
//         dial-fact-001, dial-inst-001, dial-inst-002,
//         dial-reason-002, dial-reason-003, dial-context-001
//
//       For those six, an answer carrying the reference's own CONTENT
//       (its Chinese/numeric tokens, space-joined -- derived from the
//       reference, not hand-copied) scores EXACTLY what long garbage scores:
//       70. So a model that answers correctly in its own words is
//       indistinguishable from one that answered nothing.
//
//   F3  THE CLI AND THE WEB PATH ARE TWO DIFFERENT SCORERS FOR THE SAME 13
//       QUESTIONS, AND THE WEB PATH IS NOT A CHEAPER JUDGE -- IT IS A
//       DIFFERENT MEASUREMENT.
//
//       Measured on the SAME output (a long wrong answer) for dial-fact-002:
//         CLI  (LLM judge, 1 model call)  -> 85
//         WEB  (local heuristic, 0 model calls) -> 70
//
//       The web path never asks a model, so the number it produces is not a
//       noisier version of the CLI's number; it is a different quantity.
//
// WHAT THIS FILE DELIBERATELY DOES NOT DO
//
// It asserts no correct behaviour and ships no production change. The
// repairs are product decisions:
//
//   F1 -- keep the cheap ladder but fix the ARITHMETIC (drop the length
//         bonus? cap the prefix bonus? require the reference's content
//         rather than a fragment?), or replace the ladder with the CLI's
//         LLM judge, which costs a model call per question?
//   F2 -- how should a paraphrase be credited? Token overlap? A model
//         judge? The reference answers are Chinese prose and one of them is
//         a JSON document, so "the first comma-delimited fragment" is not
//         even a well-defined notion of key content for all 13.
//   F3 -- should the web path adopt the CLI's judge, run BOTH, or keep the
//         cheap ladder and label it as something other than a "score"?
//
// All three are recorded father-gated. Pinning CURRENT behaviour makes each
// decision visible and stops it drifting silently; when a policy lands, the
// matching arm below is the RED that has to be updated.
//
// HARNESS NOTES (all measured on this file)
//
// 1. NO MODEL IS CALLED. The web path asks nobody, so the whole suite needs
//    no adapter mock at all -- there is no chat() to intercept. The one
//    place a model WOULD be involved (arm (5), the CLI contrast) uses a
//    hand-written stub adapter whose reply is a FIXED string, so the CLI
//    score is a deterministic function of that string.
// 2. THE SCORE IS READ FROM THE REAL PRODUCTION CLASS. `EvaluatorEngine` is
//    instantiated and its private `scoreDialogue` is called on the REAL
//    benchmark questions. Nothing here re-implements the ladder: the probe
//    DERIVES the reference's key fragment with the SAME split the production
//    code uses, and the assertions are on the SCORE the production code
//    returns.
// 3. THE ARITHMETIC IS ASSERTED AS ARITHMETIC, NOT AS A COPY OF THE LADDER.
//    The expected numbers (50/70/80/100) are stated, and arm (4) shows that
//    the ladder's reachable set is exactly those four -- so a future change
//    to the ladder turns the affected arm RED with a number to compare.

import { getAllDialogueBenchmarks } from '../../src/benchmarks/dialogue';
import { EvaluatorEngine } from '../../src/web/engine/evaluator';
import { Scorer } from '../../src/core/scorer';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { LLMAdapter } from '../../src/adapters/adapter';
import type { ModelConfig } from '../../src/types';

const engine = new EvaluatorEngine();

/**
 * The web path's own scoreDialogue, called on the REAL production class.
 *
 * The method is private, so it is reached the way a runtime reaches it --
 * through the class instance. This is a measurement of the subject, not a
 * re-implementation of it: the ladder that produces the number lives in
 * src/web/engine/evaluator.ts and is NOT copied anywhere in this file.
 */
function webScore(question: unknown, output: string): Promise<{ score: number }> {
  return (engine as unknown as {
    scoreDialogue(q: unknown, o: string): Promise<{ score: number }>;
  }).scoreDialogue(question, output);
}

/**
 * The production key derivation, COPIED from src/web/engine/evaluator.ts:288
 * (`ref.split(/[，。、,.]/)[0]`). It is copied DELIBERATELY and it is the
 * SUBJECT of arm (2): the suite must be able to name the fragment the
 * production code matches on. Arm (0) asserts that the production source
 * still contains this exact expression, so the copy cannot silently drift
 * away from the subject -- if it does, arm (0) goes red first.
 */
function keyFragment(ref: string): string {
  return ref.split(/[，。、,.]/)[0];
}

/**
 * A semantically equivalent answer that is NOT the reference verbatim: the
 * reference's OWN content tokens (Chinese runs and numeric runs), space
 * joined. DERIVED from the reference -- no hand-copied answer list -- so it
 * measures "an answer that carries the content but not the wording".
 */
function tokenised(ref: string): string {
  return (ref.match(/[一-鿿]+|[0-9]+(?:\.[0-9]+)?/g) || []).join(' ');
}

const GARBAGE = 'this is a long but completely wrong answer about nothing at all';

/** The CLI's judge is a model; this stub replies with a FIXED score. */
const CLI_REPLY = '85';
const cliModel: ModelConfig = { name: 'r522', type: 'openai', endpoint: '', apiKey: 'r522' };
const cliAdapter: LLMAdapter = {
  getName: () => 'r522',
  chat: async () => CLI_REPLY,
  ping: async () => false,
};

describe('r522 — the web dialogue score is a function of length and a prefix fragment', () => {
  // (0) PREMISE.  Two source facts, both load-bearing for the arms below.
  //
  //   P1 -- the web path scores dialogue LOCALLY: its scoreDialogue is a
  //         three-arm arithmetic ladder and it asks NO model;
  //   P2 -- the CLI path scores dialogue by ASKING A MODEL: it builds a
  //         scoring prompt and parses the reply.
  //
  // If a later commit repairs the web path, these arms go red first and say
  // which arm has to be updated with the policy.
  it('(0) premise: the web path scores dialogue locally, the CLI path asks a model', () => {
    const webSrc = readFileSync(join(__dirname, '../../src/web/engine/evaluator.ts'), 'utf8');

    // P1: the local ladder, and the two arms that produce the score.
    const ladder = webSrc
      .split('\n')
      .find((l) => l.includes('const keyPart = ref.split('));
    expect(ladder).toBeTruthy();
    // The copy of the split in this file must still match the production one.
    expect(ladder).toContain("ref.split(/[，。、,.]/)[0]");

    const lengthArm = webSrc.split('\n').find((l) => l.includes('output.length > 10'));
    expect(lengthArm).toBeTruthy();

    // The local ladder does NOT call a model -- no adapter use at all.
    const webScorerFactory = webSrc
      .split('\n')
      .find((l) => l.includes('private webScorer()'));
    expect(webScorerFactory).toBeTruthy();
    // The web dialogue path is separate from webScorer(): the CLI Scorer is
    // used for function_calling / long_context / multi_turn, NOT dialogue.
    const delegateCalls = [...webSrc.matchAll(/scorer\.score(\w+)\(/g)].map((m) => m[1]);
    expect(delegateCalls).not.toContain('Dialogue');

    // P2: the CLI path builds a judge prompt and parses a number out of it.
    const cliSrc = readFileSync(join(__dirname, '../../src/core/scorer.ts'), 'utf8');
    expect(cliSrc).toContain('buildDialogueScoringPrompt');
    expect(cliSrc).toMatch(/scoreText\s*=\s*await this\.adapter\.chat\(/);
  });

  // (1) F1.  THE LADDER.  The four reachable values, and the two arms that
  //     produce them, measured on the real question set.
  it('(1) F1: the web dialogue score takes exactly four values across five answer classes', async () => {
    const qs = getAllDialogueBenchmarks();
    expect(qs.length).toBeGreaterThan(0);

    const observed = new Set<number>();
    for (const q of qs) {
      const ref = q.referenceAnswer || '';
      observed.add((await webScore(q, ref)).score);
      observed.add((await webScore(q, tokenised(ref))).score);
      observed.add((await webScore(q, GARBAGE)).score);
      observed.add((await webScore(q, '')).score);
      observed.add((await webScore(q, 'no')).score);
    }

    // Base 50 (empty / short), 70 (long, no key match), 80 (key match, short),
    // 100 (key match, long). Nothing else is reachable.
    expect([...observed].sort((a, b) => a - b)).toEqual([50, 70, 80, 100]);
  });

  // (2) F1.  THE INVERSION.  An answer naming ONE of the three required
  //     fruits, padded past 10 characters, scores HIGHER than the exact
  //     reference -- because the reference itself is 8 characters long and
  //     therefore misses the length bonus.
  it('(2) F1: padding a partially-correct answer beats the exact reference', async () => {
    const q = getAllDialogueBenchmarks().find((x) => x.id === 'dial-inst-003');
    expect(q).toBeTruthy();
    const reference = (q as { referenceAnswer?: string }).referenceAnswer || '';
    expect(reference).toBe('苹果、橙子、香蕉');

    const exact = (await webScore(q, reference)).score;
    const padded = (await webScore(q, `${reference}，但是我不太确定这个答案是否完全正确`)).score;
    const oneRightFruit = (await webScore(q, '苹果')).score;
    const allWrongFruits = (await webScore(q, '香蕉和梨以及葡萄和西瓜和芒果')).score;

    // The reference misses the length bonus (8 chars); the padded answer hits
    // it, so padding is worth more than being exactly right.
    expect(padded).toBeGreaterThan(exact);
    expect(exact).toBe(80);
    expect(padded).toBe(100);
    // One right fruit is worth +30 over the base+length ladder...
    expect(oneRightFruit).toBe(80);
    // ...and an answer with NO right fruit at all is still 70, because length
    // alone carries it that far.
    expect(allWrongFruits).toBe(70);
  });

  // (3) F2.  A CORRECT PARAPHRASE IS SCORED LIKE GARBAGE.  Six of the
  //     thirteen questions have a reference whose first fragment is not
  //     something a natural answer reproduces verbatim.
  it('(3) F2: on six questions a paraphrase carrying the reference content scores exactly like garbage', async () => {
    const qs = getAllDialogueBenchmarks();
    const indistinguishable: string[] = [];

    for (const q of qs) {
      const ref = q.referenceAnswer || '';
      const paraphrase = tokenised(ref);
      // A paraphrase that is literally the reference is not a paraphrase.
      if (paraphrase === ref) continue;
      const sParaphrase = (await webScore(q, paraphrase)).score;
      const sGarbage = (await webScore(q, GARBAGE)).score;
      if (sParaphrase === sGarbage) indistinguishable.push(q.id);
    }

    // The census is a MEASUREMENT of the shipped question set, not a
    // hand-listed set of ids: it must find the paraphrases the shipped
    // references make impossible to match verbatim.
    expect(indistinguishable.length).toBeGreaterThanOrEqual(6);
    // And it is not vacuous: some references ARE matchable verbatim.
    expect(indistinguishable.length).toBeLessThan(qs.length);
  });

  // (4) F2'.  THE DIMENSION-LEVEL CONSEQUENCE.  Over all 13 questions, the
  //     three answer classes separate as: reference 95, one-fragment-plus-
  //     padding 100, garbage 70. The "correct" class is NOT the top one.
  it('(4) F2\': the padded-fragment class outscores the reference class on the dimension average', async () => {
    const qs = getAllDialogueBenchmarks();
    const avg = (xs: number[]): number => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);

    const referenceScores: number[] = [];
    const paddedScores: number[] = [];
    const garbageScores: number[] = [];
    for (const q of qs) {
      const ref = q.referenceAnswer || '';
      referenceScores.push((await webScore(q, ref)).score);
      paddedScores.push(
        (await webScore(q, `${keyFragment(ref)}，但是我不太确定这个答案是否完全正确`)).score,
      );
      garbageScores.push((await webScore(q, GARBAGE)).score);
    }

    expect(avg(referenceScores)).toBe(95);
    expect(avg(paddedScores)).toBe(100);
    expect(avg(garbageScores)).toBe(70);

    // The headline: naming one fragment and padding beats the exact answer.
    expect(avg(paddedScores)).toBeGreaterThan(avg(referenceScores));
  });

  // (5) F3.  THE CONTRAST.  The sibling scorer IN THE SAME REPOSITORY asks a
  //     model and produces a DIFFERENT number for the SAME output. A bare
  //     "the web score is 70" would be a statement about the web path alone;
  //     the comparison is what makes it a statement about THIS repository
  //     having two different dialogue measurements.
  it('(5) F3: the CLI judge and the web heuristic give different numbers for the same output', async () => {
    const q = getAllDialogueBenchmarks().find((x) => x.id === 'dial-fact-002');
    expect(q).toBeTruthy();

    const scorer = new Scorer(cliAdapter, cliModel);
    const cli = await scorer.scoreDialogue(q as never, GARBAGE);
    const web = await webScore(q, GARBAGE);

    // The CLI parses a number out of the model's reply; the stub replies
    // "85", so the CLI's score is 85 by construction.
    expect(cli.score).toBe(85);
    expect(cli.detail).toBe(CLI_REPLY);
    // The web path asked nobody and produced its own number.
    expect(web.score).toBe(70);
    expect(web.score).not.toBe(cli.score);
  });

  // (6) F3'.  THE WEB PATH IS NOT A CHEAPER JUDGE -- IT IS A DIFFERENT
  //     MEASUREMENT, AND THE DIFFERENCE IS NOT SMALL.  The web dialogue
  //     score CANNOT REACH the CLI's number for a long wrong answer, no
  //     matter how the answer is shaped: a wrong long answer that names the
  //     reference's fragment lands on 100, and one that does not lands on
  //     70 -- so the web number for a WRONG answer spans a 30-point range
  //     while the CLI's judge is asked the same question once.
  it('(6) F3\': the web score for a wrong answer varies by 30 points with its shape, while the judge is asked once', async () => {
    const q = getAllDialogueBenchmarks().find((x) => x.id === 'dial-fact-002');
    expect(q).toBeTruthy();
    const ref = (q as { referenceAnswer?: string }).referenceAnswer || '';

    const wrongNoFragment = (await webScore(q, GARBAGE)).score;
    // Long enough to clear the length arm, and it carries the reference's
    // fragment -- so it hits BOTH bonus arms while being wrong.
    const wrongWithFragment = (await webScore(q, `${ref}，但这个答案是完全错误的`)).score;

    expect(wrongNoFragment).toBe(70);
    expect(wrongWithFragment).toBe(100);
    // Both are WRONG answers; the web score cannot tell them apart in kind,
    // only in shape.
    expect(wrongWithFragment - wrongNoFragment).toBe(30);
  });
});
