/**
 * The no-runtime-import sweep (scripts/sweep-no-runtime-import.py) is how a
 * tick decides which exported symbols are pinned only by SOURCE TEXT. If it
 * over-reports, the next tick is sent to rebuild suites that already exist --
 * so this file pins the sweep's own behaviour, driving it as a real
 * subprocess rather than reading its source.
 *
 * These are not tests of the product. They are tests of the instrument: if
 * the sweep cannot see a runtime import, it is blind, and a blind sweep is
 * how already-shipped work gets redone.
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const REPO = path.resolve(__dirname, '..');
const SCRIPT = path.join(REPO, 'scripts', 'sweep-no-runtime-import.py');

function runSweep(srcDir: string, testsDir: string): string {
  return execFileSync('python3', [SCRIPT, srcDir, testsDir], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
}

function reportedNames(stdout: string): Set<string> {
  const names = new Set<string>();
  for (const line of stdout.split('\n')) {
    const m = /^NO-RUNTIME-IMPORT\s+(\S+)/.exec(line);
    if (m) names.add(m[1]);
  }
  return names;
}

describe('sweep-no-runtime-import.py (instrument)', () => {
  let workdir: string;

  beforeAll(() => {
    workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'sweep-test-'));
  });

  afterAll(() => {
    fs.rmSync(workdir, { recursive: true, force: true });
  });

  function fixture(name: string, src: Record<string, string>, tests: Record<string, string>): {
    srcDir: string;
    testsDir: string;
  } {
    const base = path.join(workdir, name);
    const srcDir = path.join(base, 'src');
    const testsDir = path.join(base, 'tests');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(testsDir, { recursive: true });
    for (const [rel, body] of Object.entries(src)) {
      const p = path.join(srcDir, rel);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, body);
    }
    for (const [rel, body] of Object.entries(tests)) {
      fs.writeFileSync(path.join(testsDir, rel), body);
    }
    return { srcDir, testsDir };
  }

  it('(0) the script exists and is executable by the harness', () => {
    expect(fs.existsSync(SCRIPT)).toBe(true);
    expect(fs.existsSync(path.join(REPO, 'scripts', 'verify-coverage-thresholds.mjs'))).toBe(true);
  });

  it('(1) an ES import clause is seen, so a real runtime import is not reported', () => {
    const { srcDir, testsDir } = fixture(
      'es-import',
      { 'a.ts': 'export function alpha(): number {\n  return 1;\n}\n' },
      { 'a.test.ts': "import { alpha } from '../src/a';\nit('x', () => expect(alpha()).toBe(1));\n" }
    );
    const names = reportedNames(runSweep(srcDir, testsDir));
    expect(names.has('alpha')).toBe(false);
  });

  it('(2) a CommonJS destructure ABOVE require() is seen', () => {
    // The binding list spans lines before the call. A sweep that only reads
    // right of the paren finds a bare `;` and reports this as unpinned.
    const { srcDir, testsDir } = fixture(
      'cjs-destructure',
      { 'a.ts': 'export function beta(): number {\n  return 2;\n}\n' },
      {
        'a.test.ts':
          "const {\n  beta,\n} = require('../src/a');\nit('x', () => expect(beta()).toBe(2));\n",
      }
    );
    const names = reportedNames(runSweep(srcDir, testsDir));
    expect(names.has('beta')).toBe(false);
  });

  it('(3) a CommonJS `as { name }` cast AFTER require() is seen', () => {
    // The other shape: the name sits after the paren, so a sweep that only
    // reads left of it reports a shipped runtime suite as unpinned.
    const { srcDir, testsDir } = fixture(
      'cjs-cast',
      { 'index.ts': 'export function gamma(): number {\n  return 3;\n}\n' },
      {
        'index.test.ts':
          "const mod = require('../src/index') as { gamma: unknown };\nconst g = mod.gamma as () => number;\nit('x', () => expect(g()).toBe(3));\n",
      }
    );
    const names = reportedNames(runSweep(srcDir, testsDir));
    expect(names.has('gamma')).toBe(false);
  });

  it('(4) a symbol referenced only inside a grep-style source-text assertion IS reported', () => {
    // The whole point of the sweep: a name that appears in a test only as a
    // string literal in a readFileSync assertion is NOT runtime coverage.
    const { srcDir, testsDir } = fixture(
      'text-only',
      { 'a.ts': 'export function delta(): number {\n  return 4;\n}\n' },
      {
        'a.test.ts':
          "const src = fs.readFileSync('src/a.ts', 'utf8');\nexpect(src).toContain('function delta');\n",
      }
    );
    const names = reportedNames(runSweep(srcDir, testsDir));
    expect(names.has('delta')).toBe(true);
  });

  it('(5) an unimported symbol with no test mention at all IS reported', () => {
    const { srcDir, testsDir } = fixture(
      'untouched',
      { 'a.ts': 'export function epsilon(): number {\n  return 5;\n}\n' },
      { 'a.test.ts': "it('nothing', () => expect(1).toBe(1));\n" }
    );
    const names = reportedNames(runSweep(srcDir, testsDir));
    expect(names.has('epsilon')).toBe(true);
  });

  it('(6) a re-export barrel is resolved to the test that imports it', () => {
    const { srcDir, testsDir } = fixture(
      'barrel',
      {
        'a.ts': 'export function zeta(): number {\n  return 6;\n}\n',
        'index.ts': "export { zeta } from './a';\n",
      },
      { 'a.test.ts': "import { zeta } from '../src/index';\nit('x', () => expect(zeta()).toBe(6));\n" }
    );
    const names = reportedNames(runSweep(srcDir, testsDir));
    expect(names.has('zeta')).toBe(false);
  });

  it('(7) running against the real repo reports only symbols no test drives', () => {
    // Guards the direction that actually costs work: a symbol that IS owned by
    // a committed runtime suite must never reappear in the report.
    const stdout = runSweep(path.join(REPO, 'src'), path.join(REPO, 'tests'));
    const names = reportedNames(stdout);
    for (const owned of ['loadConfig', 'runBenchmark', 'printSummary', 'createAdapter']) {
      expect(names.has(owned)).toBe(false);
    }
    // And the sweep still has teeth: it is not simply reporting nothing.
    expect(stdout).toContain('no-runtime-import=');
    expect(names.size).toBeGreaterThan(0);
  });

  it('(8) a member read off a module bound to a BARE assignment is seen', () => {
    // `mod = require('../src/x')` inside jest.isolateModules(), with the
    // `let mod!: Mod` declared ABOVE the callback. The binding has to outlive
    // the closure, so it cannot be a `const` in the statement -- and the
    // eslint-disable comment that usually sits there must not hide it. No `as`
    // cast: arm (3) already covers the cast shape, and with a cast this arm
    // would pass against the unfixed script and prove nothing. Here the ONLY
    // thing standing between the test and a green report is the bare
    // assignment plus the member read.
    // tests/web/db-migration-missing-function-calling.test.ts is this shape,
    // and EVALUATION_MIGRATION_COLUMNS was reported unpinned because of it.
    const { srcDir, testsDir } = fixture(
      'bare-assign-member',
      { 'x.ts': 'export const eta2: string[] = ["c1"];\nexport function close2(): void {}\n' },
      {
        // The eslint-disable comment is LOAD-BEARING for this arm. Without it
        // the binding sits on the line directly above the require() and any
        // `head` window finds it; with it, the anchor has to survive comment
        // text. Deleting the comment-stripping pass makes this arm red.
        'x.test.ts':
          "let mod: { eta2: string[]; close2: () => void };\n" +
          "jest.isolateModules(() => {\n" +
          "  // eslint-disable-next-line @typescript-eslint/no-require-imports\n" +
          "  // the module must be loaded inside the isolate callback\n" +
          "  mod = require('../src/x');\n" +
          "});\n" +
          "it('x', () => expect(mod.eta2).toEqual(['c1']));\n",
      }
    );
    const names = reportedNames(runSweep(srcDir, testsDir));
    expect(names.has('eta2')).toBe(false);
  });

  it('(9) a relative specifier resolves member reads (the `src` in spec trap)', () => {
    // The containment test must be `"src" in spec`, never spec.startswith.
    // Every specifier in this repo is relative ('../src/x'), so an anchored
    // test skips EVERY member read and the shape stays invisible no matter
    // how it is spelled.
    const { srcDir, testsDir } = fixture(
      'relative-spec',
      { 'y.ts': 'export const theta2: string[] = ["c2"];\n' },
      {
        'y.test.ts':
          "const m = require('../src/y');\n" +
          "it('y', () => expect(m.theta2).toEqual(['c2']));\n",
      }
    );
    const names = reportedNames(runSweep(srcDir, testsDir));
    expect(names.has('theta2')).toBe(false);
  });

  it('(10) a member read a variable LATER in the file still counts', () => {
    // The binding is read after the require(), far past the 400-character
    // forward window a line-scanning sweep would use. The filler is REAL CODE,
    // not comments: a comment-only gap would still be inside the same textual
    // neighbourhood and would not separate the binding from its read.
    const filler = Array.from(
      { length: 30 },
      (_, i) => `const pad${i} = ${i};`
    ).join('\n');
    const { srcDir, testsDir } = fixture(
      'deferred-member',
      { 'z.ts': 'export const iota2: number = 9;\nexport const kappa2: number = 10;\n' },
      {
        'z.test.ts':
          "const m = require('../src/z');\n" +
          filler + "\n" +
          "function readIota(): number { return m.iota2; }\n" +
          "describe('z', () => { it('z', () => expect(readIota()).toBe(9)); });\n",
      }
    );
    const names = reportedNames(runSweep(srcDir, testsDir));
    expect(names.has('iota2')).toBe(false);
    // And the sweep has NOT been made toothless in the other direction: the
    // sibling export this file never reads is still reported.
    expect(names.has('kappa2')).toBe(true);
  });

  it('(11) a member read is credited to the binding LIVE at its offset', () => {
    // THE FALSE NEGATIVE THIS EXISTS FOR. `m` is bound to './a', read, then
    // REBOUND to './b'. A sweep that forward-scans from each require credits
    // `m.SECRET_ALPHA` to './a' -- but at that offset `m` is './b', which does
    // not export SECRET_ALPHA at all. The old sweep therefore reported 1 gap
    // here instead of 2 and hid a real coverage hole.
    const { srcDir, testsDir } = fixture(
      'rebound-target',
      { 'a.ts': 'export const ALPHA2: string[] = ["a"];\nexport const SECRET_ALPHA2: string[] = ["h"];\n',
        'b.ts': 'export const BETA2: string[] = ["b"];\n' },
      {
        'r.test.ts':
          "let m = require('../src/a');\n" +
          'm.ALPHA2;\n' +
          "m = require('../src/b');\n" +
          'm.SECRET_ALPHA2;\n',
      }
    );
    const names = reportedNames(runSweep(srcDir, testsDir));
    expect(names.has('SECRET_ALPHA2')).toBe(true);
    expect(names.has('ALPHA2')).toBe(false);
    expect(names.has('BETA2')).toBe(true);
  });

  it('(12) a member read above a rebinding require is not mistaken for an import', () => {
    // The `note()` clause used to be the raw text LEFT of `=`, which swept in
    // every identifier sitting in the statement before it. Here the read
    // carries NO trailing semicolon, so it shares a statement with the
    // rebinding require -- the old sweep read `m.SECRET_B2` as an imported
    // NAME of '../src/b' and reported 0 gaps. Same hidden hole as (11),
    // reached by a different route, so both routes are pinned.
    const { srcDir, testsDir } = fixture(
      'import-clause-overreach',
      { 'a.ts': 'export const ALPHA_B2: string[] = ["a"];\nexport const SECRET_B2: string[] = ["h"];\n',
        'b.ts': 'export const BETA_B2: string[] = ["b"];\n' },
      {
        'g.test.ts':
          "let m = require('../src/a');\n" +
          'm.ALPHA_B2\n' +
          "m = require('../src/b');\n" +
          'm.BETA_B2;\n',
      }
    );
    const names = reportedNames(runSweep(srcDir, testsDir));
    expect(names.has('SECRET_B2')).toBe(true);
    expect(names.has('ALPHA_B2')).toBe(false);
    expect(names.has('BETA_B2')).toBe(false);
  });

  it('(13) a star-re-export barrel keeps the name-only fallback', () => {
    // exports_of() returns None for a barrel that `export *`-re-exports,
    // because its own name set is incomplete. The member read must then still
    // count: dropping it would make the sweep toothless on every barrel in
    // the repo, reporting gaps that are actually driven.
    const { srcDir, testsDir } = fixture(
      'star-barrel',
      { 'a.ts': 'export const OPAQUE_A: string[] = ["o"];\n',
        'index.ts': "export * from './a';\n" },
      { 'o.test.ts': "const m = require('../src/index');\nm.OPAQUE_A;\n" }
    );
    expect(reportedNames(runSweep(srcDir, testsDir)).has('OPAQUE_A')).toBe(false);
  });

  it('(14) a binding clause carrying UNRELATED identifiers does not credit them', () => {
    // The clause is the text left of `=` for a require that follows an
    // unterminated statement. Handing the raw text to note() sweeps in every
    // identifier in it, so `someCall(alpha, beta)` marks BOTH alpha and beta
    // as imported names of '../src/a' and the sweep silently loses the gap.
    //
    // R447: this arm as inherited was NOT discriminating. It exported only T1
    // and T2, so crediting the overreach names changed nothing observable —
    // `alpha`, `beta` and `unrelated` are not exports of `a.ts`, so marking
    // them "pinned" has no effect on what is REPORTED. The mutation
    // `note(stmt)` in place of `note(bind.group(1))` left the suite 15/15
    // green: M3 survived, and the arm that exists to defend that exact line
    // was the reason. The overreach identifiers must themselves be exports,
    // or crediting them costs nothing and the arm cannot fail.
    const { srcDir, testsDir } = fixture(
      'clause-overreach',
      { 'a.ts':
          'export const T1: string[] = ["1"];\n' +
          'export const T2: string[] = ["2"];\n' +
          'export const alpha: string[] = ["a"];\n' +
          'export const beta: string[] = ["b"];\n' +
          'export const unrelated: string[] = ["u"];\n' +
          'export const someCall: string[] = ["s"];\n' },
      {
        't.test.ts':
          'const unrelated = someCall(alpha, beta)\n' +
          "const { T1 } = require('../src/a');\n",
      }
    );
    const names = reportedNames(runSweep(srcDir, testsDir));
    // T1 IS genuinely destructured, so it is pinned...
    expect(names.has('T1')).toBe(false);
    // ...but nothing drives T2, and the overreach must not claim otherwise.
    expect(names.has('T2')).toBe(true);
    // R447: and the overreach identifiers must be REPORTED as gaps. Without
    // this, a sweep that credits the whole clause is indistinguishable from
    // one that reads only the binding.
    expect(names.has('alpha')).toBe(true);
    expect(names.has('beta')).toBe(true);
    expect(names.has('unrelated')).toBe(true);
  });

  it('(15) the src containment guard decides a REPORTED name, not a bystander', () => {
    // R448, mutation M5 SURVIVED: deleting the `if "src" not in spec: return`
    // from note_members() left all 15 arms green. The reason is a fixture
    // bug, not a dead guard -- the earlier arms use a NON-src require whose
    // read property collides with a src export by NAME, and note() filters
    // that name out anyway. So the guard's decision was unobservable.
    //
    // The discriminating shape: the non-src module is the ONLY importer of the
    // name, and the name IS a src export. `h.NS_COLLIDE` where h is bound to
    // '../helpers' must NOT pin NS_COLLIDE, which a.ts really exports. Without
    // the guard, no-runtime-import drops 1 -> 0 and the sweep hides a gap that
    // no test drives.
    const { srcDir, testsDir } = fixture(
      'nonsrc-member-collide',
      { 'a.ts': 'export const NS_COLLIDE: string[] = ["a"];\n' },
      {
        't.test.ts':
          "const h = require('../helpers');\n" +
          'h.NS_COLLIDE;\n',
      }
    );
    expect(reportedNames(runSweep(srcDir, testsDir)).has('NS_COLLIDE')).toBe(true);
  });

  it('(16) a non-binding trailing pattern is not credited even when it IS an export', () => {
    // R448, mutation M6 SURVIVED twice. First because the guard decided a
    // bystander name no fixture exported. Second because my rewritten fixture
    // was still not discriminating for a subtler reason: with a
    // `const { KEPT } =` declaration in the same statement, the
    // end-anchored pattern matches `{ KEPT }` WITH OR WITHOUT the guard, so
    // the guard was never the deciding step. An arm can be non-discriminating
    // while looking like it exercises the guard, because the pattern finds a
    // VALID binding on its own.
    //
    // The shape where the guard alone decides: the `=` belongs to a MEMBER
    // ASSIGNMENT, so the last identifier before it is the property being
    // assigned -- a real and common re-export idiom:
    //
    //     exports.THING = require('../src/a')
    //
    // With the guard, `THING` is not a binding and is not credited. Without
    // it, `note('exports.THING')` credits THING and the sweep silently loses
    // the gap. THING is a genuine export of a.ts, so the difference is
    // observable.
    const { srcDir, testsDir } = fixture(
      'nonbinding-tail',
      { 'a.ts':
          'export const THING: string[] = ["t"];\n' +
          'export const OTHER: string[] = ["o"];\n' },
      {
        't.test.ts':
          "exports.THING = require('../src/a');\n",
      }
    );
    // Nothing drives OTHER either, and THING is driven only by being ASSIGNED
    // to a property -- neither is a runtime import of the export.
    const names = reportedNames(runSweep(srcDir, testsDir));
    expect(names.has('THING')).toBe(true);
    expect(names.has('OTHER')).toBe(true);
  });

  it('(17) a destructure inside a comment, and a describe-block brace, are not bindings', () => {
    // R448: the precision fix above introduced a FALSE POSITIVE on the real
    // repo -- it lost `defaultPing` (12 -> 13 gaps once combined with the
    // other loss), a symbol tests/adapter.test.ts DOES destructure and drive on
    // line 646. Two independent causes, both silent, and neither caught by the
    // mutation matrix because no fixture had the shape:
    //
    //   (a) COMMENTS ARE CODE TO THIS SWEEP. The describe block above line 646
    //       carries `const { defaultPing } =` in a `//` comment, so the
    //       end-anchored match stopped on the comment, not on the real
    //       declaration.
    //   (b) `\{[^}]*\}` NESTED ACROSS BLOCKS. With the comment text gone, the
    //       match still started at the `{` of `describe(..., () => {` and ran
    //       to the `}` of `{ defaultPing }`, because a binding list cannot
    //       contain a nested brace and the permissive pattern did not care.
    //
    // So the name ends up pinned by neither the destructuring nor by any
    // require of its own module -- the sweep reports work that is done, which
    // is the failure mode its own docstring calls worse than no sweep.
    const { srcDir, testsDir } = fixture(
      'comment-and-block-brace',
      { 'a.ts':
          'export const REAL_DESTRUCTURE: string[] = ["d"];\n' +
          'export const COMMENT_ONLY: string[] = ["c"];\n' +
          'export const NEVER_MENTIONED: string[] = ["n"];\n' },
      {
        't.test.ts':
          "describe('REAL_DESTRUCTURE (shared helper)', () => {\n" +
          "  // const { COMMENT_ONLY } = require('../src/a');\n" +
          "  /* the payload is { role: 'user' } */\n" +
          "  const { REAL_DESTRUCTURE } = require('../src/a');\n" +
          '  REAL_DESTRUCTURE;\n' +
          '});\n',
      }
    );
    const names = reportedNames(runSweep(srcDir, testsDir));
    // The real destructure is pinned...
    expect(names.has('REAL_DESTRUCTURE')).toBe(false);
    // ...the commented-out one never happened...
    expect(names.has('COMMENT_ONLY')).toBe(true);
    // ...and the untouched one is still reported.
    expect(names.has('NEVER_MENTIONED')).toBe(true);
  });
});
