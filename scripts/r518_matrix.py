#!/usr/bin/env python3
"""
R518 mutation matrix (llm-benchmark) -- DELETE /api/configs/:id failure modes.

Discipline carried from R473 / R475 / R477 / R481 / R482 / R486 / R487 /
R488 / R497 / R507 / R511 / R513 / R514 / R517:

  * control FIRST: the suite must be green before any mutation;
  * declare OWNED files, assert each is at a PINNED BASELINE before injecting
    -- a dirty owned file means somebody else owns it;
  * snapshot BEFORE any injection, restore BY BYTES (never `git checkout` --
    R446-1: `git checkout` destroys other agents' uncommitted work);
  * assert the needle was UNIQUELY anchored BEFORE writing (R477) AND that
    the text actually CHANGED after writing (R456-10c: `str.replace` returns
    the string unchanged when the needle is absent, and a `count==1`
    assertion still passes);
  * a mutation that fails to inject is NOT-INJECTED, never SURVIVED;
  * a COMPILE-BROKEN arm is HARNESS, never SURVIVED;
  * jest prints its human-readable report to STDERR -- parse stdout + stderr;
  * parse the summary EXPLICITLY and assert it against the known suite size
    (R497-11c): under a glyph-counting parser the count is the number of
    TEST FILES, not tests.

Arms
----
  M1  THE REAL REPAIR of D1: the DELETE handler is wrapped in try/catch and
      answers a JSON 400 on a database error -- the shape the sibling route
      (src/web/routes/evaluations.ts:115-155) already uses.  MUST KILL arm
      (1).  If it SURVIVES, arm (1) cannot see the defect and the suite's
      headline claim is FALSE.

  M2  THE REAL REPAIR of D2/D3: the DELETE handler gains the same existence
      check PUT already has (`SELECT id FROM configs WHERE id=? AND
      user_id=?`, 404 when absent).  MUST KILL arms (2) and (3).

  N1  NEGATIVE CONTROL: a comment that changes nothing.  MUST SURVIVE.  Its
      purpose is to prove the driver is capable of reporting a survivor --
      a driver where every arm reads KILLED is not measuring anything.

WHY THIS DRIVER IS NOT `r507_matrix.py`
---------------------------------------
That driver scores the sweep-no-runtime-import guard; this one scores the
config-delete route.  It reuses the SAME resolver discipline (the runner is
resolved from the TREE this script stands in, via scripts/resolve_tool.py --
R514/R517), and the SAME restore discipline (snapshot into a path this
script owns, restore on EXIT via a trap, restore BEFORE the snapshot is
removed).

The owned file is `src/web/routes/configs.ts` -- a PRODUCTION file.  That is
the point of this round: R518 is the first llm-benchmark matrix whose owned
file is on the product path rather than in a test harness.  The restore is
therefore byte-verified against the pre-mutation snapshot AND against the
repository's HEAD blob, so a failed restore cannot go unnoticed.
"""
import hashlib
import os
import re
import subprocess
import sys
from pathlib import Path

# --------------------------------------------------------------------------
# Resolver: the RUNNER comes from the tree this script stands in.
#
# R514 (2026-10-28): `npx jest` DOWNLOADS jest 30.5.2 from the registry when
# the tree has no node_modules, while this repository pins jest ^29 (local
# resolution 29.7.0) -- so the driver would measure its subject with a
# DIFFERENT MAJOR of its runner.  R517 (2026-10-29): the resolver derives the
# root from its OWN path, so it must be called with NO root override.
# --------------------------------------------------------------------------


def _resolve_tool(name):
    """Resolve a tool from the TREE this script stands in.

    The import is LAZY, on purpose: a driver is sometimes COPIED into
    another checkout on its own.  A module-level import would make that copy
    fail to import at all -- the driver would break in exactly the situation
    it exists to be tested in.
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

SUITE = "tests/web/r518-config-delete-failure-modes.test.ts"
OWNED_REL = "src/web/routes/configs.ts"
OWNED = REPO / OWNED_REL

# The suite has 5 arms.  Every arm runs the WHOLE file (the suite is small
# and the arms share fixtures), so the expected total is pinned here and
# asserted by the parser below -- a broken parser would otherwise read as a
# green control (R497-11c).
EXPECTED_TOTAL = 5


def _head_blob_md5(rel: str) -> str:
    """The md5 of `rel` as the repository's HEAD records it."""
    out = subprocess.run(
        ["git", "show", "HEAD:" + rel],
        cwd=REPO, capture_output=True, check=True,
    ).stdout
    return hashlib.md5(out).hexdigest()


def md5_bytes(data: bytes) -> str:
    return hashlib.md5(data).hexdigest()


