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
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SUITE = "tests/sweep-no-runtime-import.test.ts"
OWNED = [REPO / "scripts" / "sweep-no-runtime-import.py"]
EXPECTED_TOTAL = 53

# The owned file carries no uncommitted change (the R507 change is in the
# TEST file), so the pre-check is a plain BASELINE-HASH check.
BASELINE_MD5 = "b2928799d6e4c50462ad8caaec2edfd3"

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
        ["npx", "jest", SUITE, "--runInBand", "--coverage=false", "-t", pattern],
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
