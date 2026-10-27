# R501 mutation driver: prove the new suite FAILS on the unfixed source.
#
# Per the R454/R461/R463 discipline: a suite that is green against the
# unfixed source proves nothing. Each arm REVERTS one half of the fix and
# asserts the suite goes RED for the right reason.
#
# Arms:
#   M1  revert the ENV half  (env: buildSandboxEnv() -> no env option)
#   M2  revert the CWD half  (cwd: this.getWorkDir() -> no cwd option)
#   M3  revert BOTH halves
#   M4  NEGATIVE CONTROL: a WEAKER-BUT-EQUALLY-SAFE allow-list
#       (PATH only) -> must stay GREEN. The suite asserts the SECURITY
#       PROPERTY ("no non-allow-listed parent value reaches the child"),
#       not the allow-list's contents, so narrowing the list is not a
#       regression.
#       NOTE: the FIRST version of this arm emptied the list entirely
#       ([]). That arm came back RED, and the RED was a HARNESS artefact,
#       not a security finding: with no PATH in the child environment the
#       OS cannot resolve `python3`, so the child never ran and every
#       assertion about what the child saw failed for the wrong reason.
#       A control must be able to fail because of the thing it controls.
#   M5  NEGATIVE CONTROL (CWD side): the temp ROOT instead of a unique
#       per-process temp dir -> must stay GREEN. The security property is
#       "the child's CWD is not the server's working directory", and the
#       temp root is not the server's working directory either.
#
# Every arm restores the source EXACTLY (md5-compared), and asserts the
# anchor was applied exactly once before scoring.

import hashlib
import os
import re
import shutil
import subprocess
import sys

# R514 (2026-10-28): the runner is resolved from the TREE this script
# stands in, not from `npx`.  `npx` resolves a binary against the CWD's
# package tree, and -- when the network is available -- DOWNLOADS one
# instead of failing: MEASURED, `npx jest --version` in a tree with no
# node_modules returns 30.5.2 while this repository pins jest ^29
# (local resolution 29.7.0).  A driver validated on exactly ONE tree is
# a driver validated on exactly ONE tree; here the tree decides the
# RUNNER, not just the path.  See scripts/resolve_tool.py.
def _resolve_tool(name):
    """Resolve a tool from the TREE this script stands in.

    The import is LAZY, on purpose: a driver is sometimes COPIED into
    another checkout on its own (R513's arm 3 copies a driver into a fake
    repo and resolves its baseline there).  A module-level
    `from resolve_tool import resolve_tool` would make that copy fail to
    import at all -- the driver would break in exactly the situation it
    exists to be tested in.  So the resolver is loaded when it is first
    needed, and if it is genuinely absent the failure is LOUD and names the
    file to copy alongside the driver.
    """
    import importlib.util

    here = os.path.dirname(os.path.abspath(__file__))
    resolver = os.path.join(here, 'resolve_tool.py')
    if not os.path.exists(resolver):
        raise SystemExit(
            '%s does not exist -- this driver resolves its toolchain from\n'
            'the tree it stands in, and the resolver must sit beside it.\n'
            'Copy scripts/resolve_tool.py next to this driver.' % resolver
        )
    spec = importlib.util.spec_from_file_location('_resolve_tool_mod', resolver)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.resolve_tool(name, here)


REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET = os.path.join(REPO, 'src', 'sandbox', 'python-sandbox.ts')
BAK = TARGET + '.r501bak'
SUITE = 'tests/web/r501-sandbox-env-and-cwd-leak.test.ts'

ENV_ANCHOR = "          env: buildSandboxEnv(),\n"
CWD_ANCHOR = "          cwd: this.getWorkDir(),\n"

ARMS = [
    ('M1', 'revert ENV half', [(ENV_ANCHOR, '')], 'RED'),
    ('M2', 'revert CWD half', [(CWD_ANCHOR, '')], 'RED'),
    ('M3', 'revert BOTH halves', [(ENV_ANCHOR, ''), (CWD_ANCHOR, '')], 'RED'),
    ('M4', 'negative control: allow-list narrowed to PATH only',
     [("export const SANDBOX_ENV_ALLOWLIST = ['PATH', 'LANG', 'LC_ALL', 'TZ'] as const;",
       "export const SANDBOX_ENV_ALLOWLIST = ['PATH'] as const;")], 'GREEN'),
    ('M5', 'negative control: temp ROOT instead of a unique temp dir',
     [("          cwd: this.getWorkDir(),\n",
       "          cwd: tmpdir(),\n")], 'GREEN'),
]


def md5(path):
    with open(path, 'rb') as fh:
        return hashlib.md5(fh.read()).hexdigest()


def run_suite():
    env = dict(os.environ)
    env.pop('NODE_OPTIONS', None)
    proc = subprocess.run(
        [_resolve_tool("jest"), SUITE, "--runInBand"],
        cwd=REPO, capture_output=True, text=True, env=env,
    )
    out = proc.stdout + proc.stderr
    # Parse the authoritative summary line (never a per-file count).
    m = re.search(r'Tests:\s+(?:(\d+) failed, )?(?:(\d+) passed, )?(\d+) total', out)
    if not m:
        print('HARNESS: could not parse the Tests summary line')
        print(out[-3000:])
        return None, out
    failed = int(m.group(1) or 0)
    passed = int(m.group(2) or 0)
    total = int(m.group(3))
    if total == 0:
        print('HARNESS: 0 total tests -> compile failure, not a kill')
        return None, out
    return (failed, passed, total), out


