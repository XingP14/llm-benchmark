// tests/web/r513-driver-baseline-derived-not-transcribed.test.ts
//
// R513 — a driver's baseline must be DERIVED from the tree it stands in,
// not TRANSCRIBED from one moment in time.
//
// THE DEFECT (measured, not suspected)
//
// R511 (2026-10-28, e3d37ea) fixed `scripts/r497_matrix.py`: its guard
// pinned a transcribed hash literal
//
//     BASELINE_MD5 = "73a550b313aa9a4e3d9afe27e9b5537f"
//
// which went STALE when two later commits landed on the owned file, so the
// driver ABORTED on a perfectly clean tree.
//
// The scan that found it did not look at ONE driver.  It scanned every
// tracked script for a live 32-hex literal.  The scan found a SECOND one,
// one file over, in the driver R507 had shipped a few days earlier:
//
//     scripts/r507_matrix.py:66  BASELINE_MD5 = "b2928799d6e4c50462ad8caaec2edfd3"
//
// MEASURED (2026-10-28): `python3 scripts/r507_matrix.py` at HEAD exits 2
// with
//
//     ABORT: owned files are not at the pinned baseline:
//     sweep-no-runtime-import.py md5 2815efbc != pinned baseline b2928799
//
// after a single BENIGN commit (a trailing comment) landed on the owned
// file.  The tree was clean; the driver refused to run.
//
// A pinned hash is a pinned path: the guard's INTENT ("has a sibling edited
// this file since the last commit?") survives the constant; the constant
// does not.
//
// WHY THE SCAN MATTERS MORE THAN THE FIX
//
// A fix in one repository is not a fix in the family -- and a fix in one
// DRIVER is not a fix in the family either.  R511 fixed the driver it was
// looking at.  This suite pins the CLASS, so the next driver that pins a
// baseline is caught by a scan rather than by the next person who runs it.
//
// WHAT THIS SUITE PINS
//
//   A. no LIVE 32-hex literal remains in any tracked python script
//      (docstrings are exempt -- prose must be able to name the old
//      constant, or the defect cannot be documented);
//   B. the r507 driver RESOLVES its baseline from the tree it stands in:
//      the value it computes equals the md5 of the repository's own HEAD
//      blob of the owned file, and equals the working tree's md5 when the
//      tree is clean;
//   C. the same driver COPIED into a DIFFERENT checkout resolves the
//      baseline from THAT checkout's HEAD -- it does not measure the
//      author's tree.
//
// Arms B and C are the load-bearing pair: A says the literal is gone, B and
// C say the DERIVATION actually holds.
//
// THE ARM THAT MUST NOT RUN THE DRIVER
//
// Arm C evaluates the driver's module-level baseline derivation.  It does
// NOT execute the driver's main(): a driver that mutates the owned file
// would damage the repository under test, and the property under test is
// the RESOLUTION, not the run.  (R198: observe the DECISION, do not
// perform the CONSEQUENCE.)

import { describe, it, expect } from '@jest/globals';
import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { tmpdir } from 'os';
import { execFileSync } from 'child_process';
import { createHash } from 'crypto';

const HERE = dirname(__filename);
const REPO = resolve(HERE, '..', '..');
const SCRIPTS = join(REPO, 'scripts');

/** The driver this suite is about, and the file it owns. */
const DRIVER = 'r507_matrix.py';
const OWNED_REL = 'scripts/sweep-no-runtime-import.py';

/** Every tracked file under a directory (git ls-files, so untracked residue cannot enter). */
function trackedFiles(dir: string): string[] {
  const out = execFileSync('git', ['ls-files', '-z', '--', dir], {
    cwd: REPO,
    encoding: 'utf8',
  })
    .split('\0')
    .filter((x) => x.length > 0)
    .map((rel) => join(REPO, rel));
  return out;
}

function md5(data: Buffer | string): string {
  return createHash('md5').update(data).digest('hex');
}

/**
 * Strip COMMENTS from a source file.
 *
 * The gate is about LIVE literals -- a value the program actually uses.  A
 * comment is prose, and the prose that documents this very defect MUST be
 * able to name the old constant, or the defect cannot be documented.  (This
 * is the same rule R511 established for the host-path literal.)
 */
