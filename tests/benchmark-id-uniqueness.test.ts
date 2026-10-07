// tests/benchmark-id-uniqueness.test.ts
//
// THE INVARIANT: a question's `id` is the join key of this project. It is
// written into the results table (src/core/scorer.ts -> `questionId`, schema
// at src/web/db/database.ts:151 `question_id TEXT NOT NULL`), printed into the
// CLI progress line (src/core/evaluator.ts:1738), and used as the Map key by
// getTestCases() (src/benchmarks/coding.ts:205). NOTHING keys on the question
// object itself -- every consumer joins by id.
//
// THE GAP THIS FILE CLOSES: nothing in the suite asserts that those ids are
// unique, and `results.question_id` has no UNIQUE index, so a duplicate id is
// not an error anywhere -- it is silent. Two distinct questions collapse into
// one key, and the collapse surfaces as wrong numbers (an averaged score that
// silently drops a question) rather than as a crash. `questions.total` in
// GET /api/questions (src/web/routes/questions.ts:68) sums the five array
// lengths, so a duplicate also makes `total` disagree with the number of
// distinct ids actually persisted -- a discrepancy no current check can see.
//
// MEASURED STATE ON THIS CHECKOUT (characterization, not assumption):
//   coding            11 ids, 11 unique
//   dialogue          13 ids, 13 unique
//   function-calling   5 ids,  5 unique
//   long-context       3 ids,  3 unique
//   multi-turn         3 ids,  3 unique
//   35 ids total, 0 duplicates within a set, 0 collisions across sets.
//   getTestCases() -> Map of size 11, i.e. one entry per coding question.
//
// WHY THE ACROSS-SETS ARM IS SEPARATE. The five sets use disjoint prefixes
// (code-/dial-/fc-/lc-/mt-), so today they cannot collide. That is a naming
// convention held in the data, not in the type system -- nothing enforces it,
// and a question added to `dialogue.ts` with a `code-` id would pass (1)
// exactly as it passes today. Pinning it costs one assertion and documents the
// prefix rule the results table silently depends on.
//
// ARMS, measured on this repo, not assumed:
//   M1  duplicate an id inside coding.ts      -> kills (1), (2), (3) AND (4).
//       (2) DOES go red, which corrects the first version of this table: a
//       within-set duplicate is also a cross-set collision, because (2)
//       flattens all five sets into one id list. (3) and (4) go red for the
//       same reason from opposite sides -- getTestCases() keys a Map, so a
//       duplicate collapses an entry, while the API's `total` sums the array
//       lengths, which the duplicate has not changed.
//   M2  give a dialogue question a `code-` id -> kills (2) only.
//   M3  empty an id string                     -> kills (1) and (2);
//       getTestCases() still keys one entry per question (it is keyed on the
//       empty string, not dropped), so (3) and (4) stay GREEN.
// A guard written only as "the total count equals the unique count" would be
// killed by M1 and M2 identically and would not tell a within-set collapse
// apart from a cross-set one.
//
// WHY THESE THREE, not one coarse mutant: M1 and M3 are distinguished only by
// WHICH arms fire. If M1 is authored sloppily -- e.g. inserting a literal that
// leaves an array hole (`[{...},\n    {...}\n  ]`) -- TypeScript rejects it
// with TS2322 "Type 'undefined' is not assignable" and the suite fails to
// RUN: zero assertions executed, which reads as a kill but proves nothing.
// An arm must be well-formed enough to compile, or its red is the compiler's.

import { getTestCases, getAllCodeBenchmarks } from '../src/benchmarks/coding';
import { getAllDialogueBenchmarks } from '../src/benchmarks/dialogue';
import { getAllFunctionCallingBenchmarks } from '../src/benchmarks/function-calling';
import { getAllLongContextBenchmarks } from '../src/benchmarks/long-context';
import { getAllMultiTurnBenchmarks } from '../src/benchmarks/multi-turn';

const SETS: Array<{ name: string; prefix: string; questions: Array<{ id: string }> }> = [
  {
    name: 'coding',
    prefix: 'code-',
    questions: getAllCodeBenchmarks() as Array<{ id: string }>,
  },
  {
    name: 'dialogue',
    prefix: 'dial-',
    questions: getAllDialogueBenchmarks() as Array<{ id: string }>,
  },
  {
    name: 'function-calling',
    prefix: 'fc-',
    questions: getAllFunctionCallingBenchmarks() as Array<{ id: string }>,
  },
  {
    name: 'long-context',
    prefix: 'lc-',
    questions: getAllLongContextBenchmarks() as Array<{ id: string }>,
  },
  {
    name: 'multi-turn',
    prefix: 'mt-',
    questions: getAllMultiTurnBenchmarks() as Array<{ id: string }>,
  },
];

/** Ids appearing more than once, with the multiplicity, sorted for a stable diff. */
function duplicates(ids: string[]): string[] {
  const seen = new Map<string, number>();
  for (const id of ids) seen.set(id, (seen.get(id) ?? 0) + 1);
  return [...seen.entries()]
    .filter(([, n]) => n > 1)
    .map(([id, n]) => `${id} x${n}`)
    .sort();
}

describe('benchmark question ids are the results-table join key', () => {
  it('(1) every question in a set has a unique, non-empty id', () => {
    const problems: string[] = [];
    for (const set of SETS) {
      if (set.questions.length === 0) problems.push(`${set.name}: set is empty`);
      for (const q of set.questions) {
        if (typeof q.id !== 'string' || q.id.trim() === '') {
          problems.push(`${set.name}: question has no usable id (${JSON.stringify(q.id)})`);
        }
      }
      const dupes = duplicates(set.questions.map((q) => q.id));
      if (dupes.length > 0) {
        problems.push(`${set.name}: duplicate id(s) ${dupes.join(', ')}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('(2) ids are globally unique across the five sets, and keep their prefix', () => {
    const all = SETS.flatMap((set) => set.questions.map((q) => ({ set: set.name, id: q.id })));
    expect(duplicates(all.map((q) => q.id))).toEqual([]);

    const wrongPrefix = all.filter((q) => !q.id.startsWith(`${SETS.find((s) => s.name === q.set)!.prefix}`));
    expect(wrongPrefix.map((q) => `${q.set}:${q.id}`)).toEqual([]);
  });

  it('(3) getTestCases() keys one entry per coding question, so ids do not collapse', () => {
    const cases = getTestCases();
    const code = SETS.find((s) => s.name === 'coding')!;
    expect(code.questions.length).toBeGreaterThan(0);
    // A duplicate id would silently overwrite an earlier question's test cases,
    // which is the same collapse as (1) seen from the Map side.
    expect(cases.size).toBe(code.questions.length);
    for (const q of code.questions) {
      expect(cases.has(q.id)).toBe(true);
    }
  });

  it('(4) the id the API reports is the id the Map is keyed by', () => {
    // GET /api/questions reports `q.id` for every question in every set and
    // sums the five lengths into `total` (src/web/routes/questions.ts:68). If a
    // set's ids collided, `total` would count rows that resolve to one key.
    const reported = SETS.reduce((sum, set) => sum + set.questions.length, 0);
    expect(reported).toBe(SETS.reduce((sum, set) => sum + new Set(set.questions.map((q) => q.id)).size, 0));
  });
});