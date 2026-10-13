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
      // Fixtures occasionally need a file BESIDE testsDir rather than inside
      // it -- a non-src barrel at '../support' only resolves if it is written
      // at <base>/support. path.join COLLAPSES a leading '..' TEXTUALLY, so
      // join(base, '../support/index.ts') landed OUTSIDE the fixture root
      // entirely (in /tmp, shared by every fixture) instead of beside src/.
      // Split the '..' off and step up from base, so the walk starts inside
      // the fixture and cannot leak between fixtures.
      const up = rel.startsWith('../');
      const p = up
        ? path.join(base, ...rel.split('/').slice(1))
        : path.join(testsDir, rel);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, body);
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
      { 'z.ts': 'export function iota2(): number { return 9; }\nexport function kappa2(): number { return 10; }\n' },
      {
        'z.test.ts':
          "const m = require('../src/z');\n" +
          filler + "\n" +
          "function readIota(): number { return m.iota2(); }\n" +
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
      { 'a.ts': 'export function ALPHA2(): void {}\nexport function SECRET_ALPHA2(): void {}\n',
        'b.ts': 'export function BETA2(): void {}\n' },
      {
        'r.test.ts':
          "let m = require('../src/a');\n" +
          'm.ALPHA2();\n' +
          "m = require('../src/b');\n" +
          'm.SECRET_ALPHA2();\n',
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
      { 'a.ts': 'export function ALPHA_B2(): void {}\nexport function SECRET_B2(): void {}\n',
        'b.ts': 'export function BETA_B2(): void {}\n' },
      {
        'g.test.ts':
          "let m = require('../src/a');\n" +
          'm.ALPHA_B2()\n' +
          "m = require('../src/b');\n" +
          'm.BETA_B2();\n',
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
          'export function T1(): void {}\n' +
          'export function T2(): void {}\n' +
          'export function alpha(): void {}\n' +
          'export function beta(): void {}\n' +
          'export function unrelated(): void {}\n' +
          'export function someCall(): void {}\n' },
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
          'export function THING(): void {}\n' +
          'export function OTHER(): void {}\n' },
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
          'export function REAL_DESTRUCTURE(): void {}\n' +
          'export function COMMENT_ONLY(): void {}\n' +
          'export function NEVER_MENTIONED(): void {}\n' },
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

  it('(18) a module-scope VALUE is driven by the module being loaded at all', () => {
    // R449. `export const` is only legal at module top level, so its
    // initializer runs when the module is LOADED -- no call site can be
    // required to reach it. A test that imports a DIFFERENT export from the
    // same module has therefore executed PAYLOAD3 for real, and reporting it
    // re-derives work that is already done.
    //
    // Every one of the repo's other reported gaps was this: codeBenchmarks,
    // dialogueBenchmarks, functionCallingBenchmarks, longContextBenchmarks,
    // multiTurnBenchmarks are all module-scope const arrays in files the
    // suite loads at runtime (tests/benchmarks.test.ts,
    // tests/benchmark-id-uniqueness.test.ts, tests/benchmarks-by-category.test.ts).
    const { srcDir, testsDir } = fixture(
      'value-driven-by-load',
      { 'a.ts':
          'export const PAYLOAD3: string[] = ["p"];\n' +
          'export function other3(): number { return 3; }\n' },
      {
        't.test.ts':
          "import { other3 } from '../src/a';\n" +
          'it(\'x\', () => expect(other3()).toBe(3));\n',
      }
    );
    const names = reportedNames(runSweep(srcDir, testsDir));
    expect(names.has('PAYLOAD3')).toBe(false);
  });

  it('(19) ...but only when the module is ACTUALLY loaded by a test', () => {
    // THE FALSE NEGATIVE THIS MUST NOT INTRODUCE. Nothing here loads a.ts,
    // so its initializer never runs and the value really is unbacked.
    // Without this arm a rule of "credit every export of a loaded module"
    // would be indistinguishable from the value rule above and the sweep
    // would be toothless on the whole directory.
    const { srcDir, testsDir } = fixture(
      'value-never-loaded',
      { 'a.ts':
          'export const PAYLOAD4: string[] = ["p"];\n' +
          'export function other4(): number { return 4; }\n' },
      { 't.test.ts': "it('nothing', () => expect(1).toBe(1));\n" }
    );
    expect(reportedNames(runSweep(srcDir, testsDir)).has('PAYLOAD4')).toBe(true);
  });

  it('(20) a FUNCTION in a loaded module still needs a call site', () => {
    // The other half, and the falsifier for a whole-module blanket rule.
    // authMiddleware lives in src/web/middleware/auth.ts, which IS loaded --
    // and it is reported because being loaded does not CALL it. Crediting it
    // for a load would silence the one genuine transitive-drive gap left in
    // the repo (tests drive it only by importing routes/auth).
    // a.ts IS loaded (other6 is imported from it), but loading a module does
    // not CALL called6 -- so called6 is still a genuine gap.
    const { srcDir, testsDir } = fixture(
      'callable-not-driven-by-load',
      { 'a.ts':
          'export function called6(): number { return 6; }\n' +
          'export function other6(): number { return 66; }\n' },
      {
        't.test.ts':
          "import { other6 } from '../src/a';\n" +
          'it(\'x\', () => expect(other6()).toBe(66));\n',
      }
    );
    expect(reportedNames(runSweep(srcDir, testsDir)).has('called6')).toBe(true);
    expect(reportedNames(runSweep(srcDir, testsDir)).has('other6')).toBe(false);
  });

  it('(21) a value reached through a RE-EXPORT barrel is credited to its module', () => {
    // The real repo reaches the benchmark arrays through several
    // specifiers, and a barrel is one of them. Resolution must follow the
    // barrel to the defining file, not stop at the barrel's own text.
    // As first written this arm imported VIA_BARREL DIRECTLY, so `note()`
    // credited the name off the import clause and it passed against the
    // unfixed sweep -- non-discriminating, the R447 trap. The name now
    // appears in NO import clause: only a sibling export is imported, and
    // VIA_BARREL is reachable only if the load rule follows the re-export
    // chain from index.ts to the defining a.ts.
    const { srcDir, testsDir } = fixture(
      'barrel-value',
      { 'a.ts':
          'export const VIA_BARREL: string[] = ["v"];\n' +
          'export function sibling9(): number { return 9; }\n',
        'index.ts':
          "export { VIA_BARREL, sibling9 } from './a';\n" },
      { 't.test.ts': "import { sibling9 } from '../src/index';\n" }
    );
    expect(reportedNames(runSweep(srcDir, testsDir)).has('VIA_BARREL')).toBe(false);
  });

  it('(22) a NON-src barrel that forwards into src DOES credit through it', () => {
    // R449 mutation M3 SURVIVED the first matrix: the `if "src" not in
    // cur_spec` guard in defining_file() looked load-bearing but decided
    // nothing, because note() called defining_file() only AFTER its own
    // `"src" not in spec` early return. So the walk's answer was computed
    // and then discarded for every non-src specifier, and no fixture could
    // see a difference.
    //
    // Which is wrong about the SEMANTICS, not just the coverage. Importing
    // '../support' evaluates support/index.ts, which imports src/a.ts, so
    // a.ts's module-scope initializer really does run. A non-src barrel that
    // forwards into src loads src. The fix is to record the load BEFORE the
    // containment gate: the gate governs whether a NAME is credited, and the
    // load rule asks a different question.
    //
    // With the recording after the gate (M3's version) this arm goes RED:
    // nothing under src/ is marked loaded, so the value is reported.
    const { srcDir, testsDir } = fixture(
      'nonsrc-barrel-forwarding',
      { 'a.ts': 'export const VIA_NONSRC: string[] = ["v"];\n' },
      {
        // '../support' from tests/ resolves to <base>/support, NOT
        // tests/support. The fixture helper only writes flat into testsDir,
        // so the first attempt put the barrel at tests/support and the
        // specifier resolved to a path that does not exist -- `note()` then
        // saw a non-src specifier, and the arm passed for the wrong reason.
        // It has to sit one level UP from testsDir, beside src.
        '../support/index.ts': "export { VIA_NONSRC } from '../src/a';\n",
        't.test.ts': "import { VIA_NONSRC } from '../support';\n",
      }
    );
    expect(reportedNames(runSweep(srcDir, testsDir)).has('VIA_NONSRC')).toBe(false);
  });

  it('(23) a re-export CYCLE terminates instead of walking forever', () => {
    // R449 mutation M7 SURVIVED: the cycle guard in defining_file()
    // (`cur_spec not in seen`) is load-bearing for termination and nothing
    // exercised it. Every other fixture is a straight line, so deleting the
    // guard left all 23 arms green -- while a barrel that re-exports itself
    // would hang the sweep forever. The sweep is run from a reporting tool
    // in a cron tick, so a hang here is a wedged job, not a wrong number.
    //
    // The cycle still has to answer correctly, not merely stop: neither
    // a.ts nor index.ts's own payload is reached by a direct load of the
    // cycle, so CYCLIC stays a genuine gap.
    const { srcDir, testsDir } = fixture(
      'reexport-cycle',
      { 'a.ts':
          'export const CYCLIC: string[] = ["c"];\\n' +
          "export { VIA_LOOP } from './index';\\n",
        'index.ts':
          "export { CYCLIC } from './a';\\n" +
          "export { VIA_LOOP } from './a';\\n" },
      { 't.test.ts': "import { VIA_LOOP } from '../src/index';\\n" }
    );
    // Must return at all -- a hang is the failure this arm exists to catch.
    expect(reportedNames(runSweep(srcDir, testsDir)).has('CYCLIC')).toBe(true);
  });

  it('(24) a module-scope VALUE reached ONLY by an `import type` clause is still reported', () => {
    // TypeScript ERASES `import type`: it emits no require and no load, so
    // the module is never evaluated and its module-scope initializer never
    // runs. The sweep's ES arm matches
    //     import\\s+([\\s\\S]*?)\\s+from\\s+'([^']*)'
    // which swallows `import type { T } from '...'` whole, and note() records
    // the LOAD before it gates on names -- so the erased import is recorded
    // as a load and the load rule credits every module-scope value the
    // module declares.
    //
    // In the real repo that silently credits DEFAULT_API_TIMEOUT_MS and three
    // benchmark arrays behind type-only clauses. Those are masked today only
    // because other suites happen to import the same modules for real; the
    // instrument's answer is right by luck, not by rule.
    //
    // As first written this arm also imported a sibling for real, so the
    // module WAS loaded and the value correctly credited -- the arm passed
    // against the unfixed sweep, the R447 trap. Nothing here loads a.ts.
    const { srcDir, testsDir } = fixture(
      'type-only-import-is-not-a-load',
      { 'a.ts':
          'export interface T24 { id: string }\n' +
          'export const TYPE_ONLY_PAYLOAD: string[] = ["p"];\n' },
      {
        't.test.ts':
          "import type { T24 } from '../src/a';\n" +
          'const v: T24 = { id: "x" };\n' +
          'it(\'x\', () => expect(v.id).toBe("x"));\n',
      }
    );
    expect(reportedNames(runSweep(srcDir, testsDir)).has('TYPE_ONLY_PAYLOAD')).toBe(true);
  });

  it('(25) a REAL import in the same file still credits its value after (24)', () => {
    // The control arm for (24), and the falsifier for over-correcting it.
    // Blanket-blocking every clause in a file that also contains a type-only
    // import would make (24) pass for the wrong reason -- and would hide real
    // gaps, which is the direction that costs the next tick a rebuild.
    const { srcDir, testsDir } = fixture(
      'real-import-alongside-type-only',
      { 'a.ts':
          'export interface T25 { id: string }\n' +
          'export const REALLY_LOADED: string[] = ["p"];\n' +
          'export function sibling25(): number { return 25; }\n' },
      {
        't.test.ts':
          "import type { T25 } from '../src/a';\n" +
          "import { sibling25 } from '../src/a';\n" +
          'const v: T25 = { id: "x" };\n' +
          'it(\'x\', () => expect(sibling25() + v.id.length).toBe(27));\n',
      }
    );
    expect(reportedNames(runSweep(srcDir, testsDir)).has('REALLY_LOADED')).toBe(false);
  });

  it('(26) an INLINE `type` specifier is erased but its siblings still load the module', () => {
    // M2 SURVIVED the first matrix: widening the guard from "clause starts
    // with `type`" to "clause contains ANY type specifier" left all 26 arms
    // green, because every fixture so far separates the two spellings into
    // different clauses. `import { type A, B } from './m'` is ONE clause: B is
    // a real runtime import and its module-scope values really do run, so
    // blanket-skipping the clause hides a value that is genuinely covered --
    // the dangerous direction, which sends the next tick to rebuild work that
    // is already done.
    //
    // The erased name is checked too. `type A` must not be credited as a NAME
    // either: an interface is not a value, so crediting it would make
    // collect_exports' own blind spot invisible.
    const { srcDir, testsDir } = fixture(
      'inline-type-specifier',
      { 'a.ts':
          'export interface T26 { id: string }\n' +
          'export const SIBLING_LOADED: string[] = ["p"];\n' +
          'export function real26(): number { return 26; }\n' },
      {
        't.test.ts':
          "import { type T26, real26 } from '../src/a';\n" +
          'const v: T26 = { id: "x" };\n' +
          'it(\'x\', () => expect(real26() + v.id.length).toBe(27));\n',
      }
    );
    const names = reportedNames(runSweep(srcDir, testsDir));
    expect(names.has('SIBLING_LOADED')).toBe(false);
    // T26 is an `export interface`, which collect_exports never collected, so
    // it is not a reportable name -- asserted here to pin WHY it is absent.
    expect(names.has('T26')).toBe(false);
  });

  it('(27) the type-specifier strip works on a MULTI-LINE clause', () => {
    // M3's mirror. The inline specifier can sit on its own line inside a brace
    // list, and a strip anchored to a single line lets the name through. Here
    // `type T27` opens the clause and `real27` closes it, so both the guard and
    // the strip have to survive a newline between `type` and its name.
    //
    // NOTE on what this arm does NOT pin. Replacing the blanking with deletion
    // (M3) still leaves all 28 arms green, and that is correct rather than a
    // gap: `note()` only ever scans the clause for identifiers, never slices it,
    // so an offset shift changes nothing. Length preservation here is
    // belt-and-braces, NOT load-bearing. A comment claiming this arm kills M3
    // would be an inventory of an intention the suite does not have (R450) --
    // see _without_type_specifiers, whose docstring states the same fact.
    // M3 therefore counts as a SURVIVING mutation explained by artefact, not
    // as a suite gap to close.
    const { srcDir, testsDir } = fixture(
      'multiline-type-specifier',
      { 'a.ts':
          'export interface T27 { id: string }\n' +
          'export const MULTILINE_LOADED: string[] = ["p"];\n' +
          'export function real27(): number { return 27; }\n' },
      {
        't.test.ts':
          "import {\n  type T27,\n  real27,\n} from '../src/a';\n" +
          'const v: T27 = { id: "x" };\n' +
          'it(\'x\', () => expect(real27() + v.id.length).toBe(28));\n',
      }
    );
    expect(reportedNames(runSweep(srcDir, testsDir)).has('MULTILINE_LOADED')).toBe(false);
  });

  it('(29) `await import(...)` is a runtime LOAD, so the module-scope value is driven', () => {
    // The third erased-vs-runtime boundary, after `import type` and the type
    // SPECIFIER. A dynamic `import('...')` inside an expression EMITS a real
    // require and evaluates the module, exactly as a static clause does -- so
    // crediting it is correct. Before this arm the sweep's clause scanner
    // matched only `import ... from '...'` and `require('...')`, so both names
    // below were reported: the module-scope value and the function the test
    // genuinely drives. That is the expensive direction -- the next tick
    // rebuilds work that already exists.
    const { srcDir, testsDir } = fixture(
      'dynamic-import-loads',
      { 'a.ts':
          'export const DYN_LOADED: string[] = ["p"];\n' +
          'export function dyn29(): number { return 29; }\n' },
      {
        't.test.ts':
          "it('x', async () => {\n" +
          "  const mod = await import('../src/a');\n" +
          '  expect(mod.dyn29()).toBe(29);\n' +
          '});\n',
      }
    );
    // The LOAD rule: evaluating a.ts ran the initializer of DYN_LOADED.
    expect(reportedNames(runSweep(srcDir, testsDir)).has('DYN_LOADED')).toBe(false);
    // The member read: `mod.dyn29()` is a real read of a real export, the same
    // shape the static `m = require(...)` arm already handles.
    expect(reportedNames(runSweep(srcDir, testsDir)).has('dyn29')).toBe(false);
  });

  it('(31) a BARE `await import(...)` still loads the module, with no binding to credit', () => {
    // Arm 29 alone could not fail this half of the rule. Its fixture reads a
    // member off the result, and the member arm credits the name through a
    // DIFFERENT path, so deleting `loaded_modules.add(f)` from the
    // dynamic-import arm left arm 29 green -- measured, M3 SURVIVED. The
    // load is a separate claim from the member read, and it needs its own
    // fixture where the binding is ABSENT, leaving nothing else to credit the
    // module-scope value. Without this arm the sweep could drop every
    // dynamic-import load and only a test that never binds would notice.
    const { srcDir, testsDir } = fixture(
      'dynamic-import-bare-load',
      { 'a.ts':
          'export const DYN_LOADED: string[] = ["p"];\n' +
          'export function dyn29(): number { return 29; }\n' },
      {
        't.test.ts':
          "it('x', async () => {\n" +
          "  await import('../src/a');\n" +
          '});\n',
      }
    );
    const names = reportedNames(runSweep(srcDir, testsDir));
    // The module-scope initializer ran when the specifier was evaluated.
    expect(names.has('DYN_LOADED')).toBe(false);
    // The FUNCTION is not called and not imported off a binding -- a bare
    // load drives module-scope VALUES only, which is exactly the distinction
    // arm 20 draws for the static clause.
    expect(names.has('dyn29')).toBe(true);
  });

  it('(32) a DESTRUCTURED dynamic import credits the destructured names', () => {
    // `const { dyn29 } = await import('..')` binds a brace list, not an
    // identifier, and a call is not interchangeable with a load. The
    // identifier path (`const mod = await import('..')`) is covered by arm 29;
    // nothing pinned the brace path, and the binding is read backwards from
    // `=` for the same reason note_binding() does it.
    const { srcDir, testsDir } = fixture(
      'dynamic-import-destructure',
      { 'a.ts':
          'export const DYN_LOADED: string[] = ["p"];\n' +
          'export function dyn29(): number { return 29; }\n' },
      {
        't.test.ts':
          "it('x', async () => {\n" +
          "  const { dyn29 } = await import('../src/a');\n" +
          '  expect(dyn29()).toBe(29);\n' +
          '});\n',
      }
    );
    const names = reportedNames(runSweep(srcDir, testsDir));
    // The module was loaded, so its module-scope value ran.
    expect(names.has('DYN_LOADED')).toBe(false);
    // And the destructured name is a real binding, so calling it is a call.
    expect(names.has('dyn29')).toBe(false);
  });

  it('(33) the `type` alternative of the dynamic-import type gate has no input to reach it', () => {
    // The gate _TYPE_ONLY_DYNAMIC once carried `(?:type|typeof)`, and deleting
    // the `type` alternative moved no arm (measured, M2 SURVIVED) -- a guard
    // nothing can reach and nothing can fail. Two independent reasons it is
    // unreachable, and this arm pins BOTH so the alternative cannot come back
    // as an untested second opinion.
    //
    // (1) `type import('..')` is a SYNTAX ERROR in expression position: TS
    //     admits `type` in an import only inside a type position (TS1361). So
    //     no compiling test can present it to the scanner.
    // (2) The scanner's own `(?<!typeof\s)` lookahead removes `typeof` sites
    //     BEFORE the gate is consulted, so even the legal `typeof` shape
    //     reaches the gate only if that lookahead is changed. The gate is
    //     defence in depth, not a second opinion on today's input.
    //
    // The census that motivated this: 46 dynamic-import sites across
    // tests/ and src/, ZERO of them prefixed by a `type` token.
    const { srcDir, testsDir } = fixture(
      'dynamic-import-type-alt-unreachable',
      { 'a.ts':
          'export const TYPEONLY_NOT_LOADED: string[] = ["p"];\n' +
          'export function untouched33(): number { return 33; }\n' },
      {
        't.test.ts':
          // The only legal type-position dynamic import. Single quotes: the
          // scanner matches '...' only, and a double-quoted specifier would
          // make this arm pass for the wrong reason -- see arm 34.
          "type Mod33 = typeof import('../src/a');\n" +
          'it("x", () => expect(untouched33()).toBe(33));\n',
      }
    );
    const names = reportedNames(runSweep(srcDir, testsDir));
    expect(names.has('TYPEONLY_NOT_LOADED')).toBe(true);
    expect(names.has('untouched33')).toBe(true);
  });

  it('(34) a DOUBLE-QUOTED specifier is a site the scanner cannot see', () => {
    // A defect found while pinning arm 30, recorded here rather than fixed in
    // the scanner because the scanner's quoting convention is a deliberate
    // narrowing: every other clause regex in this file matches '...' only.
    // That is consistent, but it makes a fixture written with "..." silently
    // UNREACHABLE -- arm 30 shipped that way and was green for a reason that
    // had nothing to do with the type-position rule it claims to test.
    //
    // The measurable statement: with a double-quoted `typeof import("..")`,
    // the scanner's single-quoted regex cannot match it, so the module is not
    // credited -- which is the CORRECT outcome here. The arm below therefore
    // passes under the current implementation AND under an implementation
    // that also handled double quotes, so it cannot pin the difference.
    // What it DOES pin is that the gap is invisible rather than asserted: if
    // a future change starts crediting double-quoted imports, this arm goes
    // red and says so.
    const { srcDir, testsDir } = fixture(
      'double-quoted-specifier',
      { 'a.ts':
          'export const DQUOTE_NOT_LOADED: string[] = ["p"];\n' +
          'export function dq34(): number { return 34; }\n' },
      {
        't.test.ts':
          'type Mod34 = typeof import("../src/a");\n' +
          'it("x", () => expect(dq34()).toBe(34));\n',
      }
    );
    const names = reportedNames(runSweep(srcDir, testsDir));
    expect(names.has('DQUOTE_NOT_LOADED')).toBe(true);
    expect(names.has('dq34')).toBe(true);
  });

  it('(30) `typeof import(...)` is a TYPE position, so it loads nothing', () => {
    // The falsifier for arm 29. A sweep that credits every `import(` substring
    // passes (29) and silently drops a whole class of gaps: `typeof import(...)`
    // is erased by TypeScript exactly like `import type` is, and names a module
    // the test NEVER evaluates. If the dynamic-import arm had no type-position
    // counterpart, this suite could not tell credit from over-credit -- the
    // same gap R447 found in the exported-state arm.
    //
    // REQUOTED from `import("../src/a")` to `import('../src/a')`. The
    // double-quoted form is unreachable by the scanner's single-quoted regex,
    // so the original arm asserted the type-position rule while never reaching
    // the code that implements it -- measured: deleting the entire
    // dynamic-import arm left arm 30 green. With single quotes the arm is
    // load-bearing: removing the `(?<!typeof\s)` lookahead makes it RED.
    const { srcDir, testsDir } = fixture(
      'typeof-import-is-type-only',
      { 'a.ts':
          'export const TYPEONLY_NOT_LOADED: string[] = ["p"];\n' +
          'export function untouched30(): number { return 30; }\n' },
      {
        't.test.ts':
          "type Mod30 = typeof import('../src/a');\n" +
          'it("x", () => expect(untouched30()).toBe(30));\n',
      }
    );
    const names = reportedNames(runSweep(srcDir, testsDir));
    // Nothing loaded a.ts, so its module-scope value is a genuine gap.
    expect(names.has('TYPEONLY_NOT_LOADED')).toBe(true);
    // The function is neither called nor imported -> also a gap.
    expect(names.has('untouched30')).toBe(true);
  });
});
