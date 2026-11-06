/**
 * R533 -- the LONG-CONTEXT dimension: a 46,000-character haystack of the SAME
 * thirteen paragraphs, and a scorer that never reads it.
 *
 * R519 / R522 / R524 / R531 / R532 audited the other dimensions of this
 * harness.  R533 takes the LAST unmeasured one: `long_context`.
 *
 * WHAT WAS MEASURED (through the real production classes -- the real
 * `Scorer`, the real benchmark data, and the real CLI `Evaluator.run()` with
 * the adapter stubbed at the module boundary; nothing re-implements the
 * prompt assembly or the scoring):
 *
 *   F1  THE HAYSTACK IS 97% REPEATED FILLER.  `padContext()` cycles SIX
 *       paragraphs until the target length is reached, so lc-needle-001's
 *       46,159 characters are 307 paragraphs drawn from THIRTEEN distinct
 *       ones; the longest single paragraph appears 50 times.  Measured
 *       unique content: 1,398 characters = 3.0% of the payload; the
 *       dimension DECLARES `contextTokens: 32000`.
 *
 *   F2  THE SCORER'S VERDICT IS A FUNCTION OF THE REPLY ALONE.  The haystack
 *       is not an input to `scoreLongContext` in any way: stripping the
 *       haystack to ONE copy of each distinct paragraph (46,159 -> 1,422
 *       characters) does not change the score; replacing the haystack
 *       entirely with text containing NONE of the facts does not change the
 *       score; moving the needle from depth 50% to depth 0% or depth 100%
 *       does not change the score.  The dimension named `long_context`
 *       cannot observe context length, context depth, or context content.
 *
 *   F3  THE BENCHMARK'S OWN REFERENCE ANSWER SCORES 67.  `lc-multi-003`
 *       declares `keyFacts: ['23%', '280ms', 'Raft']` but its
 *       `referenceAnswer` is `'23%;280ms'` -- the algorithm name is NOT in
 *       the reference answer, so the harness's own correct answer misses one
 *       fact.  (The other two questions' reference answers cover 3/3 and
 *       4/4.)
 *
 *   F4  A CORRECT PROSE ANSWER LOSES TO A KEYWORD DUMP.  The correct answer
 *       written the way a human writes Chinese -- `投入18.7亿元` -- scores
 *       67, because `keyFacts` contains `'18.7 亿'` WITH A SPACE.  The same
 *       answer with a space scores 100, and a bare keyword dump
 *       (`杭州 18.7 亿 林承志`) also scores 100.
 *
 *   F5  UNBOUNDED SUBSTRING MATCHING.  `'23%'` matches inside `'123%'` and
 *       `'280ms'` matches inside `'1280ms'`; both WRONG answers score 100.
 *       And a NEGATED answer ("并不高 23%", "也不是 280ms") also scores 100.
 *       (R532 found the same class in the multi_turn scorer; this is the
 *       SAME defect in a second scorer, one file over.)
 *
 *   F6  A CONTEXT-WINDOW FAILURE AND A RETRIEVAL FAILURE ARE THE SAME
 *       NUMBER.  When the adapter throws `maximum context length exceeded`,
 *       every question scores 0 with `detail: '评测错误: ...'` -- and the
 *       dimension still reports `count: 3`.  A model that cannot even hold
 *       the context is indistinguishable, in the dimension's own output,
 *       from a model that read it and answered wrong.
 *
 *   F7  THE FILLER CARRIES NO DISTRACTOR.  With the needle paragraph
 *       removed, the remaining distinct filler contains NO money, NO
 *       percentage, NO millisecond figure, and NO person name.  The
 *       published critique of needle-in-a-haystack (multigrid.ai; Chroma's
 *       "Context Rot"; arXiv:2605.23170) is that the filler must be
 *       semantically related distractor text; here it is not merely
 *       unrelated, it is EMPTY of facts, and repeated 50 times.
 *
 * WHY THIS IS A MIGRATION GAP, NOT GREENFIELD
 *
 * The diagnosis and the repairs are already published: the NIAH ceiling
 * (multigrid), the filler-similarity critique (Chroma "Context Rot";
 * arXiv:2605.23170 "Positional Failures in Long-Context LLMs"), HELMET
 * (ICLR 2025) on synthetic-task noise, LongBench v2 (ACL 2025) on
 * extractive-question saturation, and RULER's depth x length sweep.  The
 * agent-benchmark literature has already published both the diagnosis and
 * the fixes; this harness implements the pre-fix version.  Reporting this as
 * greenfield would be wrong.
 *
 * WHAT THIS SUITE DOES AND DOES NOT DO
 *
 * Ships: a test-only suite that PINS the observed (defective) behaviour, so
 * that when a repair is decided, each candidate arm turns RED and the
 * decision stays visible.
 *
 * Does NOT ship: any production change.  Each repair is a product decision
 * (per docs/PROJECT-GOVERNANCE.md, "Design Rules": cross-cutting changes that
 * touch scoring algorithms or benchmark dimensions need a design note before
 * code):
 *   - should the filler be made non-repeating and fact-bearing?
 *   - should the scorer be given the context (so it can measure depth)?
 *   - should the matching be boundary-aware, whitespace-tolerant and
 *     negation-aware?
 *   - should a context-window failure be distinguishable from a wrong
 *     answer?
 *   - should `keyFacts` be checked against the question's own
 *     `referenceAnswer`?
 *
 * All five are father-gated.  This round delivers THE MEASUREMENT ONLY.
 */
