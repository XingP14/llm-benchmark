// tests/web/r517-driver-resolver-receives-the-tree-root.test.ts
//
// R517 — a driver's resolver must be given the TREE ROOT, not scripts/.
//
// THE DEFECT (measured, not suspected)
//
// R514 (95a306a, 2026-10-28) shipped `scripts/resolve_tool.py` and rewrote
// nine tracked mutation drivers to use it instead of `npx`.  The fix was
// right in intent and WRONG in the call.
//
// MEASURED at HEAD (2026-10-29 01:03), before this commit:
//
//     $ python3 scripts/r507_matrix.py
//     ERROR: .../llm-benchmark/scripts/node_modules/.bin/jest does not exist
//     ... exit 2
//
// and the SAME for r473, r486, r487, r488, r497, r501 -- SEVEN of the nine
// tracked drivers, dead at HEAD, one day after the "fix" shipped.  The two
// shell drivers (r459, r498c) were fine, because the shell resolver
// derives its root from its own path.
//
// THE ROOT CAUSE
//
// Every Python driver called
//
//     return mod.resolve_tool(name, here)     # here = <repo>/scripts
//
// and `resolve_tool.py` joins the root it is given with `node_modules/.bin`
// -- so it looked for `<repo>/scripts/node_modules/.bin/jest`, which does
// not exist.  The toolchain lives at `<repo>/node_modules/.bin`.
//
// The resolver ALREADY derives the correct root by default:
// `repo_root(__file__)` where `__file__` is resolve_tool.py's OWN path.
// Passing `here` OVERRODE that correct derivation with the wrong one.
//
// The failure was LOUD (exit 2, naming the missing path), so it was not
// silent -- but it was silent in the only sense that mattered: the R514
// suite pinned that the resolver is not CALLED WITH `npx`, and that the
// resolver resolves the tool IN THAT TREE.  It never pinned that the
// DRIVER hands the resolver a tree the resolver can use.  The suite's own
// arm B/C built its own sandbox trees and called the resolver DIRECTLY,
// bypassing the driver entirely -- so the defect lived in the SEAM between
// the two, and no arm could see it.
//
// A second, independent defect rode along: `scripts/r488_matrix.py` never
// imported `os`, so its `os.path.join` raised NameError BEFORE it reached
// the resolver at all.
//
// WHAT THIS SUITE PINS
//
//   A. no tracked driver passes a repo-root OVERRIDE to `resolve_tool` --
//      the resolver must derive the root it stands in;
//   B. each tracked driver's `_resolve_tool("jest")` RESOLVES to the
//      repository's own `node_modules/.bin/jest` (behaviour, not source);
//   C. each tracked driver's module imports every name it uses, so the
//      call cannot die on a NameError before the resolver is reached;
//   D. the subject set is NON-EMPTY -- a scan over an empty set is a
//      vacuous green (the "control that cannot fail" shape).
//
// Arms B and C are the load-bearing pair: A says the bad override is
// gone, B and C say the RESOLUTION actually holds.
//
// THE ARM THAT MUST NOT RUN THE DRIVER
//
// Arms B and C exercise the driver's RESOLUTION, never its main(): a
// driver that mutates the owned file would damage the repository under
// test, and the property under test is the RESOLUTION, not the run.
// (R198: observe the DECISION, do not perform the CONSEQUENCE.)

