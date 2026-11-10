#!/usr/bin/env python3
"""R539 mutation matrix -- the FAILURE-CHANNEL plane.

Discipline (R456/R475/R482/R514):
  - CONTROL FIRST: the unmodified tree must be GREEN, or every verdict below
    is meaningless.
  - Inject into OWNED files only; assert the tree is clean for each OWNED file
    before injecting (R475-2: `git checkout` restore would silently destroy
    a concurrent agent's in-flight edit).
  - Every injection asserts `needle in before` AND `after != before`
    (R456-10: `str.replace` returns the original when the needle is absent,
    and a `count == 1` assertion alone happily passes in that case).
  - A mutant may span SEVERAL files; each file gets its OWN byte-level
    snapshot and its OWN restore proof against the pre-injection bytes
    (a single-file driver would silently leave one half mutated).
  - Restore is a byte-level snapshot of the OWNED file, not `git checkout`,
    and the MTIME is restored too (a byte-restore bumps the mtime, and
    `tests/evaluator-log-helpers.test.ts` compares `dist/core/evaluator.js`
    against `src/core/evaluator.ts` -- see the
    `mutation-driver-restore-mtime-and-cancelled-runs` skill).
  - The RUNNER is resolved from THIS tree's node_modules/.bin, NEVER through
    `npx` (R514: `npx` DOWNLOADS a different major of jest when the tree has
    no local install -- 30.5.2 against the pinned 29 -- so the driver would
    measure its subject with a runner the repository does not pin).
  - The verdict parser ASSERTS the summary total against the arm count
    declared in the suite file (R482: a broken parser reads as a green
    control).  A mismatch is HARNESS, not a verdict.  A mutant that does not
    COMPILE is also HARNESS, never a kill -- "the suite failed to run" is a
    statement about the mutant, not about the subject.
  - A FAIL is triaged BY HAND before the subject is touched (R158/R204).

Each mutant is a REPAIR of the failure-channel plane, on a DIFFERENT carrier:
  M1   the scorer's catch   -> a distinguishable score (score: -1)
  M2   the evaluator's catch -> a distinguishable score (score: -1)
  M3   the reporter -> render the failure detail in the Markdown
  M4   the reporter -> exclude failed samples from the JSON question count
  M5   the reporter -> mark the run INCOMPLETE in the Markdown
  M5b  the reporter + the type -> PARTIAL repair: publish an errorCount,
       keep the old question count
  M6   the reporter -> count only evaluated questions in the Markdown
  N1   NEGATIVE control: an inert comment that changes nothing observable
"""
import hashlib
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


def _resolve_tool(name):
    """Resolve a tool from the TREE this script stands in (never `npx`)."""
    import importlib.util

    here = str(Path(__file__).resolve().parent)
    resolver = os.path.join(here, "resolve_tool.py")
    if not os.path.exists(resolver):
        raise SystemExit(
            "%s does not exist -- this driver resolves its toolchain from\n"
            "the tree it stands in, and the resolver must sit beside it.\n"
            "Copy scripts/resolve_tool.py next to this driver." % resolver
        )
    spec = importlib.util.spec_from_file_location("_resolve_tool_mod", resolver)
    if spec is None or spec.loader is None:
        raise SystemExit("cannot load the resolver at %s" % resolver)
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

SUITE_REL = "tests/r539-failure-channel-plane.test.ts"
SUITE = SUITE_REL

# OWNED files this matrix is allowed to touch.
OWNED = {
    "src/core/scorer.ts": os.path.join(REPO, "src/core/scorer.ts"),
    "src/core/evaluator.ts": os.path.join(REPO, "src/core/evaluator.ts"),
    "src/core/reporter.ts": os.path.join(REPO, "src/core/reporter.ts"),
    "src/types/index.ts": os.path.join(REPO, "src/types/index.ts"),
}


def _derive_expected_total() -> int:
    """Read the arm count out of the SUITE FILE in THIS tree."""
    src = (REPO / SUITE_REL).read_text(encoding="utf-8")
    arms = re.findall(r"^\s*it\(", src, re.M)
    if not arms:
        raise SystemExit(
            "ABORT: no `it(` arms found in %s -- the driver cannot derive the "
            "expected total." % SUITE_REL
        )
    return len(arms)


EXPECTED_TOTAL = _derive_expected_total()


def md5(path):
    with open(path, "rb") as f:
        return hashlib.md5(f.read()).hexdigest()


def mtime_ns(path):
    return os.stat(path).st_mtime_ns


