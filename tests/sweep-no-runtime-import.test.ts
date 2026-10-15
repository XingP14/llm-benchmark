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

// Drives strip_comments() DIRECTLY, one layer below the verdict the rest of
// this file asserts on.
//
// WHY IT EXISTS. Arms 45/46/47/48 all assert the VERDICT, which is the right
// level for "does the sweep report a gap that does not exist". But three
// mutants (M2/M6/M7) survived all of them while still corrupting the parse
// text: the stripper copies a regex literal byte for byte, and no verdict can
// see a byte that only matters to code no pattern reads. So the copy itself
// needed an observable, and the only place it is observable is the string the
// stripper returns.
//
// It is a SUBPROCESS, like runSweep, rather than a read of the source: reading
// the script's text would only pin the spelling, not the behaviour.
//
// THE TRANSPORT TOOK TWO FAILURES to get right, and both were transport bugs
// rather than stripper bugs:
//   1. re.escape over-escapes -- it escapes SPACES and every non-word char,
//      so `out.length === src.length` compared two ESCAPED forms and the
//      length assertion passed by coincidence. Length is the whole contract
//      here, so this silently gutted it.
//   2. JSON looks sufficient and is not, for the same reason: its length is
//      the length of a PAYLOAD, not of the bytes.
//
// So the value travels as base64 of the UTF-8 bytes -- a transport that cannot
// alter the byte count or mangle a backslash, an escape, or a newline.
function stripComments(input: string): string {
  const out = execFileSync(
    'python3',
    [
      '-c',
      [
        'import base64, importlib.util, sys',
        `spec = importlib.util.spec_from_file_location("sw", ${JSON.stringify(SCRIPT)})`,
        'mod = importlib.util.module_from_spec(spec)',
        'spec.loader.exec_module(mod)',
        'sys.stdout.write(base64.b64encode(mod.strip_comments(sys.stdin.read()).encode()).decode())'
      ].join('\n')
    ],
    { input, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
  );
  return Buffer.from(out, 'base64').toString('utf8');
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

  // R455: a SUBSTITUTED module is not a LOADED module.
  //
  // `jest.mock('../src/a', factory)` writes the module REGISTRY before any
  // import resolves, so the importer receives the factory object and the real
  // module-scope initializer NEVER RUNS. That is the same erasure `import type`
  // performs (arm 30's class), expressed by a registry write instead of by
  // syntax -- and the sweep had no rule for it: measured over the corpus,
  // `jest.mock` appears 50 times across 13 test files and `grep -c mock` in
  // scripts/sweep-no-runtime-import.py was ZERO.
  //
  // The import clause is what makes this sharp. A test that BOTH imports and
  // mocks the same module is the ordinary jest idiom, and the clause is real
  // source text; a sweep that reads text credits it. Pre-fix this fixture
  // reported `no-runtime-import=0` -- both exports declared pinned while
  // neither real one was ever evaluated. The zero was the defect.
  it('(35) a module the test jest.mock()s is SUBSTITUTED, so it loads nothing', () => {
    const { srcDir, testsDir } = fixture(
      'jest-mock-is-substitution',
      {
        'a.ts':
          'export const SUBSTITUTED_VALUE = ["real-initializer"];\n' +
          'export function getAll(): string[] { return SUBSTITUTED_VALUE; }\n',
      },
      {
        'a.test.ts':
          "import { getAll } from '../src/a';\n" +
          "jest.mock('../src/a', () => ({ getAll: () => ['fixture'] }));\n" +
          "it('x', () => expect(getAll()).toEqual(['fixture']));\n",
      }
    );
    const names = reportedNames(runSweep(srcDir, testsDir));
    // The module-scope value is the load-rule subject: the substitution means
    // the initializer never ran, so it is a genuine gap.
    expect(names.has('SUBSTITUTED_VALUE')).toBe(true);
    // And the NAME: the clause names the real module, but `getAll` as the
    // importer sees it is the factory's stub. A gate on the load rule alone
    // would still report this name as pinned.
    expect(names.has('getAll')).toBe(true);
  });

  it('(36) jest.requireActual() is a REAL load and keeps the credit', () => {
    // The falsifier for arm 35, and the reason the gate cannot be a blanket
    // "a jest.mock in this file suppresses this module". `requireActual`
    // bypasses the registry and evaluates the real module, so a file that
    // mocks AND requireActuals the same specifier genuinely loads it.
    // tests/web/evaluations-catch-log.test.ts is exactly this shape in the repo
    // -- without the escape hatch the fix would have reported a shipped
    // suite's coverage as a gap, which is the over-report direction that
    // sends the next tick to rebuild suites that already exist.
    const { srcDir, testsDir } = fixture(
      'jest-require-actual-is-real',
      {
        'a.ts':
          'export const ACTUAL_VALUE = ["real-initializer"];\n' +
          'export function getAll(): string[] { return ACTUAL_VALUE; }\n',
      },
      {
        'a.test.ts':
          "import { getAll } from '../src/a';\n" +
          "jest.mock('../src/a', () => {\n" +
          "  const actual = jest.requireActual('../src/a');\n" +
          "  return { getAll: () => actual.getAll() };\n" +
          '});\n' +
          "it('x', () => expect(getAll()).toEqual(['real-initializer']));\n",
      }
    );
    const names = reportedNames(runSweep(srcDir, testsDir));
    expect(names.has('ACTUAL_VALUE')).toBe(false);
    expect(names.has('getAll')).toBe(false);
  });

  it('(37) the gate is per FILE, so one file\'s jest.mock cannot silence another', () => {
    // The leak the rebinding guards. `substituted` is rebound once per test
    // file inside the walk; if it were accumulated (`update`) or kept in the
    // enclosing scope, a file that mocks a module would suppress that module's
    // credit for EVERY LATER FILE in the walk -- and os.walk order is not
    // alphabetical-stable enough to rely on, so the result would change with
    // the filesystem. Two files, one mocking and one really importing.
    const { srcDir, testsDir } = fixture(
      'substitution-does-not-leak',
      { 'a.ts': 'export function reallyLoaded(): number { return 37; }\n' },
      {
        // MOCKED-ONE, by name and by sort order first, so an accumulating gate
        // is guaranteed to be populated before the file that needs it.
        'mocked.ts': "jest.mock('../src/a', () => ({ reallyLoaded: () => 0 }));\n",
        'zz-real.ts': "import { reallyLoaded } from '../src/a';\nit('x', () => expect(reallyLoaded()).toBe(37));\n",
      }
    );
    const names = reportedNames(runSweep(srcDir, testsDir));
    expect(names.has('reallyLoaded')).toBe(false);
  });

  it('(38) a `default` export is a SUBJECT, so an undriven one is reported', () => {
    // Before this, `export default router;` contributed NO name at all: the
    // subject set was built from named forms only, so the whole default-export
    // class was invisible -- and invisible in the direction that costs work,
    // because nothing in the output could ever have suggested the gap.
    const { srcDir, testsDir } = fixture(
      'default-is-a-subject',
      { 'r.ts': 'const router = 1;\nexport default router;\n' },
      { 'x.test.ts': "it('nothing', () => expect(1).toBe(1));\n" }
    );
    const names = reportedNames(runSweep(srcDir, testsDir));
    expect([...names].some((n) => n.endsWith('::default'))).toBe(true);
    // PATH-QUALIFIED, because `default` is not a unique name: five modules in
    // the real repo export one, and a reader who cannot tell the five lines
    // apart cannot act on any of them.
    expect([...names].find((n) => n.endsWith('::default'))).toMatch(/r\.ts::default$/);
  });

  it('(39) a default-POSITION import credits the default', () => {
    // `import router from '../src/r'` and `import * as m` are different
    // statements; only the first consumes the default. Asserting the RELATION
    // -- driven here, not driven there -- rather than a count, because a count
    // would also pass if the credit were attributed to the wrong module.
    const { srcDir, testsDir } = fixture(
      'default-position-credit',
      {
        'r.ts': 'const router = 1;\nexport default router;\n',
        's.ts': 'const other = 2;\nexport default other;\n',
      },
      { 'x.test.ts': "import router from '../src/r';\nit('x', () => expect(router).toBe(1));\n" }
    );
    const names = reportedNames(runSweep(srcDir, testsDir));
    expect([...names].some((n) => n.endsWith('/r.ts::default'))).toBe(false);
    expect([...names].some((n) => n.endsWith('/s.ts::default'))).toBe(true);
  });

  it('(40) a `.default` member read credits the default', () => {
    // The other consumption shape. Both are needed: the static clause arm and
    // the member arm are separate code paths, and crediting only the static
    // one would leave every `(await import('./m')).default` site invisible --
    // which is the form tests/reporter-scorer-nullish-fallback-branches.test.ts
    // actually uses for three of the four route modules.
    const { srcDir, testsDir } = fixture(
      'default-member-credit',
      { 'r.ts': 'const router = 1;\nexport default router;\n' },
      { 'x.test.ts': "const r = (await import('../src/r')).default;\nit('x', () => expect(r).toBe(1));\n" }
    );
    expect([...reportedNames(runSweep(srcDir, testsDir))].some((n) => n.endsWith('/r.ts::default'))).toBe(false);
  });

  it('(41) one module\'s default does NOT silence its siblings', () => {
    // THE collision arm, and the falsifier for the obvious fix. Keying the
    // subject on the bare name `default` credits every module the moment any
    // one is driven -- here all four route modules bind the local name
    // `router`, so a name-keyed design both collides on that shared name AND
    // silences three genuinely undriven modules. The assertion is per PATH, so
    // a global credit cannot satisfy it.
    const { srcDir, testsDir } = fixture(
      'default-does-not-leak',
      {
        'driven.ts': 'const router = 1;\nexport default router;\n',
        'orphan-a.ts': 'const router = 2;\nexport default router;\n',
        'orphan-b.ts': 'const router = 3;\nexport default router;\n',
      },
      { 'x.test.ts': "import router from '../src/driven';\nit('x', () => expect(router).toBe(1));\n" }
    );
    const names = reportedNames(runSweep(srcDir, testsDir));
    expect([...names].some((n) => n.endsWith('/driven.ts::default'))).toBe(false);
    expect([...names].some((n) => n.endsWith('/orphan-a.ts::default'))).toBe(true);
    expect([...names].some((n) => n.endsWith('/orphan-b.ts::default'))).toBe(true);
    // And the local binding name is NOT a subject: crediting `router` would
    // report one gap for three modules that are all accounted for by path.
    expect(names.has('router')).toBe(false);
  });

  it('(38b) an ANONYMOUS default is not a subject at all', () => {
    // The over-claim this rule is scoped against. `export default function f()`
    // is a function DECLARATION: evaluating the module does not CALL it, so
    // the load rule cannot credit it the way it credits a module-scope VALUE,
    // and crediting it would assert something the sweep has not measured. The
    // corpus has 0 anonymous sites, so nothing on today's input depends on it.
    //
    // The FIRST version of this arm paired the anonymous default with a test
    // that IMPORTED it, and asserted only that it was not reported. Mutation
    // M6 -- widening the subject to every `export default` -- left the arm
    // GREEN: a widened subject still credits the same driven module, so
    // "not reported" cannot tell a narrow subject from a wide one. The claim
    // needs an UNDRIVEN anonymous default: if it is not a subject at all, it
    // stays absent whether or not a test imports it. The second assertion is
    // the falsifier; the first is kept because it is the real-world case.
    const { srcDir, testsDir } = fixture(
      'anonymous-default-not-credited',
      { 'r.ts': 'export default function makeRouter(): number { return 1; }\n' },
      { 'x.test.ts': "import makeRouter from '../src/r';\nit('x', () => expect(makeRouter()).toBe(1));\n" }
    );
    const names = reportedNames(runSweep(srcDir, testsDir));
    expect([...names].some((n) => n.endsWith('::default'))).toBe(false);

    const undriven = fixture(
      'anonymous-default-undriven',
      { 'r.ts': 'export default function makeRouter(): number { return 1; }\n' },
      { 'x.test.ts': "it('nothing', () => expect(1).toBe(1));\n" }
    );
    // Zero subjects, so nothing at all is reported -- which is exactly what a
    // NAMED default in the same fixture WOULD be, and is asserted below.
    expect([...reportedNames(runSweep(undriven.srcDir, undriven.testsDir))].some((n) => n.endsWith('::default'))).toBe(false);

    const control = fixture(
      'named-default-control',
      { 'r.ts': 'const router = 1;\nexport default router;\n' },
      { 'x.test.ts': "it('nothing', () => expect(1).toBe(1));\n" }
    );
    expect([...reportedNames(runSweep(control.srcDir, control.testsDir))].some((n) => n.endsWith('::default'))).toBe(true);
  });

  it('(42) a default reached THROUGH a non-src barrel still credits', () => {
    // The falsifier for the containment gate, which mutation M7 showed was
    // unfalsifiable until this arm existed: the original `if "src" in spec`
    // filter left every arm GREEN, because nothing in the corpus default-
    // imports a non-src module.
    //
    // And the gate turns out not merely unfalsifiable but WRONG. A barrel
    // outside src that forwards a default (`export { default } from '../src/r'`)
    // is a real consumer of that default, and `defining_file` already follows
    // barrels through non-src segments precisely so a LOAD is not miscounted.
    // Spelling-gating it out contradicted the instrument's own load rule in one
    // place to satisfy none in another. The gate is therefore on the RESOLVED
    // path, and this arm -- plus the negative half below -- pins both
    // directions: forwarded defaults credit, unresolvable ones do not.
    const { srcDir, testsDir } = fixture(
      'default-through-non-src-barrel',
      { 'w/r.ts': 'const router = 1;\nexport default router;\n' },
      {
        '../support/barrel.ts': "export { default } from '../src/w/r';\n",
        'x.test.ts': "import router from '../support/barrel';\nit('x', () => expect(router).toBe(1));\n",
      }
    );
    expect([...reportedNames(runSweep(srcDir, testsDir))].some((n) => n.endsWith('/w/r.ts::default'))).toBe(false);

    // The second half pins that the barrel case is NOT bought by crediting
    // every default a test mentions. Two src modules, one consumed directly
    // and one reached through the barrel; the direct one must be credited and
    // the barrel-reached one too, while a THIRD src module neither mentions
    // stays reported. That is the relation -- credit is per resolved path --
    // and a global `default` key cannot satisfy it.
    const selective = fixture(
      'default-credit-is-per-path',
      {
        'direct.ts': 'const router = 1;\nexport default router;\n',
        'forwarded.ts': 'const router = 2;\nexport default router;\n',
        'orphan.ts': 'const router = 3;\nexport default router;\n',
      },
      {
        '../support/barrel.ts': "export { default } from '../src/forwarded';\n",
        'x.test.ts':
          "import direct from '../src/direct';\n" +
          "import forwarded from '../support/barrel';\n" +
          "it('x', () => expect(direct).toBe(1));\n",
      }
    );
    const names = reportedNames(runSweep(selective.srcDir, selective.testsDir));
    expect([...names].some((n) => n.endsWith('/direct.ts::default'))).toBe(false);
    expect([...names].some((n) => n.endsWith('/forwarded.ts::default'))).toBe(false);
    expect([...names].some((n) => n.endsWith('/orphan.ts::default'))).toBe(true);
  });

  it('(43) an INDENTED `export default` is not a declaration', () => {
    // The falsifier for the column-0 anchor, which mutation M8 showed was
    // unpinned: removing `^` left every arm green. `export` is only legal at
    // module top level in TypeScript, so an indented match is a string, a
    // comment or dead text -- and crediting it would invent a subject for a
    // module that declares nothing. Four shapes distinguish anchored from
    // unanchored (measured), and this arm pins the two that a real file
    // plausibly contains; the template literal is the one that would survive a
    // comment stripper, since the stripper preserves string bodies verbatim.
    const literal = fixture(
      'indented-default-in-template',
      { 'r.ts': 'const real = 1;\nconst doc = `\n  export default fake;\n`;\nexport default real;\n' },
      { 'x.test.ts': "it('nothing', () => expect(1).toBe(1));\n" }
    );
    const litNames = reportedNames(runSweep(literal.srcDir, literal.testsDir));
    // The REAL declaration is a subject, and it is reported exactly once --
    // an unanchored match adds `fake` as a second, fabricated subject. The
    // path is matched by SUFFIX, not equality: fixtures live in a tmpdir, so
    // `relpath` against REPO yields a path that begins with `../../` and an
    // equality assertion on the bare filename fails for a reason that has
    // nothing to do with the anchor under test.
    const litDefaults = [...litNames].filter((n) => n.endsWith('::default'));
    expect(litDefaults).toHaveLength(1);
    expect(litDefaults[0].endsWith('src/r.ts::default')).toBe(true);
    expect(litNames.has('fake')).toBe(false);

    const commented = fixture(
      'indented-default-in-comment',
      { 'r.ts': 'export const real = 1;\n/*\n  export default commented;\n*/\n' },
      { 'x.test.ts': "it('nothing', () => expect(1).toBe(1));\n" }
    );
    expect([...reportedNames(runSweep(commented.srcDir, commented.testsDir))].filter((n) => n.endsWith('::default'))).toEqual([]);
  });

  it('(44) a regex literal holding a quote does NOT reopen a string that swallows every comment below it', () => {
    // A `'` or `"` inside a REGEX LITERAL is not a string opener, but the
    // stripper scanned for a closer without bounding the search to the line,
    // so `/a'b/` opened a "string" that ran to the next `'` anywhere in the
    // file. Every `//` comment inside that span survived stripping VERBATIM --
    // so a commented-out binding below it read as a REAL import.
    //
    // The direction matters. Arm 17 already pins that a comment destructure is
    // not a binding, but its fixture puts the comment FIRST, where nothing has
    // swallowed it. This arm orders the file the other way: the regex opens
    // the hole, the comment sits inside it. GHOST is a real src export that
    // NO test drives; if it is reported missing, the hole is closed, and if it
    // is credited, the sweep is calling a comment an import -- the
    // false-negative direction, which hides the gap the tool exists to report.
    //
    // 251 regex literals in this repo's tests/ hold a quote character, so the
    // shape is not exotic; whether it hides anything on TODAY's corpus is
    // recorded separately as a measurement rather than assumed either way.
    const ghost = fixture(
      'regex-quote-swallows-comments',
      { 'a.ts': 'export function doThing() { return 1; }\n', 'b.ts': 'export const GHOST = 3;\n' },
      {
        'x.test.ts': [
          "const stripper = /a'b/;",
          "// const { GHOST } = require('../src/b');",
          "import { doThing } from '../src/a';",
          "it('drives the real one', () => { doThing(); });",
          ''
        ].join('\n')
      }
    );
    const names = reportedNames(runSweep(ghost.srcDir, ghost.testsDir));
    // The comment never happened, so GHOST is a REAL gap ...
    expect(names.has('GHOST')).toBe(true);
    // ... and the genuine import on the line BELOW the hole is still credited.
    expect(names.has('doThing')).toBe(false);

    // The control: same file WITHOUT the regex. It must report identically, so
    // the assertion above cannot pass merely because the fixture is broken --
    // if the regex were the only thing driving GHOST into the report, deleting
    // it would change the result.
    const control = fixture(
      'regex-quote-control',
      { 'a.ts': 'export function doThing() { return 1; }\n', 'b.ts': 'export const GHOST = 3;\n' },
      {
        'x.test.ts': [
          "const stripper = /ab/;",
          "// const { GHOST } = require('../src/b');",
          "import { doThing } from '../src/a';",
          "it('drives the real one', () => { doThing(); });",
          ''
        ].join('\n')
      }
    );
    const controlNames = reportedNames(runSweep(control.srcDir, control.testsDir));
    expect(controlNames.has('GHOST')).toBe(true);
    expect(controlNames.has('doThing')).toBe(false);
    expect([...names].sort()).toEqual([...controlNames].sort());
  });

  // --- R464 ---------------------------------------------------------------
  // Arm 44 closed ONE of the three regex shapes. The same lexer rule has two
  // more, and both erase CODE rather than only failing to strip it, so they
  // are a different failure with a different direction:
  //
  //   arm 44's shape  regex HOLDS A QUOTE   -> unterminated string -> comments
  //                                          SURVIVE stripping -> a comment is
  //                                          read as an import -> FALSE
  //                                          NEGATIVE (hides a real gap).
  //   R464's shapes   regex HOLDS // or /* -> the comment branch fires
  //                                          INSIDE the literal -> real code is
  //                                          BLANKED -> FALSE POSITIVE (the
  //                                          sweep reports a gap that does not
  //                                          exist, sending the next tick to
  //                                          rebuild suites already written).
  //
  // The direction flip is why these arms assert the OPPOSITE of arm 44's:
  // here the erased symbol must APPEAR in the report, and the genuinely
  // imported one must stay out of it.

  it('(45) a regex literal holding an UNCLOSED /* is CODE, not a block comment', () => {
    // `/[/*]/g` is the standard strip-comments idiom, and it is in this repo's
    // OWN tests (8 files carry the multi-line variant). The shipped stripper
    // sees the `/*` inside the character class and opens a block comment
    // there. This fixture's literal has NO `*/` -- so the block comment never
    // closes and **the rest of the file is blanked**, including every import
    // and require below it. The whole file's coverage claim evaporates and
    // the sweep reports every export as having no runtime import.
    //
    // This is the shape that matters. My first version of this arm used the
    // CLOSED variant (`/[/*][\s\S]*?\*/g`), which erases only the tail of the
    // literal's own line, passed against the UNFIXED script, and was a false
    // green: the damage is confined to a line that holds no binding. The
    // severity of a lexer bug lives in how far the erasure REACHES, not in
    // whether an erasure happens at all -- so the arm has to place the symbol
    // at the far end of the file and prove it survives.
    const f = fixture(
      'regex-block-comment-swallow',
      { 'a.ts': 'export function real() { return 1; }\n', 'b.ts': 'export const GONE = 2;\n' },
      {
        'x.test.ts': [
          "const strip = /[/*]/g;",
          "it('drives them', () => { real(); GONE; });",
          '',
          '// a real comment, well below the literal',
          '',
          "import { real } from '../src/a';",
          "const { GONE } = require('../src/b');",
          ''
        ].join('\n')
      }
    );
    const names = reportedNames(runSweep(f.srcDir, f.testsDir));
    // Both are imported for real. If the literal swallowed the file, the sweep
    // reports gaps that do not exist.
    expect(names.has('GONE')).toBe(false);
    expect(names.has('real')).toBe(false);

    // The control: the same file with a literal that cannot hold a comment.
    // Reported identically, so the assertions above are not vacuous.
    const control = fixture(
      'regex-block-comment-control',
      { 'a.ts': 'export function real() { return 1; }\n', 'b.ts': 'export const GONE = 2;\n' },
      {
        'x.test.ts': [
          "const strip = /[ab]/g;",
          "it('drives them', () => { real(); GONE; });",
          '',
          '// a real comment, well below the literal',
          '',
          "import { real } from '../src/a';",
          "const { GONE } = require('../src/b');",
          ''
        ].join('\n')
      }
    );
    const controlNames = reportedNames(runSweep(control.srcDir, control.testsDir));
    expect([...names].sort()).toEqual([...controlNames].sort());
  });

  it('(46) a regex character CLASS holding // is CODE, not a line comment', () => {
    // `/[//]/` matches a slash or two slashes. The shipped stripper opens a
    // line comment at the first `/` inside the class, so the literal's own
    // closing delimiter and everything after it on the line is blanked. A
    // require that follows ON THE SAME LINE -- the shape a minifier or a
    // one-liner fixture produces -- disappears with it.
    const f = fixture(
      'regex-line-comment-class',
      { 'a.ts': 'export function real() { return 1; }\n', 'b.ts': 'export const GONE = 2;\n' },
      {
        'x.test.ts': [
          "const slashes = /[//]/; const { GONE } = require('../src/b');",
          "import { real } from '../src/a';",
          "it('drives them', () => { real(); GONE; });",
          ''
        ].join('\n')
      }
    );
    const names = reportedNames(runSweep(f.srcDir, f.testsDir));
    expect(names.has('GONE')).toBe(false);
    expect(names.has('real')).toBe(false);
  });

  it('(47) a `/` in DIVISION position is not a regex, so the fix cannot eat a real comment', () => {
    // The negative control for the whole R464 family, and the one that fails if
    // the fix is written as "any `/` starts a regex" rather than "a `/` in a
    // VALUE position starts one". `a / b / c` must keep dividing: if the first
    // `/` were read as a literal opener the scan would run to the NEXT `/` and
    // copy `b ` through as literal content, and the `// comment` on the next
    // line would survive stripping -- where the arm 44 machinery would then
    // read a commented-out binding as a real import.
    const f = fixture(
      'division-not-regex',
      { 'a.ts': 'export function real() { return 1; }\n', 'b.ts': 'export const GHOST = 2;\n' },
      {
        'x.test.ts': [
          'const q = a / b / c;',
          '// const { GHOST } = require(\'../src/b\');',
          "import { real } from '../src/a';",
          "it('drives the real one', () => { real(); });",
          ''
        ].join('\n')
      }
    );
    const names = reportedNames(runSweep(f.srcDir, f.testsDir));
    // The comment never happened, so GHOST is a REAL gap and must be reported;
    // if the comment survived stripping it would be credited instead.
    expect(names.has('GHOST')).toBe(true);
    expect(names.has('real')).toBe(false);
  });

  it('(48) a `/` after a semicolon that is a DIVISION still strips the rest of the line', () => {
    // Arm 47 pins division on its OWN line. It does NOT pin the case where a
    // real comment shares the line with a division, which is where dropping
    // the value-position gate becomes visible: `a / b; // ...` has a `/` after
    // `b` -- an identifier, correctly NOT a value position -- and then a `//`
    // that a literal-blind scanner reaches by way of the FIRST slash.
    //
    // Mutation M4 (drop the gate, treat every `/` as a literal) survives all 47
    // earlier arms, because in each of them the division is followed by a
    // newline and so has no second `/` to pair with. Adding one puts a real
    // comment INSIDE what M4 reads as a literal, and it survives stripping
    // verbatim -- arm 44's false-negative direction, resurrected through the
    // new branch.
    const f = fixture(
      'division-before-same-line-comment',
      { 'a.ts': 'export function real() { return 1; }\n', 'b.ts': 'export const GHOST = 2;\n' },
      {
        'x.test.ts': [
          "const q = a / b; // const { GHOST } = require('../src/b');",
          "import { real } from '../src/a';",
          "it('drives the real one', () => { real(); });",
          ''
        ].join('\n')
      }
    );
    const names = reportedNames(runSweep(f.srcDir, f.testsDir));
    // GHOST never happened, so it is a REAL gap and must be reported. If the
    // comment survived stripping it would be credited and vanish from here.
    expect(names.has('GHOST')).toBe(true);
    expect(names.has('real')).toBe(false);
  });

  // --- R465 ---------------------------------------------------------------
  // The 23:03 tick reported three surviving mutants (M2/M6/M7) and diagnosed
  // them as ONE missing assertion. That diagnosis was right about the CAUSE
  // and wrong about the KIND, and the difference changes what should be done.
  //
  // M2 blanks a literal's interior, M6 drops the character-class guard so the
  // first `/` inside a class ends the literal early and its TAIL is rescanned
  // as ordinary code, M7 resumes one byte inside so the closing `/` is
  // rescanned. All three corrupt the parse text, and all three were invisible
  // to arms 45/46/47/48. Re-measured here over 33 fixtures, all three leave
  // the NO-RUNTIME-IMPORT verdict IDENTICAL in every case -- so a
  // verdict-level arm cannot kill them, not because the arm is weak but
  // because there is nothing for a verdict to see.
  //
  // The reason is a property of the SWEEP, not of the stripper: every
  // consumer -- note(), note_members(), member_window(), _substituted_paths()
  // -- reads the STRIPPED copy, and none of them slices the original. The
  // docstring's offset-preservation contract is therefore real but currently
  // UNOBSERVABLE. These three arms make it observable, by asserting on the
  // string strip_comments() returns rather than on a verdict derived from it.
  //
  // So the survivors split into TWO kinds, and the split is the finding:
  //
  //   M2, M7  killable, and killed by arms 49/50 below (verified: 2 red each).
  //           They corrupt bytes no consumer reads, so the fix is to give the
  //           COPY an observable rather than to hope a verdict notices.
  //   M6      EQUIVALENT. Dropping `not in_class` moves the scan point (the
  //           index for `const s = /[/]/;` goes 15 -> 13) and changes nothing
  //           observable, because the bytes between the two ends are pattern
  //           text under either reading. No arm can kill it without asserting
  //           an internal call boundary, which is a different claim.
  //
  // Both are ARTEFACTS in the R194 sense -- a mutation that survives because
  // nothing reads what it corrupts -- and the honest response differs by
  // kind: pin the invariant where one exists, record the equivalence where it
  // does not.

  it('(49) a regex literal is copied BYTE FOR BYTE, and the result has the SAME LENGTH as its input', () => {
    // The contract, stated as one assertion because it is one contract. Two
    // mutants die here and they die for OPPOSITE reasons:
    //
    //   M2 (`out.append(" " * (end - i))`) blanks the literal. Same LENGTH, so
    //   the length assertion alone passes -- only the verbatim one kills it.
    //   M7 (`i = end - 1`) resumes one byte inside, so the closing `/` is
    //   rescanned. The length assertion is satisfied by luck; what breaks is
    //   that the literal's bytes no longer appear in order.
    //
    // Assertions are on the RETURNED STRING, not on a verdict, because that is
    // the only level at which "the stripper copied this" is even a question.
    const src = [
      "const block = /[/*]/g;",
      "const quote = /a'b/;",
      "const klass = /[/][/]/;",
      "const plain = /abc/;",
      '// a comment below every literal',
      'import { real } from \'../src/a\';',
      ''
    ].join('\n');
    const out = stripComments(src);

    // LENGTH: the whole offset-preservation contract. A consumer that
    // computed an offset on the input and sliced the output would land in the
    // wrong place. Nothing does that TODAY (measured, not assumed -- see the
    // class comment), which is exactly why only a direct assertion can hold
    // this line.
    expect(out.length).toBe(src.length);

    // VERBATIM: each literal's bytes survive, in order, unblanked. The
    // fixtures deliberately include the three shapes the mutants attack --
    // an unclosed `/*` inside a class, a quote, and a class holding `/` --
    // because a verbatim check against only `/abc/` would pass under all
    // three and prove nothing.
    for (const literal of ['/[/*]/g', "/a'b/", '[/][/]/']) {
      expect(out).toContain(literal);
    }

    // And the comment BELOW them is still blanked, so the arms above cannot be
    // satisfied by a stripper that stopped stripping at all -- that failure
    // would keep the literals and pass both assertions.
    expect(out).not.toContain('a comment below every literal');
    // ... while the real import survives, so the stripper is not simply
    // copying everything through.
    expect(out).toContain("import { real } from '../src/a'");
  });

  it('(50) the text after a literal is still ADDRESSABLE when the literal holds comment-shaped text', () => {
    // Arm 49 pins the return string. This one pins the property that makes
    // the offset contract meaningful rather than decorative: the bytes that
    // follow a literal land where the input says they land, so a pattern
    // reading the output sees the same characters at the same offsets the
    // input had.
    //
    // This is the arm that would have killed M6 had a consumer read the
    // original -- and it is deliberately NOT phrased as a verdict assertion,
    // because a verdict cannot express "same offset". The fixture puts a
    // require-shaped binding AFTER the literal, so a rescanned literal TAIL
    // (M6) would have to land inside it for any difference to appear.
    const src = [
      "const klass = /[/][/]/;",
      "const { GHOST } = require('../src/b');",
      'import { real } from \'../src/a\';',
      ''
    ].join('\n');
    const out = stripComments(src);

    expect(out.length).toBe(src.length);
    // Offset-for-offset: the binding below the literal is where the input
    // says it is, byte for byte.
    expect(out.slice(src.indexOf("require"))).toBe(
      src.slice(src.indexOf('require'))
    );
    // The literal itself came through whole, so the two assertions above are
    // not trivially satisfiable by a stripper that emitted nothing.
    expect(out.slice(0, src.indexOf("require"))).toContain('[/][/]/');
  });

  it('(51) a division between two literals is not a LITERAL, and copying it changes nothing', () => {
    // The negative control for the whole R465 family, and the reason M2/M6/M7
    // are artefacts rather than defects.
    //
    // A stripper that copied every `/`-delimited span would corrupt a
    // division's operands only if it treated the span as pattern text. This
    // arm pins that `a / b` still divides -- the value-position gate -- AND
    // that the result is byte-identical to the input, because a division has
    // no comment or literal semantics at all. If a future change makes the
    // literal branch fire on a division, this goes red at the string level
    // before it can reach the verdict level.
    const src = ['const q = a / b / c;', 'const w = x / y;', ''].join('\n');
    const out = stripComments(src);
    expect(out).toBe(src);
  });
});
