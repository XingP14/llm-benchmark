#!/usr/bin/env python3
"""
R507 mutation matrix (llm-benchmark) -- the quote-scan line-bound.

Discipline carried from R473 / R475 / R477 / R481 / R482 / R486 / R487 /
R488 / R497:
  * control FIRST: the suite must be green before any mutation;
  * declare OWNED files, assert each is at a PINNED BASELINE before injecting
    (R477 D1) -- a dirty owned file means somebody else owns it;
  * snapshot BEFORE any injection, restore BY BYTES (never `git checkout` --
    R446-1: `git checkout` destroys other agents' uncommitted work);
  * assert the needle was UNIQUELY anchored BEFORE writing (R477: a needle
    that matches twice half-applies while the driver reports success);
  * assert the text actually CHANGED after writing (R456-10c: `str.replace`
    returns the string unchanged when the needle is absent, and a `count==1`
    assertion still passes -- `assert new != old` is the check that catches
    it);
  * a mutation that fails to inject is NOT-INJECTED, never SURVIVED;
  * a COMPILE-BROKEN arm is HARNESS, never SURVIVED;
  * jest prints its human-readable report to STDERR -- parse stdout + stderr
    (R487 driver defect #1, which made every arm read SURVIVED);
  * parse the summary EXPLICITLY and assert it against the known suite size
    (R497-11c): under a glyph-counting parser the count is the number of
    TEST FILES, not tests, and a broken parser reads as a green control.

Arms
----
  M1  REVERT of the shipped line-bound: the single/double-quote scan loses
      its one-line bound and runs to the next quote anywhere in the file.
      KILLS arm 52.  DOES NOT KILL arm 44 -- and that asymmetry IS the
      finding this round exists to record.
  N1  NEGATIVE CONTROL: an equivalent spelling of the same predicate
      (`chr(10)` instead of the `"\n"` literal) -- MUST SURVIVE.
  N2  NEGATIVE CONTROL: a comment that changes nothing -- MUST SURVIVE.

WHY THIS DRIVER IS NOT `r459_matrix.sh`
---------------------------------------
`scripts/r459_matrix.sh` (shipped 2026-10-15, commit 02908f6) scores M1
against arm 44 ONLY, and it restores the mutated source with

    cp /root/.hermes/cache/scratch/r459_fix.py "$S"

-- a path in the PRUNED SCRATCH DIRECTORY, not in the repo.  MEASURED
2026-10-27: that file no longer exists, so the restore silently fails
(`cp: cannot stat ...`, rc=1) and the tracked source
`scripts/sweep-no-runtime-import.py` is LEFT MUTATED (md5 d024ffb0... vs
baseline b2928799...).  The driver's own md5 check runs AFTER the failed
restore, so it reports the damage only after doing it.  This driver restores
from an in-memory snapshot taken before the mutation, so the restore cannot
depend on any external file.
"""
import hashlib
import os
import re
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
from pathlib import Path

def _resolve_tool(name):
    """Resolve a tool from the TREE this script stands in.

    R517 (2026-10-29): the call below passes NO root override, and that
    is load-bearing.  It used to pass `here` -- the directory THIS driver
    lives in, <repo>/scripts -- and resolve_tool.py joins the root it is
    given with `node_modules/.bin`, so it looked for
    <repo>/scripts/node_modules/.bin/jest, which does not exist.  MEASURED:
    SEVEN of the nine tracked drivers (r473, r486, r487, r488, r497, r501,
    r507) died at exit 2 on a clean tree, one day after R514 shipped the
    resolver.  The resolver already derives the correct root from its OWN
    path (`repo_root(__file__)`), so passing a root OVERRODE a correct
    derivation with a wrong one.  With no argument the resolver uses the
    tree IT stands in -- which also keeps the copied-driver case correct
    (R513 arm 3 copies a driver into another checkout).

    The import is LAZY, on purpose: a driver is sometimes COPIED into
    another checkout on its own (R513's arm 3 copies r507_matrix.py
    into a fake repo and resolves its baseline there).  A module-level
    `from resolve_tool import resolve_tool` would make that copy fail to
    import at all -- the driver would break in exactly the situation it
    exists to be tested in.  So the resolver is loaded when it is first
    needed, and if it is genuinely absent the failure is LOUD and names
    the file to copy alongside the driver.
    """
    import importlib.util

    here = str(Path(__file__).resolve().parent)
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
    return mod.resolve_tool(name)