function stripComments(src: string): string {
  let out = src.replace(/\/\*[\s\S]*?\*\//g, '');
  out = out.replace(/\/\/[^\n]*/g, '');
  out = out.replace(/(^|\s)#[^\n]*/g, '$1');
  return out;
}

/**
 * The LIVE string constants of a PYTHON file, via its AST.
 *
 * The regex extractor cannot tell a DOCSTRING from a live value, and the
 * difference matters here: a module docstring is PROSE, and the prose that
 * documents this very defect MUST be able to name the old constant -- or
 * the defect cannot be documented.
 */
function pythonLiveLiterals(file: string): string[] {
  const py = [
    'import ast, json, sys',
    'src = open(sys.argv[1], encoding="utf-8").read()',
    'tree = ast.parse(src)',
    'docstrings = set()',
    'for node in ast.walk(tree):',
    '    if isinstance(node, (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)):',
    '        body = getattr(node, "body", None)',
    '        if body and isinstance(body[0], ast.Expr) and isinstance(body[0].value, ast.Constant) and isinstance(body[0].value.value, str):',
    '            docstrings.add(id(body[0].value))',
    'out = []',
    'for node in ast.walk(tree):',
    '    if isinstance(node, ast.Constant) and isinstance(node.value, str) and id(node) not in docstrings:',
    '        out.append(node.value)',
    'print(json.dumps(out))',
  ].join('\n');
  const out = execFileSync('python3', ['-c', py, file], { encoding: 'utf8', stdio: 'pipe' });
  return JSON.parse(out) as string[];
}

/**
 * The BASELINE value a driver computes, WITHOUT running its main().
 *
 * The driver's module-level code is what defines the baseline; the
 * `if __name__ == "__main__"` guard means executing the module with any
 * other __name__ evaluates the constants and defines the functions, and
 * nothing else.  No file is mutated and no suite is run: the measurement
 * is of the RESOLUTION, which is the property under test.
 */
function resolveDriverBaseline(driverPath: string, repoRoot: string): string {
  const py = [
    'import sys, json, runpy',
    'src = open(sys.argv[1], encoding="utf-8").read()',
    'ns = {"__name__": "r513_probe", "__file__": sys.argv[1]}',
    'try:',
    '    exec(compile(src, sys.argv[1], "exec"), ns)',
    'except SystemExit as e:',
    '    print(json.dumps({"error": "SystemExit: %s" % e}))',
    '    sys.exit(0)',
    'except Exception as e:',
    '    print(json.dumps({"error": "%s: %s" % (type(e).__name__, e)}))',
    '    sys.exit(0)',
    'v = ns.get("BASELINE_MD5")',
    'print(json.dumps({"baseline": v}))',
  ].join('\n');
  const out = execFileSync('python3', ['-c', py, driverPath], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  const parsed = JSON.parse(out.trim().split('\n').pop() as string) as { baseline?: string; error?: string };
  if (parsed.error) return `<error: ${parsed.error}>`;
  return parsed.baseline ?? '<no BASELINE_MD5>';
}

describe('R513 — a driver baseline must be DERIVED from its tree, not TRANSCRIBED', () => {
  // (0) THE PREMISE. The suite's own subject set must be anchored to this
  // file, not to the launch directory.  If this arm could not fire, every
  // arm below would be scanning the wrong tree.
  it('(0) premise: the subject set is anchored to this file, and the driver is present', () => {
    expect(existsSync(join(REPO, 'jest.config.js'))).toBe(true);
    expect(existsSync(join(REPO, 'package.json'))).toBe(true);
    expect(existsSync(join(SCRIPTS, DRIVER))).toBe(true);
  });

  // (1) ⭐ ARM A — NO LIVE 32-HEX LITERAL IN ANY TRACKED PYTHON SCRIPT.
  //
  // This is the tree-wide half.  The defect could be in a driver this suite
  // does not name -- and it WAS: R511 fixed r497, and r507 was one file
  // over.  A fix in one driver is not a fix in the family.
  //
  // COMMENTS AND DOCSTRINGS ARE EXEMPT.  The prose that documents this
  // defect MUST be able to name the old constant, or the defect cannot be
  // documented.  For Python the scan uses the AST, which distinguishes a
  // docstring from a live string constant exactly.
  it('(1) no LIVE 32-hex literal in any tracked python script', () => {
    const offenders: string[] = [];
    for (const p of trackedFiles(join(REPO, 'scripts'))) {
      if (!p.endsWith('.py')) continue;
      for (const lit of pythonLiveLiterals(p)) {
        if (/^[0-9a-f]{32}$/.test(lit)) {
          offenders.push(`${p.slice(REPO.length + 1)}: ${JSON.stringify(lit)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  // (2) ⭐ ARM B — THE DRIVER'S BASELINE RESOLVES TO THE TREE IT STANDS IN.
  //
  // The check is on the SOURCE (the literal must be gone) and on the
  // BEHAVIOUR (the resolved value must equal the repository's own HEAD
  // blob of the owned file, and the working tree when it is clean).
  it('(2) the r507 baseline is derived from HEAD, not pinned to a literal', () => {
    const src = stripComments(readFileSync(join(SCRIPTS, DRIVER), 'utf8'));
    expect(/BASELINE_MD5\s*=\s*["'][0-9a-f]{32}["']/.test(src)).toBe(false);

    const resolved = resolveDriverBaseline(join(SCRIPTS, DRIVER), REPO);
    expect(resolved).not.toMatch(/^</); // no error, no missing symbol
    expect(resolved).toMatch(/^[0-9a-f]{32}$/);

    // The HEAD blob is what a clean working tree contains.
    const headBlob = execFileSync('git', ['show', `HEAD:${OWNED_REL}`], {
      cwd: REPO,
      encoding: 'utf8',
    });
    const headMd5 = md5(Buffer.from(headBlob, 'utf8'));
    const workMd5 = md5(readFileSync(join(REPO, OWNED_REL)));

    expect(resolved).toBe(headMd5);
    // And on a CLEAN tree the working copy equals HEAD -- which is the
    // whole point: the driver must accept the tree it is standing in.
    expect(workMd5).toBe(headMd5);
  });

  // (3) ⭐ ARM C — THE SAME DRIVER, COPIED INTO A DIFFERENT CHECKOUT,
  // RESOLVES ITS BASELINE FROM THAT CHECKOUT.
  //
  // This is the arm that says the DERIVATION actually holds, rather than
  // merely that the literal is gone.  A driver that pins a hash cannot
  // pass this arm in any checkout but the author's.
  //
  // The fake checkout is a real git repository with a real commit, because
  // the derivation reads HEAD.  The driver is COPIED into it and its
  // baseline is resolved there.
  it('(3) a driver copied into another checkout resolves THAT checkout\'s baseline', () => {
    const root = mkdtempSync(join(tmpdir(), 'r513-fakerepo-'));
    try {
      const fakeScripts = join(root, 'scripts');
      mkdirSync(fakeScripts, { recursive: true });
      writeFileSync(join(root, 'jest.config.js'), '// fake marker\n');
      writeFileSync(join(root, 'package.json'), '{}\n');
      // The owned file, with DISTINCT content so its md5 cannot collide
      // with the author's by accident.
      writeFileSync(join(root, OWNED_REL), '# the fake checkout owns a different file\n');

      const git = (args: string[]) =>
        execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' });
      git(['init', '-q']);
      git(['config', 'user.email', 'probe@example.invalid']);
      git(['config', 'user.name', 'probe']);
      git(['add', '-A']);
      git(['commit', '-q', '-m', 'fake checkout']);

      const copy = join(fakeScripts, DRIVER);
      writeFileSync(copy, readFileSync(join(SCRIPTS, DRIVER), 'utf8'));

      const fakeHead = md5(
        Buffer.from(git(['show', `HEAD:${OWNED_REL}`]), 'utf8'),
      );
      const resolved = resolveDriverBaseline(copy, root);

      expect(resolved).not.toMatch(/^</);
      expect(resolved).toBe(fakeHead);
      // And it is NOT the author's tree's baseline -- the whole point.
      const authorHead = md5(
        Buffer.from(
          execFileSync('git', ['show', `HEAD:${OWNED_REL}`], { cwd: REPO, encoding: 'utf8' }),
          'utf8',
        ),
      );
      expect(resolved).not.toBe(authorHead);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // (4) ⭐ ARM D — THE CONTROL ARM ITSELF MUST BE ABLE TO FAIL.  Arm (1)
  // is a tree-wide scan; if the scan finds nothing because the SUBJECT
  // SET is empty, arm (1) is vacuously green -- the "control that cannot
  // fail" shape.
  it('(4) the scan subject set is non-empty and contains the driver', () => {
    const subject = trackedFiles(join(REPO, 'scripts'));
    expect(subject.length).toBeGreaterThan(0);
    const rel = subject.map((p) => p.slice(REPO.length + 1));
    expect(rel).toContain(join('scripts', DRIVER));
    expect(rel).toContain(OWNED_REL);
  });
});
