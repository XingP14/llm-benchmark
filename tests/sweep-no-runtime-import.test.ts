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
});
