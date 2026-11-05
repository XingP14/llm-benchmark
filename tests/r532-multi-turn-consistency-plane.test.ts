// tests/r532-multi-turn-consistency-plane.test.ts
//
// 2026-11-06 01:0x CST cron tick (rotation: llm-benchmark, after R531).
//
// PLANE: "the multi-turn consistency dimension scores a bag of words, and
// penalises the correct answer for being correct".
//
// WHAT PRIOR ROUNDS ALREADY PINNED. R519 proved the web CODING score never
// reads the benchmark's testCases; R522 proved the web DIALOGUE score is a
// function of length and of a prefix fragment; R524 proved the web path drops
// question.systemPrompt; R531 proved the FUNCTION-CALLING tool DECLARATION
// never reaches the model on EITHER path. R531's own commit body enumerates
// the dimensions audited so far; TWO remained unmeasured: long_context and
// multi_turn. This file is about multi_turn -- the only dimension whose
// subject is a CONVERSATION, and whose scorer is a FORBIDDEN-PHRASE LIST.
//
// THE SCORER (src/core/scorer.ts scoreMultiTurn). It takes ONE string -- the
// model's reply -- and the question, and it computes:
//
//   required:   fraction of consistencyCheck.required that occur in the reply
//   forbidden:  every consistencyCheck.forbidden that occurs in the reply
//   score:      round(required_matched/required_total*100) - 20*forbidden_hits
//
// with all matching done by `outputLower.includes(fact.toLowerCase())`.
//
// THE FINDINGS (all measured through the real production classes -- the real
// Scorer, the real CLI Evaluator, the real web EvaluatorEngine; adapters
// stubbed at the module boundary, nothing re-implements prompt assembly or
// scoring):
//
//   F1  THE SCORE IS A BAG-OF-WORDS TEST, NOT A CONSISTENCY TEST. For
//       mt-context-001 the reply `豆豆 3 岁 逗猫棒 挑食` -- a bare keyword
//       dump with no sentence in it -- scores 100. The same question's
//       CORRECT PROSE ANSWER (`你家猫叫豆豆，今年3岁，喜欢玩逗猫棒，最近挑食，
//       医生建议换粮。`) scores 75. The dump beats the answer.
//
//   F2  THE FORBIDDEN LIST IS NOT A VIOLATION SIGNAL; IT IS A SUMMARY OF
//       THE CONVERSATION. All THREE of mt-logic-003's forbidden phrases
//       ('785','1000','500') appear in the question's OWN user turns, and two
//       of them appear in the HARNESS'S OWN scripted assistant turns. So a
//       model that correctly recites the conversation it was handed is
//       penalised for it.
//
//   F3  AND THE PENALTY IS NOT COSMETIC. The same correct answer, two ways of
//       writing it: the terse form scores 100; the form that explains the
//       arithmetic (`原本 1000 元，... 朋友还了 500 元借款，...`) scores 60,
//       with `forbidden hit: 2 [1000, 500]`. The metric penalises ENGAGEMENT.
//
//   F4  THE HARNESS'S OWN SCRIPTED ASSISTANT TURN SCORES 27. mt-logic-003's
//       own turn-by-turn perfect answer misses '435' (the total expenditure,
//       which it never states) and trips two forbidden phrases it was GIVEN.
//
//   F5  UNBOUNDED SUBSTRING MATCHING. mt-logic-003's required facts are
//       '435','220','1065'. A reply saying 1220 for the dinner, 4350 for the
//       total, or 10650 for the balance -- all WRONG -- scores 100, because
//       '220' is inside '1220', '435' inside '4350', '1065' inside '10650'.
//
//   F6  WHITESPACE IS PART OF THE CONTRACT. mt-context-001 requires '3 岁'
//       (with a space). '3岁' (no space) scores 75. '13 岁' (with a space)
//       scores 100 -- '3 岁' is inside '13 岁'.
//
//   F7  NEGATION IS INVISIBLE. '鹌鹑蛋不要汉堡，用水煮' -- a model DECLINING
//       to make a burger -- scores 80, penalised for the word '汉堡'. And
//       '豆豆不是 3 岁，...' -- a model saying the cat is NOT 3 -- is credited
//       with having said it.
//
//   F8  THE SCORER READS NO CONVERSATION. scoreMultiTurn(question, output)
//       never sees the `turns` array, never sees which turn is the question
//       turn, never sees the assistant's earlier turns. The dimension named
//       "multi-turn" is scored by a function that CANNOT observe multi-turn
//       behaviour: there is no turn index and no per-turn check.
//
//   F9  THE SCORE IS NOT COMPARABLE ACROSS ITS OWN QUESTIONS. One forbidden
//       hit costs a flat 20 points regardless of how many required facts the
//       question has, so the dimension's UNITS differ per question.
//
// THE CANONICAL (this plane is a MIGRATION GAP, not greenfield -- the
// mechanism already exists and is published):
//
//   * statebench "The Correct Answer Violates"
//     (https://parslee-ai.github.io/statebench/paper-measurement-validity.pdf)
//     audits the forbidden-phrase scoring family and finds six defects; three
//     land here: (1) "Unbounded substring matching" with the table
//     '"100" -> "1000","2100"' and the fix "boundary-aware matching, with the
//     boundary applied per edge according to whether that edge is a word
//     character"; (2) forbidden phrases that cannot discriminate, including
//     "The vocabulary of the correct answer" -- "a correct answer that merely
//     uses the question's own topic vocabulary is flagged 66.7% of the time";
//     (3) "Blindness to negation" -- "A phrase under explicit negation is
//     usually evidence of the capability under test, not a violation of it".
//     Its decisive experiment is the constructive-correct-answer test: build
//     the response a correct system would give and score it -- "Under the
//     original scoring, 100% of these correct responses are flagged as
//     violations... Under corrected scoring, 0%." And it separates verbosity
//     from the defect: "Generic filler text of 319 words trips the original
//     scorer only 0.3% of the time. The bias is not correlated with length but
//     with engagement."
//
//   * NeurIPS 2025 D&B "Establishing Best Practices for Building Rigorous
//     Agentic Benchmarks" (arXiv:2507.02825) enumerates the outcome-validity
//     checks for substring matching: O.b.1 handles negation modifiers; O.b.2 is
//     robust against systematically listing all possible answers; O.b.3 ground
//     truth is sufficiently complex to prevent guessing.
//
//   * tau-bench (arXiv:2406.12045) is the canonical MULTI-TURN design: it
//     grades the FINAL WORLD STATE, not the conversation -- "There is no single
//     'correct' conversation. Two competent agents can reach the same correct
//     result via wildly different dialogues. Grading the words would punish
//     valid variation and reward verbose box-ticking."
//
// WHAT THIS FILE IS NOT. It does not assert correct behaviour and it ships NO
// production change. Each repair is a product decision (per
// docs/PROJECT-GOVERNANCE.md "Design Rules": cross-cutting changes that touch
// scoring algorithms or benchmark dimensions need a design note before code):
//   F5 -- should the required facts be matched with BOUNDARY awareness?
//   F7 -- should a NEGATED forbidden phrase count as a violation?
//   F2 -- should the forbidden list be PRUNED of the conversation's own
//         vocabulary?
//   F8 -- should the dimension be a TRAJECTORY score (tau-bench style) rather
//         than a bag-of-words score?
// Each of those is father-gated. This file PINS THE OBSERVED (defective)
// behaviour so that when a repair is decided, each candidate arm turns RED
// and the decision stays visible.
//
// HARNESS NOTES (measured on this file)
//
// 1. THE PRODUCTION CLASSES ARE DRIVEN, NOT RE-IMPLEMENTED. The real
//    `Scorer.scoreMultiTurn`, the real CLI `Evaluator.run()` and the real web
//    `EvaluatorEngine.run()`, with the adapters stubbed at the module
//    boundary. A hand-copied scoring function written into the test would pass
//    against every mutation below.
//
// 2. THE ASSERTIONS ARE ON OBSERVED STATE. Every arm inspects the score the
//    real scorer returned or the messages the real evaluator sent -- never
//    "no throw". A suite that only asserted "no throw" would pass against a
//    broken guard.
//
// 3. THE MOCK CAN MOVE THE SCORE. F1's arms are written so that the SAME
//    scorer, given a different reply, produces a different score. A scorer
//    that could not move the score would report every arm below as "stable"
//    and prove nothing.

