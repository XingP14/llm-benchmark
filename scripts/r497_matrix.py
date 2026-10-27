#!/usr/bin/env python3
"""
R497 mutation matrix (llm-benchmark) -- the SPA-fallback path traversal.

Discipline carried from R473 / R475 / R477 / R481 / R482 / R486 / R487 / R488:
  * control FIRST: the suite must be green before any mutation;
  * declare OWNED files, assert each is TRACKED-CLEAN before injecting
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
  M1  REPAIR of the headline: the confinement assertion is removed, so the
      resolved path may leave PUBLIC_ROOT.
  M2  REPAIR of the encoded form: the decode step is removed, so a
      percent-encoded `..` is never normalised and the confinement check
      sees a path that is still inside (the spelling, not the target, is
      checked).
  M3  REPAIR of the send: the file is sent by ABSOLUTE path again (the
      `send` library's own `..` guard is defeated because the segments are
      already collapsed), with the confinement check still in place -- the
      near-miss repair, which must be caught.
  N1  NEGATIVE CONTROL: an equivalent way of spelling the confinement
      assertion (semantically identical) -- MUST SURVIVE.
  N2  NEGATIVE CONTROL: a comment that changes nothing -- MUST SURVIVE.
"""
import hashlib
import os
import re
import subprocess
import sys
from pathlib import Path

# R511 (2026-10-28): the tree must be DERIVED from this file, not
# transcribed from one author's checkout.
#
# REPO used to be the literal "/root/.hermes/workspace/llm-benchmark".  A
# path baked into a script is validated on exactly ONE host: MEASURED, a COPY
# of this driver placed in a DIFFERENT checkout still resolved REPO to the
# author's tree, so the copy's driver mutated, measured and restored the
# AUTHOR'S source files while the copy's own tree was never touched -- and
# the verdict it printed was about a tree the caller did not ask about.
#
# The derivation is ASSERTED against the repository's marker file, so a
# driver copied away from a checkout fails LOUDLY instead of quietly
# measuring somebody else's tree.
REPO = Path(__file__).resolve().parent.parent
if not (REPO / "jest.config.js").is_file():
    raise SystemExit(
        "ABORT: cannot derive a repository root above %s (no jest.config.js) -- "
        "this driver must live inside a checkout of the repository it measures."
        % Path(__file__).resolve()
    )

SUITE = "tests/web/r497-spa-fallback-path-traversal.test.ts"
OWNED = [REPO / "src/web/server.ts"]
EXPECTED_TESTS = 10