import { Scorer } from '../src/core/scorer';
import { getAllLongContextBenchmarks } from '../src/benchmarks/long-context';
import { Evaluator } from '../src/core/evaluator';
import type { LLMAdapter } from '../src/adapters/adapter';
import type { BenchmarkQuestion, ModelConfig } from '../src/types';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const MODEL: ModelConfig = {
  name: 'r533-probe',
  type: 'openai',
  endpoint: 'http://localhost:1/v1',
  apiKey: 'r533',
  model: 'r533-probe',
};

function stubAdapter(chat?: LLMAdapter['chat']): LLMAdapter {
  return { chat: chat ?? (async () => '') } as unknown as LLMAdapter;
}

function makeScorer(): Scorer {
  return new Scorer(stubAdapter(), MODEL);
}

const QUESTIONS = getAllLongContextBenchmarks();

function byId(id: string): BenchmarkQuestion & { keyFacts?: string[]; contextTokens?: number } {
  const q = QUESTIONS.find((x) => x.id === id);
  if (!q) throw new Error(`no such long_context question: ${id}`);
  return q as BenchmarkQuestion & { keyFacts?: string[]; contextTokens?: number };
}

/** Split a haystack into its paragraphs, trimmed, dropping empties. */
function paragraphs(content: string): string[] {
  return content
    .split('\n\n')
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * Keep ONE copy of each distinct paragraph, in order of first appearance.
 * This is the F2 "filler-strip" control: it removes the repetition while
 * preserving every distinct paragraph (the needle included).
 */
function stripToDistinct(content: string): string {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const p of content.split('\n\n')) {
    const t = p.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    kept.push(p);
  }
  return kept.join('\n\n');
}

// ---------------------------------------------------------------------------