BASELINE_MD5 = _head_blob_md5(OWNED_REL)

# ------------------------------------------------------------------ needles
#
# The current DELETE handler (src/web/routes/configs.ts:58-63):
#
#   router.delete('/:id', (req: AuthRequest, res: Response) => {
#     const { id } = req.params;
#     const db = getDatabase();
#     db.prepare('DELETE FROM configs WHERE id=? AND user_id=?').run(id, req.userId);
#     res.json({ success: true });
#   });
#
# M1 -- THE REAL REPAIR of D1: wrap the statement in try/catch and answer a
# JSON 400, mirroring src/web/routes/evaluations.ts:115-155.  The point of
# the arm is that it is the FIX, not a cosmetic edit: if the suite cannot
# see this, the suite cannot see the defect.
#
# It is a TWO-PART edit: the handler AND the import of `errorMessage`.
# The import is part of the repair, not decoration -- the sibling route
# answers `res.status(400).json({error: errorMessage(err)})` and that helper
# lives in src/errors.ts.  Leaving the import out would make the arm a
# COMPILE-BROKEN mutant, which the harness scores HARNESS, not KILLED --
# and a HARNESS arm proves nothing about the suite.

IMPORT_OLD = """import { Router, Response } from 'express';
import { getDatabase } from '../db/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';"""

IMPORT_M1 = """import { Router, Response } from 'express';
import { getDatabase } from '../db/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { errorMessage } from '../../errors';"""

DELETE_OLD = """router.delete('/:id', (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const db = getDatabase();
  db.prepare('DELETE FROM configs WHERE id=? AND user_id=?').run(id, req.userId);
  res.json({ success: true });
});"""

DELETE_M1 = """router.delete('/:id', (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const db = getDatabase();
  try {
    db.prepare('DELETE FROM configs WHERE id=? AND user_id=?').run(id, req.userId);
  } catch (err: unknown) {
    res.status(400).json({ error: errorMessage(err) });
    return;
  }
  res.json({ success: true });
});"""

# M2 -- THE REAL REPAIR of D2/D3: give DELETE the same existence check PUT
# already has.  Two arms must go red (2) and (3).

DELETE_M2 = """router.delete('/:id', (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const db = getDatabase();
  const existing = db.prepare('SELECT id FROM configs WHERE id=? AND user_id=?').get(id, req.userId);
  if (!existing) {
    res.status(404).json({ error: 'Config not found' });
    return;
  }
  db.prepare('DELETE FROM configs WHERE id=? AND user_id=?').run(id, req.userId);
  res.json({ success: true });
});"""

# N1 -- NEGATIVE CONTROL: a comment that changes nothing.  It must compile
# and it must be behaviour-neutral.  The first draft of this arm replaced
# the block with a BYTE-IDENTICAL copy of itself, so the replacement was a
# no-op and the arm scored NOT-INJECTED.  A control that does not change the
# file is not a control: it exercises nothing.

DELETE_N1 = """router.delete('/:id', (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const db = getDatabase();
  // negative control: a comment that changes nothing
  db.prepare('DELETE FROM configs WHERE id=? AND user_id=?').run(id, req.userId);
  res.json({ success: true });
});"""

ARMS = [
    ("M1", [(IMPORT_OLD, IMPORT_M1), (DELETE_OLD, DELETE_M1)], "KILLED",
     "the REAL REPAIR of D1 (try/catch + JSON 400, mirroring evaluations.ts)"),
    ("M2", [(DELETE_OLD, DELETE_M2)], "KILLED",
     "the REAL REPAIR of D2/D3 (PUT's existence check, 404 when absent)"),
    ("N1", [(DELETE_OLD, DELETE_N1)], "SURVIVED",
     "NEGATIVE CONTROL: a comment added inside the handler"),
]


def md5(p: Path) -> str:
    return hashlib.md5(p.read_bytes()).hexdigest()


def clean_check():
    p = OWNED
    actual = md5(p)
    if actual != BASELINE_MD5:
        return False, "%s md5 %s != HEAD baseline %s" % (
            p.name, actual[:8], BASELINE_MD5[:8])
    return True, ""