REPO = Path(__file__).resolve().parent.parent
if not (REPO / "jest.config.js").is_file():
    raise SystemExit(
        "ABORT: cannot derive a repository root above %s (no jest.config.js) -- "
        "this driver must live inside a checkout of the repository it measures."
        % Path(__file__).resolve()
    )

SUITE = "tests/sweep-no-runtime-import.test.ts"
OWNED = [REPO / "scripts" / "sweep-no-runtime-import.py"]
EXPECTED_TOTAL = 53

# The owned file carries no uncommitted change (the R507 change is in the
# TEST file), so the pre-check is a plain BASELINE-HASH check.
#
# R513 (2026-10-28): the baseline used to be a TRANSCRIBED hash literal
# (BASELINE_MD5 = "b2928799d6e4c50462ad8caaec2edfd3"), pinned when this
# driver was written.  One benign commit later -- a trailing comment on the
# owned file -- the pin was STALE and the driver ABORTED on a perfectly
# clean tree:
#
#     ABORT: owned files are not at the pinned baseline:
#     sweep-no-runtime-import.py md5 2815efbc != pinned baseline b2928799
#
# MEASURED 2026-10-28: `python3 scripts/r507_matrix.py` at HEAD exits 2
# with that message once a single benign commit lands on the owned file.
#
# A pinned hash is the SAME defect class as the hardcoded path: a constant
# transcribed at one moment in time, validated on exactly one moment in
# time.  R511 fixed exactly this in scripts/r497_matrix.py; the fix did not
# reach its SIBLING, which is why this driver still carried the defect.
#
# The baseline is now DERIVED from the repository's own HEAD blob, which is
# the same thing the guard MEANS: "has a sibling edited this file since the
# last commit?"  A sibling edit makes the working tree differ from HEAD, so
# the guard still fires; a legitimate new COMMIT changes both, so the guard
# no longer misfires.  The guard's INTENT is preserved and its constant is
# gone.
def _head_blob_md5(rel: str) -> str:
    """The md5 of `rel` as the repository's HEAD records it."""
    out = subprocess.run(
        ["git", "show", "HEAD:" + rel],
        cwd=REPO, capture_output=True, check=True,
    ).stdout
    return hashlib.md5(out).hexdigest()


BASELINE_MD5 = _head_blob_md5("scripts/sweep-no-runtime-import.py")

ARM44 = "a regex literal holding a quote"
ARM52 = "a MALFORMED quote"

# ------------------------------------------------------------------ needles

# The shipped guard: a single/double-quoted string cannot contain a raw
# newline, so a newline means this was never a string opener.
GUARD_OLD = '''                if text[i] == "\\n":
                    break
                out.append(text[i])
                i += 1
            if not closed:'''

# M1 -- the line-bound is reverted: the scan runs to the next quote anywhere.
GUARD_M1 = '''                out.append("\\n" if text[i] == "\\n" else text[i])
                i += 1
            if not closed:'''

# N1 -- an EQUIVALENT SPELLING: `chr(10)` is the same predicate, differently
# written.  It must compile and it must be behaviour-neutral.
GUARD_N1 = '''                if text[i] == chr(10):
                    break
                out.append(text[i])
                i += 1
            if not closed:'''

# N2 -- a COMMENT that changes nothing.  The first draft of this arm
# replaced the block with a BYTE-IDENTICAL copy of itself, so the
# replacement was a no-op and the arm scored NOT-INJECTED.  A control that
# does not change the file is not a control: it exercises nothing.
GUARD_N2 = '''                # negative control: a comment that changes nothing
                if text[i] == "\\n":
                    break
                out.append(text[i])
                i += 1
            if not closed:'''