describe('r533 -- the long_context dimension', () => {
  describe('F1 -- the haystack is repeated filler, and the dimension says 32000 tokens', () => {
    it('ships a haystack whose distinct content is a small fraction of its payload', () => {
      for (const q of QUESTIONS) {
        const paras = paragraphs(q.content);
        const distinct = new Set(paras);
        const uniqueChars = Array.from(distinct).reduce((n, p) => n + p.length, 0);
        const ratio = uniqueChars / q.content.length;
        // The declared size is 32000 tokens; the unique content is a few
        // hundred characters.  Assert the SHAPE (a small ratio), not a
        // transcribed number.
        expect(ratio).toBeLessThan(0.15);
        expect(distinct.size).toBeLessThan(40);
      }
    });

    it('repeats at least one paragraph many times over (the replication factor)', () => {
      for (const q of QUESTIONS) {
        const counts = new Map<string, number>();
        for (const p of paragraphs(q.content)) counts.set(p, (counts.get(p) ?? 0) + 1);
        const maxCopies = Math.max(...Array.from(counts.values()));
        expect(maxCopies).toBeGreaterThan(10);
      }
    });

    it('declares contextTokens: 32000 while the unique content is far smaller', () => {
      for (const q of QUESTIONS) {
        expect(q.contextTokens).toBe(32000);
        const uniqueChars = Array.from(new Set(paragraphs(q.content))).reduce((n, p) => n + p.length, 0);
        // The file's own comment says 1 token ~= 1.5 chars, so the unique
        // content is a small multiple of a few hundred tokens against a
        // declared 32000.  Assert the ORDER OF MAGNITUDE, not the constant.
        const uniqueTokens = uniqueChars / 1.5;
        expect(uniqueTokens).toBeLessThan(q.contextTokens! / 5);
      }
    });
  });

  describe('F2 -- the scorer never reads the context', () => {
    it('scores the same reply identically on the full haystack and on the repetition-stripped haystack', async () => {
      const scorer = makeScorer();
      const q = byId('lc-needle-001');
      const reply = '项目在杭州启动,首期投入 18.7 亿元人民币,牵头人林承志。';
      const full = await scorer.scoreLongContext(q, reply);
      const strippedQuestion = { ...q, content: stripToDistinct(q.content) } as BenchmarkQuestion;
      expect(strippedQuestion.content.length).toBeLessThan(q.content.length / 10);
      const stripped = await scorer.scoreLongContext(strippedQuestion, reply);
      expect(full.score).toBe(stripped.score);
    });

    it('scores a reply identically when the haystack contains NONE of the facts', async () => {
      const scorer = makeScorer();
      const q = byId('lc-needle-001');
      const reply = '项目在杭州启动,首期投入 18.7 亿元人民币,牵头人林承志。';
      const factless = { ...q, content: '一段与任何事实都无关的上下文。'.repeat(3000) };
      expect(factless.content).not.toContain('林承志');
      const real = await scorer.scoreLongContext(q, reply);
      const blind = await scorer.scoreLongContext(factless as BenchmarkQuestion, reply);
      expect(blind.score).toBe(real.score);
      expect(blind.score).toBe(100);
    });

    it('is invariant to the depth of the needle (0%, 50%, 100%)', async () => {
      const scorer = makeScorer();
      const q = byId('lc-needle-001');
      const needle = '隐藏关键事实:2026 年 6 月 1 日凌晨,代号"晨星"的项目在杭州启动,首期投入 18.7 亿元人民币,牵头人为林承志博士。';
      const ask =
        '\n\n---\n\n请阅读上面的全部内容,回答:代号"晨星"的项目在哪个城市启动?首期投入多少人民币?牵头人是谁?';
      const reply = '项目在杭州启动,首期投入 18.7 亿元人民币,牵头人林承志。';

      expect(q.content).toContain(needle);
      const withoutNeedle = q.content.replace(needle, '');
      const atFront = needle + '\n\n' + withoutNeedle;
      const atEnd = withoutNeedle.replace(ask, '') + '\n\n' + needle + ask;

      const at50 = await scorer.scoreLongContext(q, reply);
      const frontQuestion = { ...q, content: atFront } as BenchmarkQuestion;
      const endQuestion = { ...q, content: atEnd } as BenchmarkQuestion;
      const at0 = await scorer.scoreLongContext(frontQuestion, reply);
      const at100 = await scorer.scoreLongContext(endQuestion, reply);

      expect(frontQuestion.content).toContain(needle);
      expect(endQuestion.content).toContain(needle);
      expect(at0.score).toBe(at50.score);
      expect(at100.score).toBe(at50.score);
    });

    it('gives a reply that states the facts WITHOUT having read the context full credit', async () => {
      // The score is a function of the reply's strings; a model that
      // hallucinated the exact facts scores the same as one that retrieved
      // them.  (This is the whole F2 finding in one arm.)
      const scorer = makeScorer();
      const q = byId('lc-needle-001');
      const r = await scorer.scoreLongContext(q, '杭州 18.7 亿 林承志');
      expect(r.score).toBe(100);
    });
  });

  describe('F3 -- the benchmark\'s own reference answer does not score 100', () => {
    it('scores lc-multi-003\'s own referenceAnswer at less than 100', async () => {
      const scorer = makeScorer();
      const q = byId('lc-multi-003');
      const r = await scorer.scoreLongContext(q, q.referenceAnswer ?? '');
      expect(r.score).toBeLessThan(100);
    });

    it('names the reason: a keyFact is absent from the referenceAnswer', async () => {
      const q = byId('lc-multi-003');
      const ref = (q.referenceAnswer ?? '').toLowerCase();
      const uncovered = (q.keyFacts ?? []).filter((f) => !ref.includes(f.toLowerCase()));
      expect(uncovered.length).toBeGreaterThan(0);
      // and the uncovered fact IS in the context -- so the question is
      // answerable, only its own reference answer is short.
      expect(q.content.toLowerCase()).toContain((q.keyFacts ?? [])[0].toLowerCase());
    });

    it('the OTHER two questions cover every keyFact in their referenceAnswer (the control)', async () => {
      for (const id of ['lc-needle-001', 'lc-extract-002']) {
        const q = byId(id);
        const ref = (q.referenceAnswer ?? '').toLowerCase();
        const uncovered = (q.keyFacts ?? []).filter((f) => !ref.includes(f.toLowerCase()));
        expect(uncovered).toEqual([]);
      }
    });
  });

  describe('F4 -- a correct prose answer loses to a keyword dump', () => {
    it('scores the human-written Chinese answer below the spaced variant', async () => {
      const scorer = makeScorer();
      const q = byId('lc-needle-001');
      // How a human actually writes it: no space between the number and the
      // Chinese unit.
      const natural = await scorer.scoreLongContext(q, '项目在杭州启动,首期投入18.7亿元人民币,牵头人是林承志博士。');
      const spaced = await scorer.scoreLongContext(q, '项目在杭州启动,首期投入 18.7 亿元人民币,牵头人是林承志博士。');
      expect(spaced.score).toBe(100);
      expect(natural.score).toBeLessThan(spaced.score);
    });

    it('scores a bare keyword dump equal to the best prose answer', async () => {
      const scorer = makeScorer();
      const q = byId('lc-needle-001');
      const dump = await scorer.scoreLongContext(q, '杭州 18.7 亿 林承志');
      const prose = await scorer.scoreLongContext(q, '项目在杭州启动,首期投入 18.7 亿元人民币,牵头人是林承志博士。');
      expect(dump.score).toBe(prose.score);
      expect(dump.score).toBe(100);
    });

    it('the fact that is missed is the one with an embedded space', () => {
      const q = byId('lc-needle-001');
      expect((q.keyFacts ?? []).some((f) => /\s/.test(f))).toBe(true);
    });
  });

  describe('F5 -- unbounded substring matching and blindness to negation', () => {
    it('gives a wrong number that CONTAINS the required number full credit', async () => {
      const scorer = makeScorer();
      const q = byId('lc-multi-003');
      const wrong = await scorer.scoreLongContext(
        q,
        'PostgreSQL 16 比 MySQL 8.0 高 123%;Raft Leader 选举 280ms。'
      );
      expect(wrong.score).toBe(100);
    });

    it('gives a wrong duration that CONTAINS the required duration full credit', async () => {
      const scorer = makeScorer();
      const q = byId('lc-multi-003');
      const wrong = await scorer.scoreLongContext(
        q,
        'PostgreSQL 16 比 MySQL 8.0 高 23%;Raft Leader 选举 1280ms。'
      );
      expect(wrong.score).toBe(100);
    });

    it('gives a NEGATED answer full credit', async () => {
      const scorer = makeScorer();
      const q = byId('lc-multi-003');
      const negated = await scorer.scoreLongContext(
        q,
        'PostgreSQL 16 比 MySQL 8.0 并不高 23%;Raft Leader 选举也不是 280ms。'
      );
      expect(negated.score).toBe(100);
    });

    it('the negative control: a reply that states none of the facts scores 0', async () => {
      // Without this arm, "everything scores 100" would also satisfy the
      // three arms above -- the suite must show the scorer CAN say 0.
      const scorer = makeScorer();
      const q = byId('lc-multi-003');
      const nothing = await scorer.scoreLongContext(q, 'PostgreSQL 与 MySQL 的差异见文档 A。');
      expect(nothing.score).toBe(0);
    });
  });

  describe('F6 -- a context-window failure is indistinguishable from a wrong answer', () => {
    it('scores a context-window failure at 0, exactly like a wrong answer', async () => {
      const evaluator = new Evaluator(
        {
          models: [MODEL],
          benchmarks: {
            dialogue: false,
            coding: false,
            function_calling: false,
            long_context: true,
            multi_turn: false,
          },
        } as never,
        stubAdapter(async () => {
          throw new Error('maximum context length exceeded');
        })
      );
      const results = await evaluator.run();
      expect(results).toHaveLength(1);
      const res = results[0];
      expect(res.scores).toHaveLength(3);
      for (const s of res.scores) {
        expect(s.score).toBe(0);
        // the error is visible in the detail string ...
        expect(s.detail).toContain('maximum context length exceeded');
      }
      // ... but the dimension's own aggregate still counts them as scored
      // questions, so the dimension's report cannot tell the two apart.
      const dim = res.dimensions.long_context as { count: number; average: number };
      expect(dim.count).toBe(3);
      expect(dim.average).toBe(0);
    });

    it('a retrieval failure produces the SAME dimension aggregate as a context-window failure', async () => {
      const build = (chat: LLMAdapter['chat']) =>
        new Evaluator(
          {
            models: [MODEL],
            benchmarks: {
              dialogue: false,
              coding: false,
              function_calling: false,
              long_context: true,
              multi_turn: false,
            },
          } as never,
          stubAdapter(chat)
        );

      const boom = await build(async () => {
        throw new Error('maximum context length exceeded');
      }).run();
      const wrong = await build(async () => '完全无关的回答。').run();

      const a = boom[0].dimensions.long_context as { count: number; total: number; average: number };
      const b = wrong[0].dimensions.long_context as { count: number; total: number; average: number };
      expect(a.count).toBe(b.count);
      expect(a.total).toBe(b.total);
      expect(a.average).toBe(b.average);
    });
  });

  describe('F7 -- the filler carries no distractor fact', () => {
    it('the distinct filler contains no money, percentage, duration or person name', () => {
      for (const q of QUESTIONS) {
        const facts = (q as unknown as { keyFacts: string[] }).keyFacts;
        const filler = Array.from(new Set(paragraphs(q.content)))
          .filter((p) => !facts.some((f) => p.includes(f)))
          .join('\n');
        expect(filler.match(/[\d.]+\s*(?:亿|万|元)/g) ?? []).toEqual([]);
        expect(filler.match(/\d+(?:\.\d+)?%/g) ?? []).toEqual([]);
        expect(filler.match(/\d+\s*ms/g) ?? []).toEqual([]);
        expect(filler.match(/[一-龥]{2,3}博士/g) ?? []).toEqual([]);
      }
    });

    it('the needle sits at the MIDDLE of the haystack (a single depth, not a sweep)', () => {
      // NIAH/CRE sweep the needle across a depth x length grid; this
      // dimension samples ONE depth per question.
      const q = byId('lc-needle-001');
      const i = q.content.indexOf('林承志');
      expect(i).toBeGreaterThan(0);
      const depth = i / q.content.length;
      expect(depth).toBeGreaterThan(0.4);
      expect(depth).toBeLessThan(0.6);
    });
  });

  describe('the end-to-end shape: what the model is actually sent', () => {
    it('sends the full 46k-character haystack as ONE user message', async () => {
      const sent: Array<{ role: string; length: number }> = [];
      const evaluator = new Evaluator(
        {
          models: [MODEL],
          benchmarks: {
            dialogue: false,
            coding: false,
            function_calling: false,
            long_context: true,
            multi_turn: false,
          },
        } as never,
        stubAdapter(async (messages) => {
          for (const m of messages) sent.push({ role: m.role, length: m.content.length });
          return '杭州 18.7 亿 林承志';
        })
      );
      await evaluator.run();
      expect(sent).toHaveLength(3);
      for (const m of sent) {
        expect(m.role).toBe('user');
        expect(m.length).toBeGreaterThan(40000);
      }
    });

    it('a reply that hits every keyFact of every question scores 100 on all three', async () => {
      const evaluator = new Evaluator(
        {
          models: [MODEL],
          benchmarks: {
            dialogue: false,
            coding: false,
            function_calling: false,
            long_context: true,
            multi_turn: false,
          },
        } as never,
        stubAdapter(async (messages) => {
          const c = messages[messages.length - 1].content;
          if (c.includes('晨星')) return '杭州 18.7 亿 林承志';
          if (c.includes('稀疏激活模型相比稠密模型能效比'))
            return '10 万亿 4.2 倍 3 倍 稀疏激活';
          return '23% 280ms Raft';
        })
      );
      const results = await evaluator.run();
      const res = results[0];
      expect(res.scores.map((s) => s.score)).toEqual([100, 100, 100]);
      expect(res.dimensions.long_context!.average).toBe(100);
    });
  });
});