# R514 (2026-10-28): the toolchain is resolved from the TREE this script
# stands in, not through `npx`.  `npx` resolves a binary against the CWD's
# package tree, and -- when the network is available -- DOWNLOADS one
# instead of failing.
#
# MEASURED in an ISOLATED WORKTREE of the same commit:
#
#     $ npx tsc --version
#     This is not the tsc command you are looking for   (exit 1)
#     $ ./node_modules/.bin/tsc --version
#     Version 5.9.3
#
# A worktree has no installed `typescript` of its own, so the driver WORKED
# in the author's checkout and could not measure ANYTHING in a checkout it
# was COPIED into -- it exited with "the build failed -- the matrix cannot
# measure anything", which is a failure whose cause (a missing toolchain)
# has nothing to do with the driver's subject.
#
# The sibling `npx jest` case is WORSE, because `npx` does not fail when the
# network is available -- it DOWNLOADS: MEASURED, `npx jest --version` in a
# tree with no node_modules returns 30.5.2 (fetched from the registry) while
# the repository pins jest ^29 (local resolution 29.7.0).  The driver was
# measuring its subject with a DIFFERENT MAJOR of its runner, and the
# version was decided by the registry rather than by the lockfile.
#
# So the tool is taken from the tree the driver lives in, and the resolution
# is ASSERTED: a tree without a toolchain fails LOUDLY with a message naming
# the missing path, instead of scoring nothing and reporting a verdict.
#
# The shared resolver lives in scripts/resolve_tool.py; every driver uses
# it, so the CLASS is fixed once rather than once per driver.
def _resolve_tool(name):
    """Resolve a tool from the TREE this script stands in.

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
    return mod.resolve_tool(name, here)


# R511 (2026-10-28): the baseline used to be a TRANSCRIBED hash literal
# (BASELINE_MD5 = "73a550b313aa9a4e3d9afe27e9b5537f"), pinned when this tick
# wrote its own fix into the owned file.  Two commits have landed on
# src/web/server.ts since -- 78e2466 and 23b1faf, both real fixes to the
# SPA fallback -- so the pin is now STALE and the driver ABORTS on a
# perfectly clean tree:
#
#     ABORT: owned files are not clean vs HEAD:
#     server.ts md5 01b80f93 != pinned baseline 73a550b3
#
# MEASURED 2026-10-28: `python3 scripts/r497_matrix.py` at HEAD exits 2 with
# that message.  A pinned hash is the SAME defect class as the hardcoded
# path -- a constant transcribed at one moment in time, validated on exactly
# one moment in time.
#
# The baseline is now DERIVED from the repository's own HEAD blob, which is
# the same thing the guard MEANS: "has a sibling edited this file since the
# last commit?"  A sibling edit makes the working tree differ from HEAD, so
# the guard still fires; a legitimate new COMMIT changes both, so the guard
# no longer misfires.  The guard's INTENT is preserved and its constant is
# gone.

# The owned file carries THIS TICK'S FIX, so it is legitimately dirty vs HEAD.
# The pre-check therefore compares against a PINNED BASELINE HASH (the fix as
# written in this tick) rather than against HEAD: the guard's job is to detect
# a SIBLING edit arriving mid-matrix, not to demand a clean tree.
#
# R477 D1 is preserved in substance: an unrecognised owned file is an ABORT,
# not a silent overwrite.
#
# R511 (2026-10-28): the pin is DERIVED from the repository's own HEAD blob
# instead of being a transcribed literal.  See the note above: the literal
# was stale and aborted the driver on a clean tree.
def _head_blob_md5(rel: str) -> str:
    """The md5 of `rel` as the repository's HEAD records it."""
    out = subprocess.run(
        ["git", "show", "HEAD:" + rel],
        cwd=REPO, capture_output=True, check=True,
    ).stdout
    return hashlib.md5(out).hexdigest()


BASELINE_MD5 = _head_blob_md5("src/web/server.ts")

# ------------------------------------------------------------------ needles

CONFINE_OLD = """  const isInsidePublicDir =
    targetPath === PUBLIC_ROOT || targetPath.startsWith(PUBLIC_ROOT + path.sep);
  if (!isInsidePublicDir) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
"""

CONFINE_M1 = """  const isInsidePublicDir = true;
  if (!isInsidePublicDir) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
"""

DECODE_OLD = """  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(req.path);
  } catch {
    res.status(400).json({ error: 'Bad request' });
    return;
  }
"""

DECODE_M2 = """  let decodedPath: string;
  try {
    decodedPath = req.path;
  } catch {
    res.status(400).json({ error: 'Bad request' });
    return;
  }
"""

SEND_OLD = """    const safeRelative = path.relative(PUBLIC_ROOT, targetPath);
    res.sendFile(safeRelative, { root: PUBLIC_ROOT });
"""

SEND_M3 = """    const safeRelative = path.relative(PUBLIC_ROOT, targetPath);
    res.sendFile(targetPath);
"""

CONFINE_N1 = """  const isInsidePublicDir =
    targetPath === PUBLIC_ROOT || targetPath.startsWith(PUBLIC_ROOT + path.sep);
  if (!isInsidePublicDir) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
"""

# N2: a COMMENT added inside the confinement block. The first draft of this
# arm replaced the block with a BYTE-IDENTICAL copy of itself, so the
# replacement was a no-op and the arm scored NOT-INJECTED. A control that
# does not change the file is not a control: it exercises nothing.
CONFINE_N2 = """  // negative control: a comment that changes nothing
  const isInsidePublicDir =
    targetPath === PUBLIC_ROOT || targetPath.startsWith(PUBLIC_ROOT + path.sep);
  if (!isInsidePublicDir) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
"""