ARMS = [
    ("M1", ARM44, GUARD_OLD, GUARD_M1,
     "REVERT of the shipped line-bound (arm 44 -- the arm r459_matrix.sh claims kills it)",
     "SURVIVED", "the arm cannot see this mutation; the claim in r459_matrix.sh is FALSE"),
    ("M1", ARM52, GUARD_OLD, GUARD_M1,
     "REVERT of the shipped line-bound (arm 52 -- the arm that actually kills it)",
     "KILLED", "the malformed-quote fixture reaches the quote-scan branch"),
    ("N1", ARM44, GUARD_OLD, GUARD_N1,
     "NEGATIVE CONTROL: equivalent spelling of the predicate", "SURVIVED", ""),
    ("N1", ARM52, GUARD_OLD, GUARD_N1,
     "NEGATIVE CONTROL: equivalent spelling of the predicate", "SURVIVED", ""),
    ("N2", ARM44, GUARD_OLD, GUARD_N2,
     "NEGATIVE CONTROL: a comment added inside the guard", "SURVIVED", ""),
    ("N2", ARM52, GUARD_OLD, GUARD_N2,
     "NEGATIVE CONTROL: a comment added inside the guard", "SURVIVED", ""),
]


def md5(p: Path) -> str:
    return hashlib.md5(p.read_bytes()).hexdigest()


def clean_check():
    p = OWNED[0]
    actual = md5(p)
    if actual != BASELINE_MD5:
        return False, "%s md5 %s != pinned baseline %s" % (
            p.name, actual[:8], BASELINE_MD5[:8])
    return True, ""


def inject(p: Path, old: str, new: str, expect_count: int = 1):
    before = p.read_text(encoding="utf-8")
    n = before.count(old)
    if n != expect_count:
        return "not-injected", "needle count %d != %d" % (n, expect_count)
    after = before.replace(old, new, expect_count)
    if after == before:
        return "not-injected", "replacement was a no-op"
    tmp = p.with_suffix(p.suffix + ".r507tmp")
    tmp.write_text(after, encoding="utf-8")
    os.replace(tmp, p)
    return "injected", "%d site(s)" % expect_count


def run_arm(pattern):
    """Run ONE arm (jest -t) and return (passed, failed, total, detail)."""
    r = subprocess.run(
        [_resolve_tool("jest"), SUITE, "--runInBand", "--coverage=false", "-t", pattern],
        cwd=REPO, capture_output=True, text=True, timeout=600,
    )
    out = r.stdout + r.stderr
    summary = None
    for line in out.splitlines():
        if line.startswith("Tests:"):
            summary = line.strip()
    if summary is None:
        return 0, -1, -1, "TESTS-LINE-ABSENT\n" + out[-3000:]
    m = re.search(r"Tests:\s+(?:(\d+)\s+failed,\s*)?(?:(\d+)\s+skipped,\s*)?"
                  r"(?:(\d+)\s+passed,\s*)?(\d+)\s+total", summary)
    if not m:
        return 0, -1, -1, "SUMMARY-UNPARSEABLE: %s\n" % summary + out[-3000:]
    failed = int(m.group(1) or 0)
    skipped = int(m.group(2) or 0)
    passed = int(m.group(3) or 0)
    total = int(m.group(4))
    return passed, failed, total, summary


def restore(snap):
    for p, data in snap.items():
        tmp = p.with_suffix(p.suffix + ".r507restore")
        tmp.write_bytes(data)
        os.replace(tmp, p)


