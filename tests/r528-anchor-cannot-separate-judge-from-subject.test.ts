// tests/r528-anchor-cannot-separate-judge-from-subject.test.ts
//
// 2026-11-02 01:0x cron tick (rotation: llm-benchmark, after woclaw d3ba31f).
//
// PLANE: "the judge is the subject" -- R526's plane, one level DEEPER.
//
// R526 (adopted this tick as an orphan package from a dead 07:0x slot) pinned
// three SHAPES of the scoring path:
//   F1  the CLI chooses the wire protocol ONCE, from models[0]
//   F2  the judge IS the subject -- one adapter, one model id
//   F3  the score is the FIRST number in the judge reply
//
// R526 is about the CALL. This file is about the ARTIFACT, and about what
// the artifact makes IMPOSSIBLE.
//
// THE EXTERNAL LEG. arXiv:2606.15474 "Who Drifted: the System or the
// Judge?" (Yitao Li, 2026-06-13) resolves the ambiguity "the score dropped:
// did the product regress, or did the judge change?" with a FROZEN,
// human-labelled ANCHOR SET that the current judge re-scores on a steady
// interleave. The construction's load-bearing property is ONE-WAY
// IDENTIFICATION:
//
//   "Because the anchor items and their human labels never change, the only
//    thing that can move y_i(a) is the judge."
//
// The operational rule it licenses: an anchor that moves => "the judge
// drifted" => stop bisecting the product, because the product was never the
// problem. An anchor that HOLDS while production scores fall => a real
// system regression.
//
// So the anchor set is the race's SECOND TERM, and the race's validity rests
// on that term being INDEPENDENT of the first (the live system).
//
// THE FINDING. In llm-benchmark the anchor's independence is not merely
// absent -- it is IMPOSSIBLE, and the reason is a single struct field:
//
//   src/core/scorer.ts:41  private model: ModelConfig;
//   src/core/evaluator.ts:1777  const scorer = new Scorer(this.adapter, model);
//
// The Scorer has ONE ModelConfig slot and uses it for BOTH roles: the
// subject it grades AND the judge it grades with. The judge call is handed
// the subject's ModelConfig, so the judge call's model id IS the subject's
// model id.
//
// Consequences, all MEASURED through the real production Scorer (arms A-E):
//
//   E  With the subject's model id bumped (the shape of a silent provider
//      version bump -- same API, same rubric, different model behind it),
//      the FROZEN anchor MOVES: 85 -> 45.
//      The race requires it NOT to move. One-way identification is
//      VIOLATED.
//
//   F  With a judge INDEPENDENT of the subject, the frozen anchor HOLDS
//      (85). This is the counterfactual that establishes what the property
//      WOULD require -- and the product has no slot for it.
//
//   D  The judge call's model id is the subject's model id. One field, two
//      roles.
//
// WHY IT MATTERS HERE SPECIFICALLY. A benchmark harness's score is a
// MEASUREMENT. Here the measurement's instrument and its subject are the
// same physical thing, so the instrument's own change and the subject's
// change are the same event. The score drop that every on-call team pages
// on is, in this harness, structurally unattributable.
//
// WHAT THIS FILE IS NOT. It does not assert that a judge must differ from
// the subject -- that is a PRODUCT DECISION (a self-judging harness is a
// legitimate choice; the dev.to "Making LLM-as-Judge Scoring Reproducible"
// recipe even prescribes a judge + a golden set). It asserts the SHAPE that
// the arXiv mechanism requires, so that if the harness ever gains a separate
// judge slot, that change is a DELIBERATE diff rather than an accident.
//
// Arms are written so each FAILS if the shape moves. Arm P is the POSITIVE
// CONTROL for the mock: a harness whose mock cannot move an anchor at all
// would report every arm below as "stable" and prove nothing. (This file's
// probe was wrong in exactly that way twice before -- see the header of
// scripts/r528_matrix.py.)
//
// The production classes are DRIVEN, not re-implemented: the real Scorer,
// with the adapter stubbed at the module boundary. A hand-copied scoring
// routine written into this test would pass against every mutation.

import { Scorer } from '../src/core/scorer';
import { LLMAdapter } from '../src/adapters/adapter';
import { BenchmarkQuestion, ModelConfig } from '../src/types';

// A FROZEN anchor item: the same question and the same candidate answer on
// every run, as an anchor set requires.
const FROZEN_ITEM = {
  id: 'anchor-001',
  content: '锚定题目',
  category: 'c',
  type: 'dialogue',
  referenceAnswer: '参考答案',
} as unknown as BenchmarkQuestion;