import { describe, it, expect } from '@jest/globals';
import { readFileSync, existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { execFileSync } from 'child_process';

const HERE = dirname(__filename);
const REPO = resolve(HERE, '..', '..');
const SCRIPTS = join(REPO, 'scripts');

/** Every tracked driver under scripts/ (git ls-files, so untracked residue cannot enter). */
function trackedDrivers(): string[] {
  const out = execFileSync('git', ['ls-files', '-z', '--', 'scripts'], {
    cwd: REPO,
    encoding: 'utf8',
  })
    .split('\0')
    .filter((x) => x.length > 0);
  return out.filter((f) => /r\d+_matrix\.(py|sh)$/.test(f));
}

/** The tracked PYTHON drivers -- the ones that call the shared resolver. */
function trackedPythonDrivers(): string[] {
  return trackedDrivers().filter((f) => f.endsWith('.py'));
}

/**
 * Strip COMMENTS from a source file.
 *
 * The gate is about LIVE calls -- prose is allowed to quote the old call
 * shape, because the prose that documents this defect MUST be able to name
 * it.  (The same rule R511 established for the host-path literal.)
 */
function stripComments(src: string): string {
  let out = src.replace(/\/\*[\s\S]*?\*\//g, '');
  out = out.replace(/\/\/[^\n]*/g, '');
  out = out.replace(/(^|\s)#[^\n]*/g, '$1');
  out = out.replace(/"""[\s\S]*?"""/g, '');
  out = out.replace(/'''[\s\S]*?'''/g, '');
  return out;
}

/**
 * The python probe.  It parses the driver, extracts its module-level
 * IMPORTS and its `_resolve_tool` FUNCTION, evaluates ONLY those two, and
 * asks for jest -- the driver's main() is NEVER run.
 *
 * The resolver closes over module-level names (`os`, `Path`), so the probe
 * must supply the driver's OWN imports: evaluating the function alone
 * would raise NameError and measure the PROBE's bug, not the driver's.
 * (R158: a verifier FAIL is triaged against the subject first.)
 */
const PY_PROBE = [
  'import ast, json, sys',
  'path = sys.argv[1]',
  'src = open(path, encoding="utf-8").read()',
  'tree = ast.parse(src)',
  'calls = []',
  'for node in ast.walk(tree):',
  '    if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr == "resolve_tool":',
  '        calls.append(len(node.args))',
  'imports_os = False',
  'imports_path = False',
  'for node in tree.body:',
  '    if isinstance(node, ast.Import):',
  '        for a in node.names:',
  '            if a.name == "os": imports_os = True',
  '            if a.name == "pathlib": imports_path = True',
  '    if isinstance(node, ast.ImportFrom) and node.module == "pathlib":',
  '        imports_path = True',
  'fn = None',
  'imports = []',
  'for node in tree.body:',
  '    if isinstance(node, ast.FunctionDef) and node.name == "_resolve_tool":',
  '        fn = node',
  '    elif isinstance(node, (ast.Import, ast.ImportFrom)):',
  '        imports.append(node)',
  'out = {"calls": calls, "imports_os": imports_os, "imports_path": imports_path}',
  'if fn is not None:',
  '    ns = {"__file__": path, "__name__": "r517_probe"}',
  '    try:',
  '        exec(compile(ast.unparse(ast.Module(body=imports, type_ignores=[])), path, "exec"), ns)',
  '        exec(compile(ast.unparse(ast.Module(body=[fn], type_ignores=[])), path, "exec"), ns)',
  '        out["resolved"] = ns["_resolve_tool"]("jest")',
  '    except BaseException as e:',
  '        out["error"] = "%s: %s" % (type(e).__name__, e)',
  'print(json.dumps(out))',
].join('\n');

interface DriverInfo {
  resolveToolCallArgCounts: number[];
  importsOs: boolean;
  importsPath: boolean;
  usesOs: boolean;
  usesPath: boolean;
  resolved?: string;
  error?: string;
  hasResolver: boolean;
}

function inspectDriver(rel: string): DriverInfo {
  const abs = join(REPO, rel);
  const src = readFileSync(abs, 'utf8');
  const out = execFileSync('python3', ['-c', PY_PROBE, abs], {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  const parsed = JSON.parse(out.trim().split('\n').pop() as string) as {
    calls: number[];
    imports_os: boolean;
    imports_path: boolean;
    resolved?: string;
    error?: string;
  };

  // The LIVE source (comments stripped) decides whether `os` / `Path` are
  // USED at all -- a driver that uses neither needs to import neither.
  const live = stripComments(src);
  return {
    resolveToolCallArgCounts: parsed.calls,
    importsOs: parsed.imports_os,
    importsPath: parsed.imports_path,
    usesOs: /\bos\./.test(live),
    usesPath: /\bPath\s*\(/.test(live),
    resolved: parsed.resolved,
    error: parsed.error,
    hasResolver: parsed.resolved !== undefined || parsed.error !== undefined,
  };
}

describe('R517 — a driver hands the resolver a TREE the resolver can use', () => {
  it('(0) premise: the driver subject set is non-empty and anchored to this file', () => {
    expect(existsSync(join(REPO, 'jest.config.js'))).toBe(true);
    expect(existsSync(join(REPO, 'package.json'))).toBe(true);
    expect(trackedPythonDrivers().length).toBeGreaterThanOrEqual(5);
    // And the shared resolver the drivers depend on is present.
    expect(existsSync(join(SCRIPTS, 'resolve_tool.py'))).toBe(true);
  });

  it('(1) no tracked driver passes a repo-root OVERRIDE to resolve_tool', () => {
    const offenders: string[] = [];
    for (const rel of trackedPythonDrivers()) {
      const info = inspectDriver(rel);
      for (const n of info.resolveToolCallArgCounts) {
        if (n > 1) {
          offenders.push(`${rel}: resolve_tool called with ${n} args (a root override)`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('(2) every tracked driver RESOLVES jest in THIS tree', () => {
    const expected = join(REPO, 'node_modules', '.bin', 'jest');
    const failures: string[] = [];
    for (const rel of trackedPythonDrivers()) {
      const info = inspectDriver(rel);
      if (!info.hasResolver) {
        failures.push(`${rel}: no _resolve_tool function found`);
        continue;
      }
      if (info.error) {
        failures.push(`${rel}: ${info.error}`);
      } else if (info.resolved !== expected) {
        failures.push(`${rel}: resolved ${info.resolved} (expected ${expected})`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('(3) every tracked driver imports the module-level names it uses', () => {
    const failures: string[] = [];
    for (const rel of trackedPythonDrivers()) {
      const info = inspectDriver(rel);
      if (info.usesOs && !info.importsOs) {
        failures.push(`${rel}: uses os. but does not import os`);
      }
      if (info.usesPath && !info.importsPath) {
        failures.push(`${rel}: uses Path( but does not import pathlib`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('(4) the scan subject set is non-empty and contains the shared resolver', () => {
    // A gate that cannot fail is not a gate (R489).
    const drivers = trackedDrivers();
    expect(drivers.length).toBeGreaterThanOrEqual(5);
    // The shared resolver is a script, not a `rNNN_matrix.*` driver, so it
    // is asserted against the WHOLE tracked script set -- not against the
    // driver-filtered list, which would never contain it.
    const trackedScripts = execFileSync('git', ['ls-files', '-z', '--', 'scripts'], {
      cwd: REPO,
      encoding: 'utf8',
    })
      .split('\0')
      .filter((x) => x.length > 0);
    expect(trackedScripts).toContain('scripts/resolve_tool.py');
    // And the drivers really do call the resolver -- otherwise arms 1-3
    // would be vacuously green over a family that stopped using it.
    const callers = trackedPythonDrivers().filter(
      (f) => inspectDriver(f).resolveToolCallArgCounts.length > 0,
    );
    expect(callers.length).toBeGreaterThanOrEqual(5);
  });
});