import { Evaluator } from '../src/core/evaluator';
import { Scorer } from '../src/core/scorer';
import { EvaluatorEngine } from '../src/web/engine/evaluator';
import { taskManager } from '../src/web/engine/task';
import { resetSingleton, initAdminUser, resetDatabase, getDatabase } from '../src/web/db/database';
import { getAllMultiTurnBenchmarks } from '../src/benchmarks/multi-turn';
import type { LLMAdapter } from '../src/adapters/adapter';

type Msg = { role: string; content: string };

const MT_IDS = ['mt-context-001', 'mt-persona-002', 'mt-logic-003'];

/** Every message array the WEB path hands to an adapter, in order. */
const webCalls: Msg[][] = [];
const chatSpy = jest.fn(async (...args: unknown[]) => {
  webCalls.push(args[0] as Msg[]);
  return 'MODEL_OUTPUT';
});

jest.mock('../src/adapters/openai-adapter', () => ({
  OpenAIAdapter: jest.fn().mockImplementation(() => ({
    chat: (...args: unknown[]) => chatSpy(...args),
    name: 'openai',
  })),
}));
jest.mock('../src/adapters/anthropic-adapter', () => ({
  AnthropicAdapter: jest.fn().mockImplementation(() => ({
    chat: (...args: unknown[]) => chatSpy(...args),
    name: 'anthropic',
  })),
}));
jest.mock('../src/adapters/glm-adapter', () => ({
  GlmAdapter: jest.fn().mockImplementation(() => ({
    chat: (...args: unknown[]) => chatSpy(...args),
    name: 'glm',
  })),
}));
jest.mock('../src/adapters/deepseek-adapter', () => ({
  DeepSeekAdapter: jest.fn().mockImplementation(() => ({
    chat: (...args: unknown[]) => chatSpy(...args),
    name: 'deepseek',
  })),
}));
jest.mock('../src/adapters/qwen-adapter', () => ({
  QwenAdapter: jest.fn().mockImplementation(() => ({
    chat: (...args: unknown[]) => chatSpy(...args),
    name: 'qwen',
  })),
}));
jest.mock('../src/adapters/ollama-adapter', () => ({
  OllamaAdapter: jest.fn().mockImplementation(() => ({
    chat: (...args: unknown[]) => chatSpy(...args),
    name: 'ollama',
  })),
}));