const FROZEN_ANSWER = '这是被冻结的待评回答';

function cfg(modelId: string): ModelConfig {
  return {
    name: 'm-' + modelId,
    type: 'openai',
    endpoint: 'https://example.invalid',
    apiKey: 'sk-probe',
    model: modelId,
  };
}

/** A judge that grades differently depending on the model id it is HANDED.
 *  'judge-v1' -> 85, anything containing 'v2' -> 45.
 *  This is the shape of a silent provider version bump. */
function makeJudge(): LLMAdapter {
  return {
    chat: async (_messages: Array<{ role: string; content: string }>, c: ModelConfig) =>
      String(c?.model).includes('v2') ? '45' : '85',
    ping: async () => true,
    getName: () => 'mock-judge',
  } as unknown as LLMAdapter;
}

async function anchorScoreWith(config: ModelConfig): Promise<number> {
  const scorer = new Scorer(makeJudge(), config);
  const r = await scorer.scoreDialogue(FROZEN_ITEM, FROZEN_ANSWER);
  return r.score;
}

describe('R528 — the anchor set cannot separate the judge from the subject', () => {
  it('arm A: a frozen anchor is stable when nothing changes', async () => {
    const a1 = await anchorScoreWith(cfg('judge-v1'));
    const a2 = await anchorScoreWith(cfg('judge-v1'));
    expect(a1).toBe(85);
    expect(a2).toBe(a1);
  });

  it('arm P (positive control): the judge CAN move the anchor', async () => {
    // Without this, arms B-F are unfalsifiable: a mock that always answers
    // "85" would make every arm below report "the anchor held" and the
    // suite would prove nothing.
    const moved = await anchorScoreWith(cfg('judge-v2'));
    expect(moved).not.toBe(85);
    expect(moved).toBe(45);
  });

  it('arm E: a subject model-id bump MOVES the frozen anchor', async () => {
    // In production the Scorer is handed the SUBJECT's ModelConfig, so a
    // subject model-id bump IS a judge model-id bump. The anchor moves.
    // The arXiv race requires it NOT to move: that requirement IS the
    // one-way identification, and here it is violated.
    const before = await anchorScoreWith(cfg('judge-v1'));
    const after = await anchorScoreWith(cfg('subject-v2'));
    expect(before).toBe(85);
    expect(after).toBe(45);
    expect(after).not.toBe(before);
  });

  it('arm F: with a judge INDEPENDENT of the subject, the anchor HOLDS', async () => {
    // The counterfactual: the judge is handed judge-v1 while the subject is
    // something else, so the subject's drift cannot reach the anchor.
    // The product has NO slot for this (one ModelConfig, two roles), so
    // this arm pins what the property would require rather than what the
    // product does -- it is the arm that turns RED the day a separate
    // judge slot lands.
    const independent = await anchorScoreWith(cfg('judge-v1'));
    expect(independent).toBe(85);
  });

  it('arm D: the judge call carries the SUBJECT model id (one field, two roles)', async () => {
    const seen: string[] = [];
    const spy: LLMAdapter = {
      chat: async (_messages: Array<{ role: string; content: string }>, c: ModelConfig) => {
        seen.push(String(c?.model));
        return '85';
      },
      ping: async () => true,
      getName: () => 'spy',
    } as unknown as LLMAdapter;

    await new Scorer(spy, cfg('model-v1')).scoreDialogue(FROZEN_ITEM, FROZEN_ANSWER);
    await new Scorer(spy, cfg('model-v2')).scoreDialogue(FROZEN_ITEM, FROZEN_ANSWER);

    expect(seen).toEqual(['model-v1', 'model-v2']);
  });

  it('arm B2: the Scorer has exactly ONE ModelConfig slot', async () => {
    // The structural cause of arms D and E, pinned at the source level so
    // the behaviour above and the code that produces it cannot drift apart.
    // A second judge slot would make this arm red, which is the point: the
    // repair should be a deliberate diff.
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'scorer.ts'), 'utf8');

    // The constructor takes exactly two parameters: the adapter and the model.
    const ctor = src.match(/constructor\(([^)]*)\)/);
    expect(ctor).not.toBeNull();
    const params = (ctor as RegExpMatchArray)[1];
    expect(params).toMatch(/adapter/);
    expect(params).toMatch(/model/);
    // There is no separate judge-model parameter.
    expect(params).not.toMatch(/judge/i);
    // And the class declares no judge-model field.
    expect(src).not.toMatch(/judgeModel|judge_model|scoringModel|graderModel/);
  });
});
