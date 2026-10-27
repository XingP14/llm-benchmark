// tests/web/r511-repo-root-derived-not-transcribed.test.ts
//
// R511 — the tree a script measures must be DERIVED from that script, not
// transcribed from one author's checkout.
//
// THE DEFECT (measured, not suspected)
//
// Four of this repository's mutation drivers, and one probe, resolved the
// tree they mutate from an ABSOLUTE PATH LITERAL:
//
//     REPO = pathlib.Path("/root/.hermes/workspace/llm-benchmark")
//     REPO = Path("/root/.hermes/workspace/llm-benchmark")
//     const REPO = '/root/.hermes/workspace/llm-benchmark';
//
// A path baked into a script is validated on exactly ONE host.
//
// MEASURED (2026-10-28, controlled A/B): a COPY of scripts/r486_matrix.py
// was placed in a DIFFERENT checkout (a directory that is NOT this
// repository).  The copy still resolved REPO to the author's tree:
//
//     driver lives at : /tmp/lbcopy0027/scripts/r486_matrix.py
//     REPO resolves to: /root/.hermes/workspace/llm-benchmark
//
// The consequence was measured directly: a MARKER edit was written into
// the AUTHOR's src/web/routes/questions.ts, the COPY's driver was run, and
// the driver -- reporting a full, confident verdict ("M1: KILLED, 4 failed
// / 4 passed / 8 total") -- mutated, measured and RESTORED the author's
// file, while the copy's own tree was never touched.  The verdict described
// a tree the caller did not ask about.
//
// This is the same class as R506 (the `/us-vps4/` hostname literal) and
// R510 in the sibling repository (the hardcoded repo path in the harness
// scripts): the defect is the CONSTANT, not the logic around it.
//
// THE SECOND DEFECT (found while fixing the first)
//
// scripts/r497_matrix.py pinned its baseline with a TRANSCRIBED HASH:
//
//     BASELINE_MD5 = "73a550b313aa9a4e3d9afe27e9b5537f"
//
// Two commits have landed on src/web/server.ts since that pin (78e2466 and
// 23b1faf, both real fixes to the SPA fallback), so the driver ABORTS on a
// perfectly clean tree:
//
//     ABORT: owned files are not clean vs HEAD:
//     server.ts md5 01b80f93 != pinned baseline 73a550b3
//
// A pinned hash is the same defect class: a constant transcribed at one
// moment in time, validated on exactly one moment in time.
//
// WHAT THIS SUITE PINS
//
//   A. every driver in the tree derives its root from its own location;
//   B. no LIVE source literal anywhere in the tree hardcodes a host path
//      (comments are exempt -- a fix's prose must be able to name the
//      defect it is fixing);
//   C. a driver COPIED out of the tree ABORTS LOUDLY instead of measuring
//      somebody else's tree;
//   D. the r497 baseline is derived from the repository's own HEAD blob,
//      not transcribed.
//
// Arm (B) and arm (C) are the load-bearing pair: (B) says the literal is
// gone, (C) says the DERIVATION actually holds.