/** A scoring stub that CAN move the score: the MT scorer makes no call of its own. */
const structuralAdapter: LLMAdapter = {
  chat: async () => 'unused',
  ping: async () => true,
  getName: () => 'structural',
};

function scorer(): Scorer {
  return new Scorer(structuralAdapter, {
    name: 'm',
    type: 'openai' as const,
    endpoint: '',
    apiKey: '',
  });
}

/** Run the real CLI Evaluator over the multi_turn dimension, recording every request. */
async function runCli(): Promise<Msg[][]> {
  const calls: Msg[][] = [];
  const adapter: LLMAdapter = {
    chat: async (messages) => {
      calls.push(messages as Msg[]);
      return 'REPLY';
    },
    ping: async () => true,
    getName: () => 'recorder',
  };
  const evaluator = new Evaluator(
    {
      models: [{ name: 'm', model: 'm' }],
      benchmarks: {
        dialogue: false,
        coding: false,
        function_calling: false,
        long_context: false,
        multi_turn: true,
      },
    } as any,
    adapter,
  );
  await evaluator.run();
  return calls;
}

/** Run the real CLI Evaluator, answering each question with `replyFor`. */
async function runCliWith(replyFor: (turns: Msg[]) => string) {
  const adapter: LLMAdapter = {
    chat: async (messages) => replyFor(messages as Msg[]),
    ping: async () => true,
    getName: () => 'scripted',
  };
  const evaluator = new Evaluator(
    {
      models: [{ name: 'm', model: 'm' }],
      benchmarks: {
        dialogue: false,
        coding: false,
        function_calling: false,
        long_context: false,
        multi_turn: true,
      },
    } as any,
    adapter,
  );
  const results = await evaluator.run();
  return results[0];
}