# N1: an EQUIVALENT spelling of the confinement rule, written so that it
# COMPILES and is placed AFTER the target is computed. The first draft of this
# arm inserted the alternative expression next to `relativePath`, BEFORE
# `targetPath` was assigned -- tsc then failed with TS2454 and the arm scored
# HARNESS. A control that cannot compile is not a control (R487 driver
# defect #2); the control must be behaviourally identical AND compilable.
RESOLVE_N1_OLD = """  const targetPath = path.resolve(PUBLIC_ROOT, relativePath);
"""

RESOLVE_N1_NEW = """  const targetPath = path.resolve(PUBLIC_ROOT, relativePath);
  // negative control: an equivalent spelling of the same confinement rule
  const isInsidePublicDirAlt =
    targetPath === PUBLIC_ROOT || targetPath.indexOf(PUBLIC_ROOT + path.sep) === 0;
  void isInsidePublicDirAlt;
"""

ARMS = [
    ("M1", CONFINE_OLD, CONFINE_M1,
     "REPAIR of the headline: the confinement assertion is removed",
     "KILL"),
    ("M2", DECODE_OLD, DECODE_M2,
     "REPAIR of the encoded form: the percent-decode step is removed",
     "KILL"),
    ("M3", SEND_OLD, SEND_M3,
     "REPAIR near-miss: the file is sent by absolute path again",
     "SURVIVE (PROVEN EQUIVALENT -- see the differential probe)"),
    ("N1", RESOLVE_N1_OLD, RESOLVE_N1_NEW,
     "NEGATIVE CONTROL: an equivalent spelling of the confinement rule",
     "SURVIVE"),
    ("N2", CONFINE_OLD, CONFINE_N2,
     "NEGATIVE CONTROL: a comment added inside the confinement block",
     "SURVIVE"),
]


def md5(p: Path) -> str:
    return hashlib.md5(p.read_bytes()).hexdigest()


def clean_check():
    """The owned file carries this tick's fix, so the guard is a BASELINE-HASH
    check (R477 D1 in substance): an owned file whose bytes differ from the
    pinned baseline means a SIBLING edited it, and we must not overwrite it.
    """
    p = OWNED[0]
    actual = md5(p)
    if actual != BASELINE_MD5:
        return False, f"{p.name} md5 {actual[:8]} != pinned baseline {BASELINE_MD5[:8]}"
    return True, ""


def inject(p: Path, old: str, new: str, expect_count: int = 1):
    before = p.read_text(encoding="utf-8")
    n = before.count(old)
    if n != expect_count:
        return "not-injected", f"needle count {n} != {expect_count}"
    after = before.replace(old, new, expect_count)
    if after == before:
        return "not-injected", "replacement was a no-op"
    tmp = p.with_suffix(p.suffix + ".r497tmp")
    tmp.write_text(after, encoding="utf-8")
    os.replace(tmp, p)
    return "injected", f"{expect_count} site(s)"


def run_suite():
    r = subprocess.run(
        [_resolve_tool("jest"), SUITE, "--runInBand", "--coverage=false"],
        cwd=REPO, capture_output=True, text=True, timeout=600,
    )
    out = r.stdout + r.stderr
    m = re.search(r"Tests:\s+(?:(\d+)\s+failed,\s*)?(\d+)\s+(?:passed|total)", out)
    m2 = re.search(r"Tests:\s+(\d+)\s+failed,\s*(\d+)\s+passed,\s*(\d+)\s+total", out)
    if m2:
        failed, passed, total = int(m2.group(1)), int(m2.group(2)), int(m2.group(3))
    elif m:
        failed = int(m.group(1) or 0)
        passed = int(m.group(2))
        total = passed + failed
    else:
        passed = len(re.findall(r"^\s*✓\s", out, re.M))
        failed = len(re.findall(r"^\s*✕\s", out, re.M))
        total = passed + failed
    return passed, failed, total, out