def run_suite():
    """Run the suite; return (verdict, detail, failed_arms).

    verdict is one of GREEN / RED / HARNESS.  HARNESS means the RUN did not
    produce a usable verdict (timeout, no summary line, a summary total that
    disagrees with the arm count declared in the suite file, or a suite that
    failed to COMPILE) -- it is never silently reported as a kill or as a
    survival.
    """
    jest = _resolve_tool("jest")
    cmd = [jest, SUITE, "--runInBand", "--coverage=false"]
    try:
        proc = subprocess.run(
            cmd, cwd=str(REPO), capture_output=True, text=True, timeout=1200,
        )
    except subprocess.TimeoutExpired:
        return "HARNESS", "timeout", []
    blob = (proc.stdout or "") + "\n" + (proc.stderr or "")

    if "Test suite failed to run" in blob:
        return ("HARNESS",
                "the suite did not COMPILE -- a mutant that does not compile is "
                "a harness break, not a kill:\n" + blob[:600], [])

    m = re.search(r"Tests:\s+(?:(\d+)\s+failed,\s*)?(?:(\d+)\s+skipped,\s*)?"
                  r"(?:(\d+)\s+passed,\s*)?(?:(\d+)\s+total)?", blob)
    if not m or not m.group(4):
        return "HARNESS", "no summary line; blob tail:\n" + blob[-800:], []
    total = int(m.group(4))
    failed_n = int(m.group(1)) if m.group(1) else 0
    if total != EXPECTED_TOTAL:
        return ("HARNESS",
                "summary total=%d but the suite file declares %d arms -- "
                "parser/total mismatch, NOT a verdict" % (total, EXPECTED_TOTAL),
                [])
    failed_arms = [ln.strip() for ln in blob.splitlines() if ln.strip().startswith("✕")]
    if failed_n > 0:
        return "RED", "failed=%d of %d" % (failed_n, EXPECTED_TOTAL), failed_arms
    return "GREEN", "all %d passed" % EXPECTED_TOTAL, failed_arms


# ---------------------------------------------------------------- mutations
# Each mutation is a list of (rel, needle, replacement) edits.

M1 = [(
    "src/core/scorer.ts",
    """        questionId: question.id,
        category: question.category,
        score: 0,
        dimension: 'dialogue',""",
    """        questionId: question.id,
        category: question.category,
        score: -1,
        dimension: 'dialogue',""",
)]

M2 = [(
    "src/core/evaluator.ts",
    """          questionId: question.id,
          category: question.category,
          score: 0,
          dimension: question.type,""",
    """          questionId: question.id,
          category: question.category,
          score: -1,
          dimension: question.type,""",
)]

M3 = [(
    "src/core/reporter.ts",
    """      md += `- **评测耗时**: ${(result.duration / 1000).toFixed(1)}s\\n\\n`;""",
    """      md += `- **评测耗时**: ${(result.duration / 1000).toFixed(1)}s\\n\\n`;
      for (const s of result.scores) {
        if (s.detail && s.detail.includes('错误')) md += `- **错误**: ${s.detail}\\n`;
      }""",
)]

M4 = [(
    "src/core/reporter.ts",
    """      totalQuestions: results.length > 0 ? results[0].scores.length : 0,""",
    """      totalQuestions: results.length > 0 ? results[0].scores.filter((s) => !s.detail?.includes('错误')).length : 0,""",
)]

M5 = [(
    "src/core/reporter.ts",
    """      md += `- **评测耗时**: ${(result.duration / 1000).toFixed(1)}s\\n\\n`;""",
    """      md += `- **评测耗时**: ${(result.duration / 1000).toFixed(1)}s\\n\\n`;
      md += `- **不完整**: ${result.scores.some((s) => s.detail?.includes('错误')) ? 'yes' : 'no'}\\n`;""",
)]

# The PARTIAL repair: a new `errorCount` field, the old question count left
# alone.  It spans TWO files -- the reporter and the `ComparisonReport.stats`
# type -- because an excess property on a typed object literal is a COMPILE
# error, and a mutant that does not compile measures nothing.
M5b = [
    (
        "src/core/reporter.ts",
        """      totalQuestions: results.length > 0 ? results[0].scores.length : 0,""",
        """      totalQuestions: results.length > 0 ? results[0].scores.length : 0,
      errorCount: results.length > 0 ? results[0].scores.filter((s) => s.detail?.includes('错误')).length : 0,""",
    ),
    (
        "src/types/index.ts",
        """    totalModels: number;
    totalQuestions: number;""",
        """    totalModels: number;
    totalQuestions: number;
    errorCount: number;""",
    ),
]

M6 = [(
    "src/core/reporter.ts",
    """    md += `**总评测题数**: ${results[0]?.scores.length || 0}\\n\\n`;""",
    """    md += `**总评测题数**: ${results[0]?.scores.filter((s) => !s.detail?.includes('错误')).length || 0}\\n\\n`;""",
)]

# NEGATIVE control: an inert comment.  A RENAME is NOT an inert control here:
# `logError` is called from six sites, so renaming its declaration alone does
# not compile -- and a mutant that does not compile is HARNESS, not SURVIVED.
N1 = [(
    "src/core/reporter.ts",
    """// src/core/reporter.ts - 报告生成器""",
    """// src/core/reporter.ts - 报告生成器 (r539 negative control: inert)""",
)]

