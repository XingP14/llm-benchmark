// tests/web/r514-driver-tool-resolution-not-npx.test.ts
//
// R514 — a driver must resolve its TOOLCHAIN from the tree it stands in,
// not through `npx`.
//
// THE DEFECT (measured, not suspected)
//
// R514 in the sibling repository (woclaw, 2026-10-28) fixed exactly this
// class in `hub/scripts/r514_matrix.py`: the driver built and ran its
// subject with `npx tsc` / `npx vitest`, and `npx` resolves a binary
// against the CWD's package tree.
//
// MEASURED here in an ISOLATED WORKTREE of the same commit:
//
//     $ npx jest --version            # a tree with no node_modules
//     30.5.2                          # <-- FETCHED FROM THE REGISTRY
//     $ ./node_modules/.bin/jest --version   # in the repository
//     29.7.0                          # <-- what package.json pins (^29)
//
// So `npx` does not merely resolve the WRONG tool -- when the network is
// available it DOWNLOADS one, and the driver then measures its subject
// with a DIFFERENT MAJOR of its runner than the repository pins.  The
// version is decided by whatever the registry served at that moment (or by
// a shared host cache under ~/.npm/_npx), NOT by the lockfile.
//
// MEASURED with a FRESH npx cache and NO network:
//
//     $ npm_config_cache=<empty> npx jest --version
//     npm error code ENETUNREACH
//     npm error request to https://registry.npmjs.org/jest failed
//
// MEASURED in the author's tree (which HAS node_modules), `npx jest
// --version` returns 29.7.0 -- the pinned version.  So the defect is
// INVISIBLE on exactly the one host the driver was authored on, and it is
// invisible on that host for the same reason the R506 hostname literal and
// the R511/R513 path literals were: the constant resolves correctly
// THERE.
//
// A script validated on exactly ONE tree is a script validated on exactly
// ONE tree.  This suite pins the CLASS, so the next driver that resolves a
// tool through `npx` is caught by a scan rather than by the next person
// who runs it.
//
// WHAT THIS SUITE PINS
//
//   A. no tracked driver invokes `npx` to run a TOOL.  The scan is over
//      tracked files under scripts/ (git ls-files, so untracked residue
//      cannot enter), and it is TEXTUAL -- `npx` appearing in a COMMENT is
//      prose, and the prose that documents this very defect MUST be able to
//      name `npx`, or the defect cannot be documented.  This is the same
//      rule R511 established for the host-path literal and R513 for the
//      hash literal.
//   B. the shared resolver ASSERTS its resolution: asked for a tool that
//      the tree does not have, it fails LOUDLY (exit 2) with a message
//      naming the missing path -- instead of returning a path that does
//      not exist, or (worse) resolving something else.
//   C. the resolver, given a tree that DOES have the tool, resolves the
//      tool IN THAT TREE -- not in the author's tree, and not in a
//      registry cache.
//
// Arms B and C are the load-bearing pair: A says the literal is gone, B
// and C say the DERIVATION actually holds.
//
// THE ARM THAT MUST NOT RUN THE DRIVER
//
// Arm C evaluates the resolver's module-level derivation.  It does NOT
// execute a driver: a driver that mutates the owned file would damage the
// repository under test, and the property under test is the RESOLUTION,
// not the run.  (R198: observe the DECISION, do not perform the
// CONSEQUENCE.)

import { describe, it, expect } from '@jest/globals';
import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { tmpdir } from 'os';
import { execFileSync, spawnSync } from 'child_process';

const HERE = dirname(__filename);
const REPO = resolve(HERE, '..', '..');
const SCRIPTS = join(REPO, 'scripts');

/** The shared resolver this suite is about. */
const RESOLVER_PY = 'resolve_tool.py';
const RESOLVER_SH = 'resolve-tool.sh';

/** Every tracked file under scripts/ (git ls-files, so untracked residue cannot enter). */
function trackedScripts(): string[] {
  const out = execFileSync('git', ['ls-files', '-z', '--', 'scripts'], {
    cwd: REPO,
    encoding: 'utf8',
  })
    .split('\0')
    .filter((x) => x.length > 0);
  return out;
}