def main():
    print("=" * 78)
    print("R507 MUTATION MATRIX (llm-benchmark) -- the quote-scan line-bound")
    print("=" * 78)

    ok, dirty = clean_check()
    if not ok:
        print("ABORT: owned files are not at the pinned baseline:\n%s" % dirty)
        return 2
    print("pre-check: owned file at pinned baseline  [OK]")

    snap = {p: p.read_bytes() for p in OWNED}
    base_md5 = {p: md5(p) for p in OWNED}
    print("baseline md5:", {p.name: base_md5[p][:8] for p in OWNED})

    print("\n--- CONTROL (both arms must be green before any mutation) ---")
    for label, pattern in (("arm44", ARM44), ("arm52", ARM52)):
        p_, f_, t_, detail = run_arm(pattern)
        print("control %s: %s passed / %s failed / %s total | %s"
              % (label, p_, f_, t_, detail))
        if f_ != 0 or p_ != 1 or t_ != EXPECTED_TOTAL:
            print("CONTROL NOT GREEN -- aborting")
            restore(snap)
            return 3

    results = []
    for aid, arm, old, new, desc, expect, note in ARMS:
        print("\n--- %s / %s: %s" % (aid, arm, desc))
        print("    expectation: %s %s" % (expect, ("-- " + note) if note else ""))
        restore(snap)
        status, detail = inject(OWNED[0], old, new, 1)
        if status != "injected":
            print("  %s NOT-INJECTED (%s) -- NOT counted as SURVIVED" % (aid, detail))
            results.append((aid, arm, desc, "NOT-INJECTED"))
            continue
        if md5(OWNED[0]) == base_md5[OWNED[0]]:
            print("  %s NOT-INJECTED (md5 unchanged) -- NOT counted as SURVIVED" % aid)
            results.append((aid, arm, desc, "NOT-INJECTED"))
            restore(snap)
            continue

        # The mutated file is PYTHON: a syntax error would make the HARNESS
        # itself fail, which would read as a kill.  Compile it first.
        comp = subprocess.run([sys.executable, "-m", "py_compile", str(OWNED[0])],
                              capture_output=True, text=True, timeout=120)
        if comp.returncode != 0:
            err = (comp.stdout + comp.stderr).strip().splitlines()
            print("  %s HARNESS (python compile failed) -- NOT counted as SURVIVED" % aid)
            if err:
                print("   ", err[-1][:200])
            results.append((aid, arm, desc, "HARNESS"))
            restore(snap)
            continue

        p2, f2, t2, detail2 = run_arm(arm)
        if f2 < 0:
            verdict = "ERROR"
        elif f2 > 0:
            verdict = "KILLED"
            detail2 = "%d arm(s) red | %s" % (f2, detail2)
        else:
            verdict = "SURVIVED"
            detail2 = "suite stayed green | %s" % detail2
        print("  %s %s: %s" % (aid, verdict, detail2))
        results.append((aid, arm, desc, verdict))
        restore(snap)
        if any(md5(p) != base_md5[p] for p in OWNED):
            print("  !! RESTORE FAILED")
            return 4

    print("\n--- POST-CONTROL (both arms must be green again) ---")
    for label, pattern in (("arm44", ARM44), ("arm52", ARM52)):
        p_, f_, t_, detail = run_arm(pattern)
        print("post-control %s: %s passed / %s failed / %s total | %s"
              % (label, p_, f_, t_, detail))
        if f_ != 0 or p_ != 1 or t_ != EXPECTED_TOTAL:
            print("POST-CONTROL RED -- aborting")
            return 5

    print("\n" + "=" * 78)
    print("SUMMARY")
    for aid, arm, desc, verdict in results:
        print("  %-3s %-11s %-14s %s" % (aid, arm, verdict, desc[:60]))
    killed = sum(1 for r in results if r[3] == "KILLED")
    survived = sum(1 for r in results if r[3] == "SURVIVED")
    ni = sum(1 for r in results if r[3] == "NOT-INJECTED")
    harness = sum(1 for r in results if r[3] == "HARNESS")
    errors = sum(1 for r in results if r[3] == "ERROR")
    print("\n  KILLED=%d  SURVIVED=%d  NOT-INJECTED=%d  HARNESS=%d  ERROR=%d"
          % (killed, survived, ni, harness, errors))
    print("  final md5 match: %s" % all(md5(p) == base_md5[p] for p in OWNED))
    print("=" * 78)
    if ni or harness or errors:
        return 6
    # The expectations are the POINT of the matrix, so they are asserted, not
    # just printed: M1 must be KILLED by arm 52 and SURVIVED by arm 44, and
    # both negative controls must SURVIVE everywhere.
    got_map = {(r[0], r[1]): r[3] for r in results}
    bad = []
    for aid, arm, old, new, desc, expect, note in ARMS:
        got = got_map.get((aid, arm))
        if got != expect:
            bad.append("%s/%s expected %s got %s" % (aid, arm, expect, got))
    if bad:
        print("\nFAIL: %d row(s) did not match the expected verdict:" % len(bad))
        for b in bad:
            print("   ", b)
        return 7
    print("\nPASS: every row matched its expected verdict.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