MUTANTS = [
    ("M1", "scorer catch -> score -1", M1),
    ("M2", "evaluator catch -> score -1", M2),
    ("M3", "reporter: render the failure detail in Markdown", M3),
    ("M4", "reporter: exclude failed samples from totalQuestions", M4),
    ("M5", "reporter: mark the run INCOMPLETE in the Markdown", M5),
    ("M5b", "reporter+type PARTIAL repair: publish an errorCount, keep the old count", M5b),
    ("M6", "reporter: count only evaluated questions in Markdown", M6),
    ("N1", "NEGATIVE control: an inert comment (no observable change)", N1),
]


def _restore(snapshots):
    for rel, (b, m) in snapshots.items():
        with open(OWNED[rel], "wb") as f:
            f.write(b)
        os.utime(OWNED[rel], ns=(m, m))


def apply_edits(edits):
    """Apply the edits.  Return (ok, detail, snapshots).

    Every edit asserts the needle occurs EXACTLY once and that the replacement
    actually changed the bytes (R456-10).  `snapshots` maps rel -> (bytes,
    mtime_ns) for the files that were touched, so the caller can restore
    exactly what it found.
    """
    snapshots = {}
    for rel, needle, repl in edits:
        path = OWNED[rel]
        before = open(path, "rb").read()
        text = before.decode("utf-8")
        if text.count(needle) != 1:
            _restore(snapshots)
            return False, "needle for %s occurs %d times (need exactly 1)" % (
                rel, text.count(needle)), snapshots
        after = text.replace(needle, repl, 1)
        if after == text:
            _restore(snapshots)
            return False, "replacement for %s produced NO change" % rel, snapshots
        snapshots[rel] = (before, mtime_ns(path))
        with open(path, "w", encoding="utf-8") as f:
            f.write(after)
    return True, "applied %d edit(s)" % len(edits), snapshots


def main():
    print("=== CONTROL (must be GREEN before any verdict below means anything) ===")
    print("suite     : %s (%d arms declared in the file)" % (SUITE_REL, EXPECTED_TOTAL))
    verdict, detail, _ = run_suite()
    print("control: %s  %s" % (verdict, detail))
    if verdict != "GREEN":
        print("CONTROL NOT GREEN -- aborting matrix")
        return 1

    baseline = {rel: md5(p) for rel, p in OWNED.items()}
    # The mtime is part of the tree's state too: `tests/evaluator-log-helpers
    # .test.ts` asserts that `dist/core/evaluator.js` is not OLDER than
    # `src/core/evaluator.ts`.  A byte-restore bumps the mtime and turns that
    # guard RED on a tree whose content never changed.  st_mtime_ns, NOT
    # st_mtime: the float form loses the last digits and is not time-equal.
    baseline_mtime = {rel: mtime_ns(p) for rel, p in OWNED.items()}
    tmp = tempfile.mkdtemp(prefix="r539_matrix_")
    verdicts = []

    for name, desc, edits in MUTANTS:
        ok, why, snapshots = apply_edits(edits)
        if not ok:
            print("%s: NOT-INJECTED (%s) -- skipped" % (name, why))
            verdicts.append((name, desc, "NOT-INJECTED"))
            continue

        try:
            v, d, failed_arms = run_suite()
            if v == "HARNESS":
                verdict = "HARNESS"
            elif v == "RED":
                verdict = "KILLED"
            else:
                verdict = "SURVIVED"
            print("%s: %-9s  [%s]  %s  killed_arms=%s"
                  % (name, verdict, desc, d, [a[:60] for a in failed_arms]))
            verdicts.append((name, desc, verdict))
        finally:
            # Byte-level restore of every OWNED file the mutant touched...
            for rel, (b, m) in snapshots.items():
                with open(OWNED[rel], "wb") as f:
                    f.write(b)
                # ...and the mtime, or a suite that compares mtimes across the
                # tree goes RED on a tree whose content never changed.
                os.utime(OWNED[rel], ns=(m, m))
                assert md5(OWNED[rel]) == baseline[rel], "%s: RESTORE FAILED for %s" % (name, rel)
                assert mtime_ns(OWNED[rel]) == baseline_mtime[rel], \
                    "%s: MTIME RESTORE FAILED for %s" % (name, rel)

    print()
    print("=== VERDICT TABLE ===")
    for name, desc, verdict in verdicts:
        print("  %-3s %-14s %s" % (name, verdict, desc))
    killed = sum(1 for _, _, v in verdicts if v == "KILLED")
    survived = sum(1 for _, _, v in verdicts if v == "SURVIVED")
    notinj = sum(1 for _, _, v in verdicts if v == "NOT-INJECTED")
    harness = sum(1 for _, _, v in verdicts if v == "HARNESS")
    print("\nKILLED=%d SURVIVED=%d NOT-INJECTED=%d HARNESS=%d"
          % (killed, survived, notinj, harness))
    print("restore verified (bytes): " + ("yes" if all(md5(p) == h for p, h in baseline.items()) else "NO"))
    print("restore verified (mtime): " + ("yes" if all(mtime_ns(p) == h for p, h in baseline_mtime.items()) else "NO"))
    shutil.rmtree(tmp, ignore_errors=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