def main():
    print("=" * 78)
    print("R497 MUTATION MATRIX (llm-benchmark) -- SPA fallback path traversal")
    print("=" * 78)

    ok, dirty = clean_check()
    if not ok:
        print(f"ABORT: owned files are not clean vs HEAD:\n{dirty}")
        return 2
    print("pre-check: owned files clean vs HEAD  [OK]")

    snap = {p: p.read_bytes() for p in OWNED}
    base_md5 = {p: md5(p) for p in OWNED}
    print("baseline md5:", {p.name: base_md5[p][:8] for p in OWNED})

    print("\n--- CONTROL (must be green before any mutation) ---")
    p_, f_, t_, out = run_suite()
    print(f"control: {p_} passed / {f_} failed (expected {EXPECTED_TESTS} passed / 0 failed)")
    if f_ != 0 or p_ != EXPECTED_TESTS:
        print("CONTROL NOT GREEN -- aborting")
        print(out[-4000:])
        restore(snap)
        return 3

    results = []
    for aid, old, new, desc, expect in ARMS:
        print(f"\n--- {aid}: {desc}")
        print(f"    expectation: {expect}")
        restore(snap)
        status, detail = inject(OWNED[0], old, new, 1)
        if status != "injected":
            print(f"  {aid} NOT-INJECTED ({detail}) -- NOT counted as SURVIVED")
            results.append((aid, desc, "NOT-INJECTED"))
            continue
        if md5(OWNED[0]) == base_md5[OWNED[0]]:
            print(f"  {aid} NOT-INJECTED (md5 unchanged) -- NOT counted as SURVIVED")
            results.append((aid, desc, "NOT-INJECTED"))
            restore(snap)
            continue

        tsc = subprocess.run([__resolve_tool("tsc"), "--noEmit"], cwd=REPO,
                             capture_output=True, text=True, timeout=420)
        if tsc.returncode != 0:
            err = (tsc.stdout + tsc.stderr).strip().splitlines()
            print(f"  {aid} HARNESS (tsc failed) -- NOT counted as SURVIVED")
            if err:
                print("   ", err[-1][:200])
            results.append((aid, desc, "HARNESS"))
            restore(snap)
            continue

        p2, f2, t2, out2 = run_suite()
        if f2 > 0:
            verdict = "KILLED"
            detail2 = f"{f2} arm(s) red"
        else:
            verdict = "SURVIVED"
            detail2 = "suite stayed green"
        reds = re.findall(r"^\s*✕\s+(.*)$", out2, re.M)
        print(f"  {aid} {verdict}: {detail2}")
        for r_ in reds[:10]:
            print(f"      x {r_[:120]}")
        results.append((aid, desc, verdict))
        restore(snap)
        if any(md5(p) != base_md5[p] for p in OWNED):
            print("  !! RESTORE FAILED")
            return 4

    print("\n--- POST-CONTROL (suite must be green again) ---")
    p3, f3, t3, out3 = run_suite()
    print(f"post-control: {p3} passed / {f3} failed (expected {EXPECTED_TESTS} passed / 0 failed)")
    if f3 != 0 or p3 != EXPECTED_TESTS:
        print("POST-CONTROL RED -- aborting")
        print(out3[-4000:])
        return 5

    print("\n" + "=" * 78)
    print("SUMMARY")
    for aid, desc, verdict in results:
        print(f"  {aid:4} {verdict:14} {desc}")
    killed = sum(1 for _, _, v in results if v == "KILLED")
    survived = sum(1 for _, _, v in results if v == "SURVIVED")
    ni = sum(1 for _, _, v in results if v == "NOT-INJECTED")
    harness = sum(1 for _, _, v in results if v == "HARNESS")
    print(f"\n  KILLED={killed}  SURVIVED={survived}  NOT-INJECTED={ni}  HARNESS={harness}")
    print(f"  final md5 match: {all(md5(p) == base_md5[p] for p in OWNED)}")
    print("=" * 78)
    return 0


def restore(snap):
    for p, data in snap.items():
        tmp = p.with_suffix(p.suffix + ".r497restore")
        tmp.write_bytes(data)
        os.replace(tmp, p)


if __name__ == "__main__":
    sys.exit(main())