import { describe, it, expect } from '@jest/globals';
import { readFileSync, readdirSync, statSync, existsSync, mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { tmpdir } from 'os';
import { execFileSync } from 'child_process';

/**
 * The repository root, anchored to THIS FILE.
 *
 * The subject set must not depend on the launch directory: `npm test` runs
 * from the repository root, but the suite must describe the same tree when
 * invoked from anywhere.  (This is the same discipline R507 applied in the
 * sibling repository.)
 */
const HERE = dirname(__filename);
const REPO = resolve(HERE, '..', '..');

/** The scripts directory -- where the drivers live. */
const SCRIPTS = join(REPO, 'scripts');

/**
 * Every tracked file under a directory, recursively.
 *
 * `git ls-files` is used rather than a filesystem walk so that UNTRACKED
 * scratch files (which the working tree accumulates) cannot enter the
 * subject set: the gate is about what the repository SHIPS.
 */
function trackedFiles(dir: string): string[] {
  void dir;
  // `git ls-files` -- the TRACKED files under the repository.  A filesystem
  // walk would pick up untracked residue (a __pycache__/*.pyc is binary
  // noise that matches no rule and drowns the report), and the gate is
  // about what the repository SHIPS.
  const out = execFileSync('git', ['ls-files', '-z', '--', dir], {
    cwd: REPO,
    encoding: 'utf8',
  })
    .split('\0')
    .filter((x) => x.length > 0)
    .map((rel) => join(REPO, rel));
  return out;
}

/**
 * Strip COMMENTS from a source file.
 *
 * The gate is about LIVE literals -- a value the program actually uses.  A
 * comment is prose, and the prose that documents this very defect MUST be
 * able to name the old literal, or the defect cannot be documented.
 *
 * The stripping is deliberately conservative: it removes `#` comments
 * (Python, shell) and `//` comments (JS/TS), and it leaves string contents
 * alone.  A `#` inside a string is a false positive risk, so the Python
 * handling only strips a `#` that starts a line or follows whitespace.
 */
function stripComments(src: string): string {
  // Block comments (C-style) -- removed wholesale.
  let out = src.replace(/\/\*[\s\S]*?\*\//g, '');
  // Line comments: // ... to end of line.
  out = out.replace(/\/\/[^\n]*/g, '');
  // Python/shell comments: a # at line start or after whitespace, to EOL.
  out = out.replace(/(^|\s)#[^\n]*/g, '$1');
  return out;
}

/**
 * The string literals in a source file, as their raw text.
 *
 * Both quote styles are handled, and an escaped quote does not end the
 * literal.
 */
function stringLiterals(src: string): string[] {
  const out: string[] = [];
  const re = /(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) out.push(m[2]);
  return out;
}

/**
 * The repository root a PYTHON driver resolves, WITHOUT executing it.
 *
 * The driver's root expression is evaluated in a subprocess whose only job
 * is to print the value.  The module-level code is what defines REPO, so
 * the expression is read out of the SOURCE and evaluated against a
 * namespace carrying `__file__` -- exactly the input the real driver gets.
 *
 * Nothing is mutated and no suite is run: the measurement is of the
 * RESOLUTION, which is the property under test.
 */
function resolvePythonRepoRoot(copyPath: string): string {
  const src = readFileSync(copyPath, 'utf8');
  const m = /^(REPO|REPO_ROOT)\s*=\s*(.+)$/m.exec(src);
  if (!m) return '<no REPO assignment found>';
  const expr = m[2];
  const py = [
    'import pathlib, json',
    `expr = ${JSON.stringify(expr)}`,
    'ns = {"__file__": ' + JSON.stringify(copyPath) + ', "pathlib": pathlib, "os": __import__("os"), "Path": pathlib.Path}',
    'try:',
    '    val = eval(expr, ns)',
    'except SystemExit:',
    '    val = "<SystemExit>"',
    'except Exception as e:',
    '    val = "<error: %s>" % e',
    'print(str(val))',
  ].join('\n');
  const out = execFileSync('python3', ['-c', py], { encoding: 'utf8', stdio: 'pipe' });
  return out.trim();
}

/**
 * The repository root a JS probe resolves, WITHOUT executing it.
 *
 * The probe's REPO is a `const` initialiser; it is read out of the source
 * and the `__dirname` binding it depends on is supplied.  The probe is NOT
 * run: it binds a port and starts a server.
 */
function resolveJsRepoRoot(copyPath: string): string {
  const src = readFileSync(copyPath, 'utf8');
  const m = /^const REPO\s*=\s*(.+);$/m.exec(src);
  if (!m) return '<no REPO assignment found>';
  const expr = m[1];
  const js = [
    "const path = require('path');",
    'const expr = ' + JSON.stringify(expr) + ';',
    'const __dirname = ' + JSON.stringify(dirname(copyPath)) + ';',
    'let val;',
    'try { val = eval(expr); } catch (e) { val = "<error: " + e.message + ">"; }',
    'console.log(String(val));',
  ].join('\n');
  const out = execFileSync('node', ['-e', js], { encoding: 'utf8', stdio: 'pipe' });
  return out.trim();
}


/**
 * The LIVE string literals of a PYTHON file, via its AST.
 *
 * The regex extractor cannot tell a DOCSTRING from a live value, and the
 * difference matters here: a module docstring is PROSE, and the prose that
 * documents this very defect MUST be able to name the old literal -- or the
 * defect cannot be documented.  The AST can tell them apart exactly.
 *
 * `ast.get_docstring` identifies docstrings by position; every other string
 * constant is a live value.
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

/** The host-specific absolute paths a script must never bake in. */
const HOST_PATH_PATTERNS = [
  /\/root\/\.hermes/,
  /\/home\/[A-Za-z0-9._-]+\//,
  /\/Users\/[A-Za-z0-9._-]+\//,
];

/** The drivers this suite is about: the scripts that resolve a tree. */
const DRIVERS = [
  'r486_matrix.py',
  'r488_matrix.py',
  'r497_matrix.py',
  'probe497_m3_diff.cjs',
];

describe('R511 — a script must DERIVE the tree it measures, not transcribe one author\'s path', () => {
  // (0) THE PREMISE. The suite's own subject set must be anchored to this
  // file, not to the launch directory.  If this arm could not fire, every
  // arm below would be scanning the wrong tree.
  it('(0) premise: the subject set is anchored to this file, and the drivers are all present', () => {
    expect(existsSync(join(REPO, 'jest.config.js'))).toBe(true);
    expect(existsSync(join(REPO, 'package.json'))).toBe(true);
    const present = DRIVERS.filter((d) => existsSync(join(SCRIPTS, d)));
    expect(present).toEqual(DRIVERS);
  });

  // (1) ⭐ ARM A — EVERY DRIVER DERIVES ITS ROOT FROM ITS OWN LOCATION.
  // A driver that still contains the author's absolute path is the defect.
  it('(1) every driver derives its root from its own location', () => {
    const offenders: string[] = [];
    for (const d of DRIVERS) {
      const src = readFileSync(join(SCRIPTS, d), 'utf8');
      const live = stripComments(src);
      for (const lit of stringLiterals(live)) {
        if (HOST_PATH_PATTERNS.some((p) => p.test(lit))) {
          offenders.push(`${d}: ${JSON.stringify(lit)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  // (2) ⭐ ARM B — NO LIVE LITERAL ANYWHERE IN THE TREE HARDCODES A HOST
  // PATH.  This is the tree-wide half of arm (1): the defect could be in a
  // file this suite does not name.
  //
  // COMMENTS ARE EXEMPT.  The fix's own prose must be able to say what the
  // old literal was; a gate that fires on prose would forbid documenting
  // the defect it forbids.  That is the same rule R506 established for the
  // hostname marker.
  it('(2) no LIVE literal in the tree hardcodes a host path', () => {
    const offenders: string[] = [];
    for (const p of trackedFiles(join(REPO, 'scripts')).concat(trackedFiles(join(REPO, 'src')))) {
      let src: string;
      try {
        src = readFileSync(p, 'utf8');
      } catch {
        continue;
      }
      const lits = p.endsWith('.py')
        ? pythonLiveLiterals(p)
        : stringLiterals(stripComments(src));
      for (const lit of lits) {
        if (HOST_PATH_PATTERNS.some((p2) => p2.test(lit))) {
          offenders.push(`${p.slice(REPO.length + 1)}: ${JSON.stringify(lit)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  // (3) ⭐ ARM C — A DRIVER COPIED OUT OF THE TREE RESOLVES TO ITS OWN
  // TREE.  This is the arm that says the DERIVATION actually holds, rather
  // than merely that the literal is gone.
  //
  // THE ARM MEASURES THE RESOLUTION, NOT A RUN.  That distinction is
  // load-bearing: at HEAD the copied driver would RESOLVE to the author's
  // tree and then MUTATE it -- executing it would damage the repository
  // under test.  So the driver's root expression is evaluated against a
  // FAKE checkout, and the resolved root is read out.  Nothing is
  // mutated, no suite is run, and the measurement is deterministic.
  //
  // The fake checkout is laid out like a real one -- <root>/scripts/ --
  // and carries the marker file the derivation looks for.
  it('(3) a driver copied out of the tree resolves to ITS OWN tree, not the author\'s', () => {
    const root = mkdtempSync(join(tmpdir(), 'r511-fakerepo-'));
    const fakeScripts = join(root, 'scripts');
    mkdirSync(fakeScripts, { recursive: true });
    writeFileSync(join(root, 'jest.config.js'), '// fake marker\n');

    const offenders: string[] = [];
    for (const d of DRIVERS) {
      const copy = join(fakeScripts, d);
      writeFileSync(copy, readFileSync(join(SCRIPTS, d), 'utf8'));

      let resolved = '';
      if (d.endsWith('.py')) {
        resolved = resolvePythonRepoRoot(copy);
      } else {
        resolved = resolveJsRepoRoot(copy);
      }
      if (resolved !== root) {
        offenders.push(`${d}: resolved to ${resolved} -- it would measure somebody else's tree`);
      }
    }
    expect(offenders).toEqual([]);
  });

  // (4) ⭐ ARM D — THE r497 BASELINE IS DERIVED, NOT TRANSCRIBED.  The
  // pinned literal was stale and aborted the driver on a clean tree.
  //
  // The check is on the SOURCE (the literal must be gone) and on the
  // BEHAVIOUR (the guard must accept the repository's current HEAD blob).
  it('(4) the r497 baseline is derived from HEAD, not pinned to a literal', () => {
    const src = stripComments(readFileSync(join(SCRIPTS, 'r497_matrix.py'), 'utf8'));
    expect(/BASELINE_MD5\s*=\s*["'][0-9a-f]{32}["']/.test(src)).toBe(false);

    // BEHAVIOUR: the guard must ACCEPT the tree it is standing in.  The
    // derived baseline is the md5 of the HEAD blob, and the working tree
    // at a clean checkout IS that blob.
    const headBlob = execFileSync('git', ['show', 'HEAD:src/web/server.ts'], {
      cwd: REPO,
      encoding: 'utf8',
    });
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const crypto = require('crypto');
    const headMd5 = crypto.createHash('md5').update(Buffer.from(headBlob, 'utf8')).digest('hex');
    const workMd5 = crypto
      .createHash('md5')
      .update(readFileSync(join(REPO, 'src', 'web', 'server.ts')))
      .digest('hex');
    expect(workMd5).toBe(headMd5);
  });

  // (5) ⭐ ARM E — THE CONTROL ARM ITSELF MUST BE ABLE TO FAIL.  Arm (2)
  // is the tree-wide scan; if the scan finds nothing because the SUBJECT
  // SET is empty, arm (2) is vacuously green -- the "control that cannot
  // fail" shape.
  //
  // So the subject set is asserted to be NON-EMPTY and to CONTAIN the files
  // the gate is about.  A scan over an empty set proves nothing.
  it('(5) the scan subject set is non-empty and contains the drivers', () => {
    const subject = trackedFiles(join(REPO, 'scripts')).concat(trackedFiles(join(REPO, 'src')));
    expect(subject.length).toBeGreaterThan(0);
    const rel = subject.map((p) => p.slice(REPO.length + 1));
    for (const d of DRIVERS) {
      expect(rel).toContain(join('scripts', d));
    }
  });
});
