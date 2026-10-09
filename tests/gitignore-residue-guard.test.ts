// tests/gitignore-residue-guard.test.ts
//
// THE FINDING. This repo's residue guards were written one pattern at a time, and
// the newest shape was never added. Measured at 2026-10-10 00:03, before this fix:
//
//   git status --short | grep -c '^??'   -> 301 untracked paths
//   git add -An | wc -l                  -> 359 paths `git add -A` would stage
//   git check-ignore -v _tmp/anything.md -> exit 1 (NOT ignored)
//
// Every one of those 301 is agent residue: mutation backups
// (src/*.ts.orig.m9, src/*.ts.restore), commit-message drafts, coverage probe
// output. woclaw hit the identical wall on 2026-10-07 and closed it there
// (hub/test/gitignore_residue_guard.test.ts) — the fix was never mirrored here.
//
// SCOPE, stated honestly. `files` in package.json already excludes _tmp/, so
// `npm pack` never shipped any of it (verified: 149 files in the tarball, 0
// under _tmp/). The exposure was `git add -A` staging agent scratch, and 301
// lines of status noise obscuring real changes — not a publish leak. This suite
// does not claim otherwise.
//
// WHAT THIS DOES NOT DO. It deletes nothing. It does not untrack the four
// tick-notes already committed under _tmp/ in earlier rounds — ignore rules do
// not affect already-tracked paths, and removing them from history is a
// Father-gated decision, not a hygiene rule.
import { execFileSync } from 'child_process';
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { join, relative } from 'path';

const REPO_ROOT = join(__dirname, '..');

/** check-ignore: exit 0 = ignored, exit 1 = NOT ignored, anything else = error. */
function checkIgnore(paths: string[]): { probe: string; exitCode: number }[] {
  return paths.map((probe) => {
    try {
      execFileSync('git', ['check-ignore', '-q', probe], { cwd: REPO_ROOT, stdio: 'ignore' });
      return { probe, exitCode: 0 };
    } catch (err: unknown) {
      return { probe, exitCode: (err as { status?: number }).status ?? -1 };
    }
  });
}

/** Directories where shipped source lives; residue must never sit in them. */
const SWEPT = [join(REPO_ROOT, 'src'), join(REPO_ROOT, 'tests')];

describe('repo .gitignore: agent residue is ignored, and stays ignored', () => {
  it('K — CONTROL. a path this suite expects to be ignored IS ignored', () => {
    // Without this, "nothing is broken" could mean check-ignore never returns 0
    // for anything (the R420 lesson: aim the detector, not the subject).
    expect(checkIgnore(['src/index.ts.orig'])[0].exitCode).toBe(0);
  });

  it('K2 — CONTROL. a tracked source path is NOT ignored', () => {
    // The other half: a rule set so broad it eats real source would pass every
    // assertion below while destroying the repo.
    expect(checkIgnore(['src/index.ts'])[0].exitCode).toBe(1);
  });

  it('1) .gitignore pins the probe tree (_tmp/) as its own lines', () => {
    const content = readFileSync(join(REPO_ROOT, '.gitignore'), 'utf-8');
    expect(content).toMatch(/^_tmp\/$/m);
    expect(content).toMatch(/^\*\*\/_tmp\/$/m);
  });

  it('2) git check-ignore exits 0 for the residue shapes that actually accumulated', () => {
    // The exact filenames measured in the untracked set, not invented probes:
    // a mutant backup, a commit-message draft, and a nested coverage report.
    const probes = [
      '_tmp/evaluator.ts.orig.m9',
      '_tmp/commit-msg-run-dispatch-defaults-0603.txt',
      '_tmp/cov-anchor-0403b/coverage-final.json',
      'tests/_tmp/probe.json',
    ];
    expect(checkIgnore(probes)).toEqual(probes.map((probe) => ({ probe, exitCode: 0 })));
  });

  it('3) `git add -A` stages no residue (the measured failure, re-measured)', () => {
    // The assertion that failed before the fix. `-n` is a dry run, so nothing is
    // staged; parse must not rely on `wc -l` (#137), so read the lines directly.
    let stdout = '';
    try {
      stdout = execFileSync('git', ['add', '-An'], { cwd: REPO_ROOT, encoding: 'utf-8' });
    } catch {
      stdout = '';
    }
    const staged = stdout.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
    const residue = staged.filter((l) => l.includes('_tmp/'));
    expect(residue).toEqual([]);
  });

  it('4) no .orig/.rej residue is live in src/ or tests/ right now', () => {
    // A real filesystem sweep, so the guard is not the only thing standing.
    const residue: string[] = [];
    const walk = (dir: string) => {
      if (!existsSync(dir)) return;
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (/\.(orig|rej)$/.test(e.name)) residue.push(relative(REPO_ROOT, full));
      }
    };
    for (const dir of SWEPT) walk(dir);
    expect(residue).toEqual([]);
  });

  it('5) the sweep arm detects a planted residue file (harness control)', () => {
    // Without planting one, case 4 could pass because the walk never ran
    // (a typo'd path, a renamed dir) rather than because the tree is clean.
    const planted = join(REPO_ROOT, 'src', '__hygiene_control__.orig');
    writeFileSync(planted, 'planted by the residue guard control case\n');
    let residue: string[] = [];
    try {
      const walk = (dir: string) => {
        if (!existsSync(dir)) return;
        for (const e of readdirSync(dir, { withFileTypes: true })) {
          const full = join(dir, e.name);
          if (e.isDirectory()) walk(full);
          else if (/\.(orig|rej)$/.test(e.name)) residue.push(relative(REPO_ROOT, full));
        }
      };
      for (const dir of SWEPT) walk(dir);
    } finally {
      rmSync(planted, { force: true });
    }
    expect(residue).toEqual(['src/__hygiene_control__.orig']);
    expect(existsSync(planted)).toBe(false);
  });
});
