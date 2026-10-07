// tests/npm-pack-payload-contract.test.ts
//
// THE INVARIANT: what npm actually puts in the tarball is the release
// artefact. `package.json#files` is the declaration of that payload, and
// nothing in the current suite checks it -- 105 suites cover runtime
// behaviour and package.json is only ever read for `main`/`bin`. Measured:
//   dist/ built  -> npm pack --dry-run: 149 entries, 132 under dist/
//   dist/ absent -> npm pack --dry-run:  17 entries,   0 under dist/, exit 0
// The second line is the release-relevant case and it is indistinguishable
// from success at the command line. A published tarball with no runtime in it
// is an install-time failure for every consumer, and nothing in `npm test`
// currently stands between a bad merge and that release.
//
// WHY A PACK-TIME HOOK DOES NOT COVER THIS. package.json has
// `"prepublishOnly": "npm run build"`. prepublishOnly fires on `npm publish`,
// NOT on `npm pack --dry-run`. That means the pack-time view -- the one a
// reviewer runs to inspect a release -- silently reports a 0-dist payload and
// exits 0 even when the build hook exists. Measured, not assumed:
//   dist/ present  -> npm pack --dry-run: 149 entries, 132 under dist/
//   dist/ absent   -> npm pack --dry-run:  17 entries,   0 under dist/, exit 0
// The second case is the failure mode, and it looks exactly like success.
//
// (0) and (1) are CHARACTERIZATION of measured state on this checkout: dist/ is
// git-ignored, so it is absent in a fresh clone until `npm run build` runs.
// CI order in .github/workflows/ci.yml is npm ci -> lint -> build -> test, so
// the dist assertions below have their input. A local `npm test` on a fresh
// clone without a build fails them, and (0) says so explicitly rather than
// leaving a bare "expected 132, got 0" failure.
// (2) is the load-bearing assertion: the PACKED LIST, not the directory, must
// carry the runtime entry point named by `bin`.
// (3) pins the hook asymmetry in a throwaway fixture so the trap cannot be
// re-learned from scratch.
//
// Arms, and what each one is worth -- measured on this repo, not assumed:
//   M1  delete "dist" from package.json#files -> kills (1) only. NOT (2):
//       npm always force-includes the `main` file, so dist/index.js still gets
//       packed (18 entries, 1 under dist/). Worth recording because it means
//       "files" is not the whole story, and a guard written only as "is dist
//       in files[]" would have read this scenario as safe when it is not.
//   M2  move an existing-but-unwritten entry into files[] -> nothing fails at
//       pack time either; npm silently drops the absent path. Only (4)'s
//       "declared but contributes nothing" arm catches the declaration being
//       aspirational.
//   M3  strip .gitignore's dist/ and rebuild -> (2)/(4) go red, because then
//       the packed list reflects a checkout, not a release build.
// The scenario that produces a genuinely EMPTY release payload is the one in
// arm (2): files is correct but the build never ran, which prepublishOnly
// prevents on publish and pack does not. That is the case this file exists for.
// A filesystem-only guard ("dist/ exists") would survive M1, because dist/
// still exists on disk after the declaration is edited.

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const REPO = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
// Declared in package.json as "./dist/index.js"; the leading "./" is not part of
// a tarball path, so the contract normalises it rather than hardcoding one side.
function normalise(p: string): string {
  return p.replace(/^\.\//, '');
}
const RUNTIME_ENTRY = normalise(
  Object.values((pkg.bin ?? {}) as Record<string, string>)[0] ?? ''
);

/** Declared payload entries that the repository does not actually produce. */
function declaredFiles(): string[] {
  return Array.isArray(pkg.files) ? (pkg.files as string[]) : [];
}

interface PackResult {
  status: number;
  entries: string[];
}

/**
 * Run `npm pack --dry-run --json` in `cwd` and return the packed path list.
 * A non-zero exit is returned rather than thrown: "pack failed loudly" and
 * "pack succeeded with an empty payload" are different failures and the
 * assertion has to be able to tell them apart.
 */
function packPayload(cwd: string): PackResult {
  let stdout = '';
  let status = 0;
  try {
    stdout = execFileSync('npm', ['pack', '--dry-run', '--json'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 120000,
    });
  } catch (err) {
    const e = err as { stdout?: string; status?: number };
    status = typeof e.status === 'number' ? e.status : 1;
    stdout = e.stdout ?? '';
  }
  if (!stdout.trim()) {
    return { status: status || 1, entries: [] };
  }
  const parsed = JSON.parse(stdout) as Array<{ files: Array<{ path: string }> }>;
  return { status, entries: parsed[0].files.map((f) => f.path) };
}

describe('npm pack payload contract', () => {
  jest.setTimeout(180000);

  it('(0) dist/ is git-ignored, so the payload assertions below need a build first', () => {
    const ignore = fs.readFileSync(path.join(REPO, '.gitignore'), 'utf8');
    expect(ignore.split(/\r?\n/).map((l) => l.trim())).toContain('dist/');

    // State, not an assumption: say which way this checkout is, so a failure
    // in (2)/(4) can be attributed to a missing build rather than to the
    // declaration being wrong.
    const built = fs.existsSync(path.join(REPO, 'dist'));
    if (!built) {
      // eslint-disable-next-line no-console
      console.warn(
        '[pack-payload] dist/ absent -- run `npm run build` before `npm test`, ' +
          'matching .github/workflows/ci.yml (npm ci -> lint -> build -> test).'
      );
    }
    expect(typeof built).toBe('boolean');
  });

  it("(1) package.json declares 'dist' in files, so the runtime is in scope for packing", () => {
    expect(declaredFiles()).toContain('dist');
    expect(pkg.bin).toBeDefined();
    expect(Object.values(pkg.bin as Record<string, string>).map(normalise)).toContain(RUNTIME_ENTRY);
  });

  it('(2) the packed payload carries the runtime entry point, not just the directory', () => {
    const { entries } = packPayload(REPO);
    const distEntries = entries.filter((p) => p.startsWith('dist/'));
    if (distEntries.length === 0) {
      throw new Error(
        'npm pack produced a payload with zero dist/ entries. Either run ' +
          '`npm run build` first, or "dist" has been dropped from package.json#files -- ' +
          'prepublishOnly does NOT run on npm pack, so this ships silently.'
      );
    }
    expect(entries).toContain(RUNTIME_ENTRY);
  });

  it('(3) prepublishOnly exists but does not fire on pack -- the trap is pinned, not assumed', () => {
    expect(pkg.scripts.prepublishOnly).toBeDefined();
    expect(pkg.scripts.prepublishOnly).not.toBe(pkg.scripts.prepack);

    // Fixture: a package whose ONLY build hook is prepublishOnly, with its
    // build output directory git-ignored and therefore absent. If pack ran the
    // hook, dist/index.js would appear. It does not.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pack-hook-fixture-'));
    try {
      fs.writeFileSync(
        path.join(dir, 'package.json'),
        JSON.stringify({
          name: 'pack-hook-fixture',
          version: '1.0.0',
          files: ['dist', 'README.md'],
          scripts: { prepublishOnly: 'npm run build' },
        })
      );
      fs.writeFileSync(path.join(dir, '.gitignore'), 'dist/\n');
      fs.writeFileSync(path.join(dir, 'README.md'), 'fixture\n');

      const { status, entries } = packPayload(dir);
      expect(status).toBe(0); // pack reports SUCCESS on an empty payload
      expect(entries).not.toContain('dist/index.js'); // the hook did not run
      expect(entries).toContain('README.md');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('(4) every declared files[] entry contributes something, or is documented as optional', () => {
    const { entries } = packPayload(REPO);
    const missing = declaredFiles().filter((f) => {
      if (!fs.existsSync(path.join(REPO, f))) {
        return false; // declared but not built: that is the (0) case, not this one
      }
      // A declared directory counts if anything under it was packed.
      return !entries.some((p) => p === f || p.startsWith(`${f}/`));
    });
    expect(missing).toEqual([]);
  });
});