/** Run the real web engine over the multi_turn dimension, recording every request. */
async function runWeb(): Promise<Msg[][]> {
  resetSingleton();
  initAdminUser();
  resetDatabase();
  taskManager.clear();
  webCalls.length = 0;
  chatSpy.mockClear();

  const db = getDatabase();
  const admin = db.prepare('SELECT id FROM users WHERE username=?').get('admin') as any;
  const res = db
    .prepare(
      `INSERT INTO configs (user_id, name, type, endpoint, api_key, model)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(admin.id, 'cfg', 'openai', 'https://example.invalid/v1', 'sk-test', 'test-model');
  const configId = res.lastInsertRowid as number;

  const taskId = taskManager.startTask(admin.id, [configId], false, false, false, false, true);
  db.prepare(
    `INSERT INTO evaluations (id, user_id, status, include_dialogue, include_coding, include_function_calling, include_long_context, include_multi_turn)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(taskId, admin.id, 'PENDING', 0, 0, 0, 0, 1);

  const engine = new EvaluatorEngine();
  await engine.run(taskId, () => {});

  // Precondition, not the assertion: a throw inside the pipeline would be
  // swallowed into a FAILED row and every assertion below would be
  // vacuously satisfiable.
  const row = db.prepare('SELECT status FROM evaluations WHERE id=?').get(taskId) as any;
  expect(row.status).toBe('COMPLETED');
  return webCalls;
}

describe('r532 — the multi-turn consistency plane scores a bag of words', () => {
  const mts = getAllMultiTurnBenchmarks();
  const byId = (id: string) => mts.find((q) => q.id === id)!;

  describe('F0 — the dimension itself is what this file claims it is', () => {
    it('(0) the shipped set is three questions, each with a consistency check', () => {
      expect(mts.map((q) => q.id)).toEqual(MT_IDS);
      for (const q of mts) {
        const check = (q as any).consistencyCheck;
        expect(Array.isArray(check.required)).toBe(true);
        expect(Array.isArray(check.forbidden)).toBe(true);
        expect(check.required.length).toBeGreaterThan(0);
        // The dimension is named multi-turn: the subject is a CONVERSATION.
        expect((q as any).turns.length).toBeGreaterThan(1);
      }
    });

    it('(0b) the question text itself is empty -- the conversation IS the subject', () => {
      for (const q of mts) {
        expect(q.content).toBe('');
      }
    });
  });

  describe('F1 — the score is a bag of words, and the dump beats the answer', () => {
    it('(1) a bare keyword dump with no sentence scores 100', async () => {
      const q = byId('mt-context-001');
      const s = scorer();
      const dump = await s.scoreMultiTurn(q as any, '豆豆 3 岁 逗猫棒 挑食');
      expect(dump.score).toBe(100);
    });

    it('(2) the CORRECT prose answer scores BELOW the bare keyword dump', async () => {
      const q = byId('mt-context-001');
      const s = scorer();
      const dump = await s.scoreMultiTurn(q as any, '豆豆 3 岁 逗猫棒 挑食');
      const prose = await s.scoreMultiTurn(
        q as any,
        '你家猫叫豆豆，今年3岁，喜欢玩逗猫棒，最近挑食，医生建议换粮。',
      );
      expect(prose.score).toBeLessThan(dump.score);
      // The prose answer is not a failure -- it answers the question. It is
      // scored BELOW a keyword dump, which is the defect.
      expect(prose.score).toBe(75);
      expect(dump.score).toBe(100);
    });

    it('(3) punctuation between the keywords changes nothing', async () => {
      const q = byId('mt-context-001');
      const s = scorer();
      const got = await s.scoreMultiTurn(q as any, ',,,豆豆,,,3 岁,,,逗猫棒,,,挑食');
      expect(got.score).toBe(100);
    });

    it('(4) the ORDER of the keywords is irrelevant -- reversed scores the same', async () => {
      const q = byId('mt-logic-003');
      const s = scorer();
      const forward = await s.scoreMultiTurn(q as any, '435 220 1065');
      const reversed = await s.scoreMultiTurn(q as any, '1065 220 435');
      expect(forward.score).toBe(100);
      expect(reversed.score).toBe(forward.score);
    });

    it('(5) MOCK CONTROL: the same scorer moves the score with the reply', async () => {
      const q = byId('mt-context-001');
      const s = scorer();
      const full = await s.scoreMultiTurn(q as any, '豆豆 3 岁 逗猫棒 挑食');
      const partial = await s.scoreMultiTurn(q as any, '豆豆');
      expect(full.score).not.toBe(partial.score);
      expect(full.score).toBeGreaterThan(partial.score);
    });
  });

  describe('F2 — the forbidden list is a summary of the conversation', () => {
    it('(6) EVERY forbidden phrase of mt-logic-003 occurs in the question\'s OWN conversation', () => {
      const q = byId('mt-logic-003') as any;
      const promptText = q.turns.map((t: any) => t.content).join('\n');
      const forbidden = q.consistencyCheck.forbidden as string[];
      expect(forbidden.length).toBeGreaterThan(0);
      for (const phrase of forbidden) {
        expect(promptText).toContain(phrase);
      }
    });

    it('(6b) two of the three occur in the USER turns -- the prompt the model reads', () => {
      const q = byId('mt-logic-003') as any;
      const userText = q.turns
        .filter((t: any) => t.role === 'user')
        .map((t: any) => t.content)
        .join('\n');
      const forbidden = q.consistencyCheck.forbidden as string[];
      const inUser = forbidden.filter((p) => userText.includes(p));
      expect(inUser).toEqual(['1000', '500']);
    });

    it('(7) two forbidden phrases occur in the harness\'s OWN scripted assistant turns', () => {
      const q = byId('mt-logic-003') as any;
      const assistantText = q.turns
        .filter((t: any) => t.role === 'assistant')
        .map((t: any) => t.content)
        .join('\n');
      const forbidden = q.consistencyCheck.forbidden as string[];
      const inScript = forbidden.filter((p) => assistantText.includes(p));
      expect(inScript.length).toBeGreaterThanOrEqual(2);
      expect(inScript).toContain('785');
    });

    it('(8) every required phrase of mt-context-001 occurs in the question\'s own turns', () => {
      const q = byId('mt-context-001') as any;
      const promptText = q.turns.map((t: any) => t.content).join('\n');
      const required = q.consistencyCheck.required as string[];
      for (const phrase of required) {
        expect(promptText).toContain(phrase);
      }
    });
  });

  describe('F3 — the penalty is not cosmetic: the same correct answer scores 100 or 60', () => {
    it('(9) the terse correct answer scores 100', async () => {
      const q = byId('mt-logic-003');
      const got = await scorer().scoreMultiTurn(q as any, '总支出 435 元，晚饭 220 元，余额 1065 元');
      expect(got.score).toBe(100);
      expect(got.detail).toContain('forbidden hit: 0');
    });

    it('(10) the SAME answer, explained, scores 60 -- quoting the prompt is penalised', async () => {
      const q = byId('mt-logic-003');
      const got = await scorer().scoreMultiTurn(
        q as any,
        '原本 1000 元，买书花 180 元，午饭 35 元，共支出 435 元；朋友还了 500 元借款；晚饭 220 元，余额 1065 元',
      );
      expect(got.score).toBe(60);
      expect(got.detail).toContain('forbidden hit: 2');
    });

    it('(11) the two answers are semantically the SAME -- the score differs only by echoing', async () => {
      const q = byId('mt-logic-003');
      const s = scorer();
      const terse = await s.scoreMultiTurn(q as any, '总支出 435 元，晚饭 220 元，余额 1065 元');
      const explained = await s.scoreMultiTurn(
        q as any,
        '原本 1000 元，买书花 180 元，午饭 35 元，共支出 435 元；朋友还了 500 元借款；晚饭 220 元，余额 1065 元',
      );
      expect(terse.score).not.toBe(explained.score);
      // Both state 435, 220 and 1065 -- the same three facts.
      expect(terse.detail).toContain('required 3/3');
      expect(explained.detail).toContain('required 3/3');
    });
  });

  describe('F4 — the harness\'s own scripted assistant turn scores 27', () => {
    it('(12) the model\'s own perfect turn-by-turn answer scores far below 100', async () => {
      const q = byId('mt-logic-003') as any;
      const scripted = q.turns
        .filter((t: any) => t.role === 'assistant')
        .map((t: any) => t.content)
        .join('\n');
      const got = await scorer().scoreMultiTurn(q, scripted);
      expect(got.score).toBe(27);
    });

    it('(13) it misses the total expenditure and trips two phrases it was GIVEN', async () => {
      const q = byId('mt-logic-003') as any;
      const scripted = q.turns
        .filter((t: any) => t.role === 'assistant')
        .map((t: any) => t.content)
        .join('\n');
      const got = await scorer().scoreMultiTurn(q, scripted);
      expect(got.detail).toContain('missed: [435]');
      expect(got.detail).toContain('forbidden hit: 2');
    });
  });

  describe('F5 — unbounded substring matching', () => {
    it('(14) a WRONG dinner figure (1220) still scores 100', async () => {
      const q = byId('mt-logic-003');
      const got = await scorer().scoreMultiTurn(
        q as any,
        '总支出 435 元，晚饭 1220 元，余额 1065 元',
      );
      expect(got.score).toBe(100);
    });

    it('(15) a WRONG total (4350) still scores 100', async () => {
      const q = byId('mt-logic-003');
      const got = await scorer().scoreMultiTurn(
        q as any,
        '总支出 4350 元，晚饭 220 元，余额 1065 元',
      );
      expect(got.score).toBe(100);
    });

    it('(16) a WRONG balance (10650) still scores 100', async () => {
      const q = byId('mt-logic-003');
      const got = await scorer().scoreMultiTurn(
        q as any,
        '总支出 435 元，晚饭 220 元，余额 10650 元',
      );
      expect(got.score).toBe(100);
    });

    it('(17) a wrong age with a matching space (13 岁) still scores 100', async () => {
      const q = byId('mt-context-001');
      const got = await scorer().scoreMultiTurn(
        q as any,
        '豆豆今年13 岁，喜欢逗猫棒，最近挑食',
      );
      expect(got.score).toBe(100);
    });
  });

  describe('F6 — whitespace is part of the contract', () => {
    it('(18) the same facts without the space score 75', async () => {
      const q = byId('mt-context-001');
      const got = await scorer().scoreMultiTurn(
        q as any,
        '豆豆今年3岁，喜欢逗猫棒，最近挑食',
      );
      expect(got.score).toBe(75);
    });

    it('(19) WITH the space the same reply scores 100', async () => {
      const q = byId('mt-context-001');
      const got = await scorer().scoreMultiTurn(
        q as any,
        '豆豆今年3 岁，喜欢逗猫棒，最近挑食',
      );
      expect(got.score).toBe(100);
    });
  });

  describe('F7 — negation is invisible', () => {
    it('(20) a model DECLINING to make a burger is penalised for the word', async () => {
      const q = byId('mt-persona-002');
      const got = await scorer().scoreMultiTurn(q as any, '鹌鹑蛋不要汉堡，用水煮');
      expect(got.score).toBe(80);
      expect(got.detail).toContain('forbidden hit: 1');
    });

    it('(21) a model saying the cat is NOT 3 years old is credited with saying it', async () => {
      const q = byId('mt-context-001');
      const got = await scorer().scoreMultiTurn(
        q as any,
        '豆豆不是 3 岁，喜欢逗猫棒，最近挑食',
      );
      expect(got.score).toBe(100);
    });
  });

  describe('F8 — the scorer reads no conversation', () => {
    it('(22) the CLI sends the WHOLE turns array as one request', async () => {
      const calls = await runCli();
      expect(calls.length).toBe(MT_IDS.length);
      // Each request carries the conversation, not one flattened string.
      for (const messages of calls) {
        expect(messages.length).toBeGreaterThan(1);
      }
    });

    it('(23) the web path sends the SAME turns array -- the drop is not web-specific', async () => {
      const cli = await runCli();
      const web = await runWeb();
      expect(web.length).toBe(MT_IDS.length);
      const cliTexts = cli.map((m) => m.map((x) => x.content).join('\n')).sort();
      const webTexts = web.map((m) => m.map((x) => x.content).join('\n')).sort();
      expect(webTexts).toEqual(cliTexts);
    });

    it('(24) but the SCORER only ever sees the last message', async () => {
      // The request carries the conversation; the scorer is handed ONE string.
      // A reply identical to the scripted assistant turn scores the same
      // whether it came from a coherent multi-turn trajectory or from
      // nowhere -- there is no turn index to distinguish them.
      const q = byId('mt-logic-003') as any;
      const scripted = q.turns
        .filter((t: any) => t.role === 'assistant')
        .map((t: any) => t.content)
        .join('\n');
      const s = scorer();
      const viaScorer = await s.scoreMultiTurn(q, scripted);
      expect(viaScorer.score).toBe(27);
    });
  });

  describe('F9 — the score is not comparable across its own questions', () => {
    it('(25) one forbidden hit costs a flat 20 points on a 1-required question', async () => {
      const q = byId('mt-persona-002');
      const clean = await scorer().scoreMultiTurn(q as any, '鹌鹑蛋,水煮');
      const dirty = await scorer().scoreMultiTurn(q as any, '鹌鹑蛋 汉堡');
      expect(clean.score).toBe(100);
      expect(dirty.score).toBe(80);
    });

    it('(26) and a flat 20 on a 3-required question -- the units differ', async () => {
      const q = byId('mt-logic-003');
      const clean = await scorer().scoreMultiTurn(q as any, '总支出 435 元，晚饭 220 元，余额 1065 元');
      const dirty = await scorer().scoreMultiTurn(
        q as any,
        '总支出 435 元，晚饭 220 元，余额 1065 元，原本 1000 元',
      );
      expect(clean.score).toBe(100);
      expect(dirty.score).toBe(80);
      // 1 of 1 required hit on a 1-fact question, but 3 of 3 on the other --
      // the PENALTY is flat while the CREDIT is proportional.
      const persona = byId('mt-persona-002') as any;
      expect(persona.consistencyCheck.required.length).toBe(1);
      expect((byId('mt-logic-003') as any).consistencyCheck.required.length).toBe(3);
    });
  });

  describe('F10 — end to end through the real CLI evaluator', () => {
    it('(27) a keyword dump scores 100 over the whole dimension', async () => {
      const result = await runCliWith((turns) => {
        const text = turns.map((t) => t.content).join('\n');
        if (text.includes('豆豆')) return '豆豆 3 岁 逗猫棒 挑食';
        if (text.includes('鹌鹑蛋')) return '鹌鹑蛋';
        return '435 220 1065';
      });
      expect(result.dimensions.multi_turn!.count).toBe(MT_IDS.length);
      expect(result.dimensions.multi_turn!.average).toBe(100);
    });

    it('(28) the CORRECT answers score BELOW the dump over the whole dimension', async () => {
      const correct: Record<string, string> = {
        'mt-context-001':
          '你家猫叫豆豆，今年3岁，喜欢玩逗猫棒，最近挑食，医生建议换粮。',
        'mt-persona-002':
          '推荐水煮或蒸蛋羹这类低温做法，鹌鹑蛋口感更嫩滑。',
        'mt-logic-003':
          '总支出 435 元，晚饭 220 元，余额 1065 元。',
      };
      const result = await runCliWith((turns) => {
        const text = turns.map((t) => t.content).join('\n');
        if (text.includes('豆豆')) return correct['mt-context-001'];
        if (text.includes('鹌鹑蛋')) return correct['mt-persona-002'];
        return correct['mt-logic-003'];
      });
      const dump = await runCliWith((turns) => {
        const text = turns.map((t) => t.content).join('\n');
        if (text.includes('豆豆')) return '豆豆 3 岁 逗猫棒 挑食';
        if (text.includes('鹌鹑蛋')) return '鹌鹑蛋';
        return '435 220 1065';
      });
      expect(result.dimensions.multi_turn!.average).toBeLessThan(
        dump.dimensions.multi_turn!.average,
      );
    });

    it('(29) a reply that WRONGLY says 1220/4350/10650 scores 100 -- the oracle is unbounded', async () => {
      const result = await runCliWith((turns) => {
        const text = turns.map((t) => t.content).join('\n');
        if (text.includes('豆豆')) return '豆豆 3 岁 逗猫棒 挑食';
        if (text.includes('鹌鹑蛋')) return '鹌鹑蛋';
        return '总支出 4350 元，晚饭 1220 元，余额 10650 元';
      });
      expect(result.dimensions.multi_turn!.average).toBe(100);
    });
  });
});