def inject(p: Path, edits):
    """Apply a list of (old, new) edits atomically.

    EVERY edit is anchored and validated BEFORE any file is written, so a
    multi-part arm cannot half-apply: if edit 2's needle is missing, edit 1
    is never written either.  (A half-applied arm would be scored against a
    file the driver no longer knows how to restore.)
    """
    before = p.read_text(encoding="utf-8")
    after = before
    for old, new in edits:
        n = after.count(old)
        if n != 1:
            return "not-injected", "needle count %d != 1 for %r..." % (n, old.splitlines()[0][:60])
        replaced = after.replace(old, new, 1)
        if replaced == after:
            return "not-injected", "replacement was a no-op"
        after = replaced
    if after == before:
        return "not-injected", "replacement was a no-op"
    tmp = p.with_suffix(p.suffix + ".r518tmp")
    tmp.write_text(after, encoding="utf-8")
    os.replace(tmp, p)
    # The check that catches the no-op that a count==1 assertion misses
    # (R456-10c): read the file BACK and compare BYTES.
    written = p.read_bytes()
    if md5_bytes(written) == BASELINE_MD5:
        return "not-injected", "write did not change the file on disk"
    return "injected", "%d edit(s), md5 %s" % (len(edits), md5(p)[:8])


def run_suite():
    """Run the suite and return (passed, failed, total, detail)."""
    r = subprocess.run(
        [_resolve_tool("jest"), SUITE, "--runInBand", "--coverage=false"],
        cwd=REPO, capture_output=True, text=True, timeout=1800,
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


def main():
    # ---- Phase 0: the control.  A mutation matrix run against a RED
    # baseline measures the baseline, not the mutations.
    ok, why = clean_check()
    if not ok:
        print("ABORT: owned files are not at the pinned baseline:\n  %s" % why)
        return 2

    print("baseline md5 %s (%s)" % (BASELINE_MD5[:8], OWNED_REL))
    passed, failed, total, detail = run_suite()
    print("BASELINE: %s" % detail)
    if failed != 0 or total != EXPECTED_TOTAL:
        print("ABORT: baseline is not green (%d failed / %d total, expected 0/%d)"
              % (failed, total, EXPECTED_TOTAL))
        return 2

    # ---- Phase 1: the arms.
    # The owned file is a PRODUCTION file, so the snapshot discipline is
    # load-bearing: restore FIRST, remove the snapshot SECOND, and verify
    # the restore BY BYTES against the HEAD blob.
    snapshot = REPO / "scripts" / ".r518_snapshot.ts"
    original = OWNED.read_bytes()
    snapshot.write_bytes(original)

    def restore():
        OWNED.write_bytes(original)
        if os.path.exists(snapshot):
            os.remove(snapshot)

    results = []
    try:
        for label, edits, expected, note in ARMS:
            status, detail_i = inject(OWNED, edits)
            if status != "injected":
                print("ARM %s: NOT-INJECTED (%s)" % (label, detail_i))
                results.append((label, "NOT-INJECTED", expected, note))
                restore()
                continue

            p, f, t, d = run_suite()
            if t == -1:
                verdict = "HARNESS"
            elif f > 0:
                verdict = "KILLED"
            else:
                verdict = "SURVIVED"
            print("ARM %s: %s  (%d failed / %d passed / %d total)  %s"
                  % (label, verdict, f, p, t, d))
            results.append((label, verdict, expected, note))

            # Restore BEFORE the next arm reads the file (R507's restore
            # CADENCE lesson), and verify by bytes.
            restore()
            now = OWNED.read_bytes()
            if md5_bytes(now) != BASELINE_MD5:
                print("ARM %s: RESTORE FAILED -- md5 %s != baseline %s"
                      % (label, md5_bytes(now)[:8], BASELINE_MD5[:8]))
                results.append((label, "RESTORE-FAILED", expected, note))
                break
    finally:
        restore()

    final = OWNED.read_bytes()
    if md5_bytes(final) != BASELINE_MD5:
        print("FINAL: RESTORE FAILED -- md5 %s != baseline %s"
              % (md5_bytes(final)[:8], BASELINE_MD5[:8]))
        return 2
    print("final md5 %s (restored, verified)" % md5_bytes(final)[:8])

    killed = sum(1 for _, v, _, _ in results if v == "KILLED")
    survived = sum(1 for _, v, _, _ in results if v == "SURVIVED")
    harness = sum(1 for _, v, _, _ in results if v == "HARNESS")
    notinj = sum(1 for _, v, _, _ in results if v == "NOT-INJECTED")
    mismatched = [r for r in results if r[1] != r[2]]

    print()
    print("KILLED=%d SURVIVED=%d HARNESS=%d NOT-INJECTED=%d" % (killed, survived, harness, notinj))
    for label, verdict, expected, note in results:
        flag = "" if verdict == expected else "   <-- MISMATCH (expected %s)" % expected
        print("  %s: %s%s" % (label, verdict, flag))
        print("      %s" % note)
    if mismatched:
        print()
        print("VERDICT: MISMATCH -- an arm scored differently than its expectation.")
        return 1
    print()
    print("VERDICT: PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