/**
 * Strip COMMENTS from a source file.
 *
 * The gate is about LIVE invocations -- a tool the driver actually runs.
 * A comment is prose, and the prose that documents this very defect MUST
 * be able to name `npx`, or the defect cannot be documented.  (This is the
 * same rule R511 established for the host-path literal and R513 for the
 * hash literal.)
 */
function stripComments(src: string, kind: 'py' | 'sh'): string {
  let out = src.replace(/\/\*[\s\S]*?\*\//g, '');
  out = out.replace(/\/\/[^\n]*/g, '');
  if (kind === 'py') {
    // A python `#` comment.
    out = out.replace(/(^|\s)#[^\n]*/g, '$1');
    // A python triple-quoted docstring is prose too.
    out = out.replace(/"""[\s\S]*?"""/g, '');
    out = out.replace(/'''[\s\S]*?'''/g, '');
  } else {
    // A shell `#` comment.
    out = out.replace(/(^|\s)#[^\n]*/g, '$1');
  }
  return out;
}

/**
 * The LIVE occurrences of `npx` in a driver, with comments stripped.
 *
 * For a python file the docstring strip is essential: every one of these
 * drivers opens with a docstring that explains the history of the defect,
 * and a regex that cannot tell prose from code would flag all of them.
 */
function liveNpxOccurrences(rel: string): string[] {
  const abs = join(REPO, rel);
  const kind = rel.endsWith('.py') ? 'py' : rel.endsWith('.sh') ? 'sh' : 'other';
  if (kind === 'other') return [];
  const src = readFileSync(abs, 'utf8');
  const stripped = stripComments(src, kind);
  const hits: string[] = [];
  // A shell invocation: the token `npx` followed by a tool name.
  // A python argv list: the string "npx" as its own element.
  const patterns = [
    /\bnpx\s+[a-z]/gi,
    /["']npx["']/gi,
  ];
  for (const re of patterns) {
    const m = stripped.match(re);
    if (m) hits.push(...m);
  }
  return hits;
}

describe('R514 — a driver resolves its toolchain from the tree it stands in', () => {
  it('A: no tracked driver invokes `npx` to run a tool', () => {
    const offenders: string[] = [];
    for (const rel of trackedScripts()) {
      const hits = liveNpxOccurrences(rel);
      if (hits.length > 0) {
        offenders.push(`${rel}: ${hits.length} live npx invocation(s)`);
      }
    }
    // NOTE: this repository's own `scripts/` must be clean.  The prose in
    // these drivers may NAME `npx` (it must, to document the defect), but
    // no driver may CALL it.
    expect(offenders).toEqual([]);
  });

  it('A2: the scan is not vacuous -- the resolver files exist and are tracked', () => {
    // A gate that cannot fail is not a gate.  If the drivers were all
    // deleted, arm A would pass with nothing to check -- so assert that
    // the subject set is NON-EMPTY and that the resolver it blesses is
    // actually present.
    const tracked = trackedScripts();
    expect(tracked.length).toBeGreaterThan(5);
    expect(tracked).toContain(`scripts/${RESOLVER_PY}`);
    expect(tracked).toContain(`scripts/${RESOLVER_SH}`);
    // And the family is real: there are several drivers to scan.
    const drivers = tracked.filter((f) => /r\d+_matrix\.(py|sh)$/.test(f));
    expect(drivers.length).toBeGreaterThanOrEqual(5);
  });

  it('B: the resolver ASSERTS its resolution -- a missing tool fails LOUDLY', () => {
    // The tree the resolver is asked about has NO node_modules, so the tool
    // cannot be found.  The resolver must exit NON-ZERO and NAME the
    // missing path.  A resolver that returns a path that does not exist,
    // or that silently resolves something else, fails this arm.
    const sandbox = mkdtempSync(join(tmpdir(), 'r514-resolver-'));
    try {
      // A tree that LOOKS like a checkout (the resolver asserts its root
      // by the marker file) but has no installed toolchain.
      mkdirSync(join(sandbox, 'scripts'), { recursive: true });
      writeFileSync(join(sandbox, 'jest.config.js'), '// marker\n');
      writeFileSync(
        join(sandbox, 'scripts', RESOLVER_PY),
        readFileSync(join(SCRIPTS, RESOLVER_PY), 'utf8'),
      );

      const res = spawnSync(
        'python3',
        [join(sandbox, 'scripts', RESOLVER_PY), 'jest'],
        { cwd: sandbox, encoding: 'utf8' },
      );
      expect(res.status).not.toBe(0);
      const out = `${res.stdout}${res.stderr}`;
      // The diagnostic must NAME the missing path -- an operator has to be
      // able to act on it.
      expect(out).toContain('node_modules');
      expect(out).toContain('jest');
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it('C: the resolver resolves the tool IN THAT TREE, not in the author\'s tree', () => {
    // Two different trees, each with its OWN tool at a DIFFERENT absolute
    // path.  The resolver, asked about tree B, must answer with tree B's
    // path.  A resolver that hardcodes the author's tree answers with the
    // author's path -- which is the whole defect.
    const treeA = mkdtempSync(join(tmpdir(), 'r514-treeA-'));
    const treeB = mkdtempSync(join(tmpdir(), 'r514-treeB-'));
    try {
      for (const [tree, toolPath] of [
        [treeA, join(treeA, 'node_modules', '.bin', 'jest')],
        [treeB, join(treeB, 'node_modules', '.bin', 'jest')],
      ] as [string, string][]) {
        mkdirSync(join(tree, 'scripts'), { recursive: true });
        mkdirSync(join(tree, 'node_modules', '.bin'), { recursive: true });
        writeFileSync(join(tree, 'jest.config.js'), '// marker\n');
        writeFileSync(toolPath, '#!/bin/sh\necho fake-jest\n');
        chmodSyncSafe(toolPath);
        writeFileSync(
          join(tree, 'scripts', RESOLVER_PY),
          readFileSync(join(SCRIPTS, RESOLVER_PY), 'utf8'),
        );
      }

      const resB = spawnSync(
        'python3',
        [join(treeB, 'scripts', RESOLVER_PY), 'jest'],
        { cwd: treeB, encoding: 'utf8' },
      );
      expect(resB.status).toBe(0);
      const resolved = resB.stdout.trim();
      // It resolved TREE B's tool -- and NOT the author's tree, and NOT
      // tree A.
      expect(resolved).toBe(join(treeB, 'node_modules', '.bin', 'jest'));
      expect(resolved).not.toContain(treeA);
      expect(resolved).not.toContain(REPO);
    } finally {
      rmSync(treeA, { recursive: true, force: true });
      rmSync(treeB, { recursive: true, force: true });
    }
  });

  it('C2: the SHELL resolver behaves the same way', () => {
    // The two shell drivers share a shell resolver; the python ones share
    // the python resolver.  Both must resolve from the tree they stand in.
    const tree = mkdtempSync(join(tmpdir(), 'r514-shell-'));
    try {
      mkdirSync(join(tree, 'scripts'), { recursive: true });
      mkdirSync(join(tree, 'node_modules', '.bin'), { recursive: true });
      writeFileSync(join(tree, 'node_modules', '.bin', 'jest'), '#!/bin/sh\n');
      chmodSyncSafe(join(tree, 'node_modules', '.bin', 'jest'));
      writeFileSync(
        join(tree, 'scripts', RESOLVER_SH),
        readFileSync(join(SCRIPTS, RESOLVER_SH), 'utf8'),
      );

      const ok = spawnSync('bash', [join(tree, 'scripts', RESOLVER_SH), 'jest'], {
        cwd: tree,
        encoding: 'utf8',
      });
      expect(ok.status).toBe(0);
      expect(ok.stdout.trim()).toBe(join(tree, 'node_modules', '.bin', 'jest'));

      // And the missing case is loud.
      const missing = spawnSync('bash', [join(tree, 'scripts', RESOLVER_SH), 'tsc'], {
        cwd: tree,
        encoding: 'utf8',
      });
      expect(missing.status).not.toBe(0);
      expect(`${missing.stdout}${missing.stderr}`).toContain('node_modules');
    } finally {
      rmSync(tree, { recursive: true, force: true });
    }
  });
});

/** chmod without a second import of fs (keeps the import list honest). */
function chmodSyncSafe(p: string): void {
  const { chmodSync } = require('fs');
  chmodSync(p, 0o755);
}