def main():
    # R477 PREFLIGHT: refuse to run on an already-MUTATED OWNED file.
    #
    # The anchors are the two lines the mutation removes.  If they are
    # absent from the TARGET before the matrix starts, the tree is ALREADY
    # mutated -- most likely residue from a previous run that was SIGKILLed
    # (a SIGKILL skips `finally:` AND skips the signal/atexit guard, because
    # SIGKILL is not catchable).  Running the matrix on such a tree would
    # produce verdicts about the WRONG subject: the arms would be applied on
    # top of an already-mutated baseline.
    #
    # So the preflight REFUSES, and points at the out-of-tree snapshot that
    # a previous run left behind (which survives SIGKILL precisely because
    # it is not in the repository).
    with open(TARGET) as fh:
        _pre = fh.read()
    _missing = [a for a in (ENV_ANCHOR, CWD_ANCHOR) if a not in _pre]
    if _missing:
        print('PREFLIGHT REFUSED: the target file is ALREADY MUTATED.')
        print('  missing anchor(s): ' + repr(_missing))
        print('  The tree was left mutated by a run that was SIGKILLed.')
        print('  Restore it from the out-of-tree snapshot, e.g.:')
        print('    cp <snapshot-dir>/python-sandbox.ts.snapshot ' + TARGET)
        print('  then re-run this matrix.')
        return 4

    # R477 HARD restore guard.
    #
    # `finally:` is NOT durability: it does not survive SIGKILL, and a cron
    # tick that is killed by the runtime's tool timeout leaves the tree
    # MUTATED.  That is not hypothetical -- it happened here.  The R501
    # driver was killed mid-arm (M3 = BOTH halves reverted), so its
    # `finally:` never ran and `src/sandbox/python-sandbox.ts` was left as
    # the MUTANT: the fix had been removed from the `spawn()` call while the
    # helper that builds it still sat in the file.  The next tick would have
    # inherited a tracked source file with the security fix silently deleted.
    #
    # So the restore is registered as a signal handler AND an atexit hook,
    # which covers SIGTERM/SIGINT/SIGHUP and normal exit.  SIGKILL is still
    # uncoverable by any in-process mechanism (R477-2) -- for that, the
    # snapshot must live OUT OF TREE, which is what the `snap` file below is.
    _restore_done = {'flag': False}

    def restore_now():
        if _restore_done['flag']:
            return
        _restore_done['flag'] = True
        try:
            with open(BAK) as fh:
                original = fh.read()
            with open(TARGET, 'w') as fh:
                fh.write(original)
        except OSError:
            pass

    import atexit
    import signal
    atexit.register(restore_now)
    for _sig in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
        try:
            signal.signal(_sig, lambda *_: (restore_now(), os._exit(3)))
        except (ValueError, OSError):
            pass

    baseline_md5 = md5(TARGET)
    # R477-2: the snapshot must live OUT OF TREE.  An in-tree snapshot is
    # destroyed by the same event that kills the driver, and it also pollutes
    # `git status` (the observed residue: `src/sandbox/python-sandbox.ts.r501bak`
    # sitting untracked inside `src/`).
    #
    # `BAK` is rebound to the out-of-tree path, so it must be declared
    # `global` -- `restore_now` reads the module-level name, and a local
    # rebinding would leave the guard restoring from a path that no longer
    # exists (the guard would then silently do nothing, which is the exact
    # failure it exists to prevent).
    global BAK
    import tempfile
    snap_dir = tempfile.mkdtemp(prefix='r501-matrix-')
    BAK = os.path.join(snap_dir, 'python-sandbox.ts.snapshot')
    shutil.copy2(TARGET, BAK)
    try:
        results = []
        for name, desc, edits, expect in ARMS:
            with open(BAK) as fh:
                src = fh.read()
            for old, new in edits:
                count = src.count(old)
                if count != 1:
                    print(f'{name} HARNESS: anchor occurs {count} times (expected exactly 1): {old!r}')
                    results.append((name, desc, 'HARNESS'))
                    src = None
                    break
                src = src.replace(old, new, 1)
            if src is None:
                continue
            with open(TARGET, 'w') as fh:
                fh.write(src)

            parsed, out = run_suite()
            if parsed is None:
                results.append((name, desc, 'HARNESS'))
                continue
            failed, passed, total = parsed
            verdict = 'RED' if failed > 0 else 'GREEN'
            ok = (verdict == expect)
            print(f'{name} {desc}: failed={failed} passed={passed} total={total} -> {verdict} (expected {expect}) {"OK" if ok else "MISMATCH"}')
            if not ok:
                print(out[-2500:])
            results.append((name, desc, verdict if ok else f'MISMATCH({verdict})'))

            # restore
            with open(BAK) as fh:
                restored_src = fh.read()
            with open(TARGET, 'w') as fh:
                fh.write(restored_src)
            assert md5(TARGET) == baseline_md5, 'restore is not byte-identical'

        print('\n=== SUMMARY ===')
        for name, desc, verdict in results:
            print(f'{name} {desc}: {verdict}')
        hard = [r for r in results if r[2] not in ('RED', 'GREEN')]
        if hard:
            print(f'HARNESS/MISMATCH arms present: {len(hard)}')
            return 2
        return 0
    finally:
        if os.path.exists(BAK):
            shutil.copy2(BAK, TARGET)
        # The snapshot lives OUT OF TREE, so removing it cannot touch the
        # repository.  `shutil.rmtree` rather than `os.remove`, because the
        # snapshot is now a file inside a temp DIRECTORY.
        try:
            import shutil as _shutil
            _shutil.rmtree(snap_dir, ignore_errors=True)
        except Exception:
            pass
        assert md5(TARGET) == baseline_md5, 'final restore is not byte-identical'
        print('restore OK (md5-identical)')


if __name__ == '__main__':
    sys.exit(main())
