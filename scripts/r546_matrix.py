#!/usr/bin/env python3
"""R546 mutation matrix -- the CONFIDENCE-INTERVAL plane.

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
    snapshot and its OWN restore proof against the pre-injection bytes.
  - Restore is a byte-level snapshot of the OWNED file, not `git checkout`,
    and the MTIME is restored too (a byte-restore bumps the mtime, and
    `tests/evaluator-log-helpers.test.ts` compares `dist/core/evaluator.js`
    against `src/core/evaluator.ts`).
  - The RUNNER is resolved from THIS tree's node_modules/.bin, NEVER through
    `npx` (R514).
  - The verdict parser ASSERTS the summary total against the arm count
    declared in the suite file (R482).  A mismatch is HARNESS, not a verdict.
    A mutant that does not COMPILE is also HARNESS, never a kill.
  - A FAIL is triaged BY HAND before the subject is touched (R158/R204).

Each mutant is a REPAIR of the confidence-interval plane, on a DIFFERENT
carrier:
  M1   the bootstrap -> a SEEDED rng (the interval becomes reproducible)
  M2   the bootstrap -> the rng is injected by the CALLER with a fixed seed
  M3   the evaluator -> publish the ROUNDED average as the CI centre, so the
       point estimate and the interval agree
  M4   the evaluator -> do not publish a CI when n < 4 (the "95%" label on a
       3-question dimension is a guarantee the interval cannot make)
  M5   the reporter -> publish the number of questions behind the interval
       (so a reader can see how wide the sample is)
  M5b  the reporter -> the PARTIAL repair: publish n, keep the old text
  M6   the reporter -> publish the interval as the OBSERVED RANGE (not a
       bootstrap), which is reproducible by construction
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

SUITE_REL = "tests/r546-confidence-interval-plane.test.ts"
SUITE = SUITE_REL

# OWNED files this matrix is allowed to touch.
OWNED = {
    "src/core/evaluator.ts": os.path.join(REPO, "src/core/evaluator.ts"),
    "src/core/reporter.ts": os.path.join(REPO, "src/core/reporter.ts"),
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

# M1: the bootstrap draws from a SEEDED rng, so the interval is reproducible.
M1 = [(
    "src/core/evaluator.ts",
    """export function bootstrap95CI(
  scores: number[],
  nResamples = 1000,
  rng: () => number = Math.random,
): Bootstrap95CI {""",
    """export function bootstrap95CI(
  scores: number[],
  nResamples = 1000,
  rng: () => number = (() => {
    let seed = 12345;
    return () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
  })(),
): Bootstrap95CI {""",
)]

# M2: the CALLER injects a fixed seed -- the same repair, on the other
# carrier (the producer calls the helper instead of letting it default).
M2 = [(
    "src/core/evaluator.ts",
    """      entry.ci = bootstrap95CI(dimScores.map((s) => s.score));""",
    """      entry.ci = bootstrap95CI(dimScores.map((s) => s.score), 1000, (() => {
        let seed = 12345;
        return () => {
          seed = (seed * 1103515245 + 12345) % 2147483648;
          return seed / 2147483648;
        };
      })());""",
)]

# M3: the CI centre becomes the ROUNDED average, so the point estimate and
# the interval agree about what the point estimate was.
M3 = [(
    "src/core/evaluator.ts",
    """  return { mean, std, ciLower, ciUpper, n, nResamples };""",
    """  return { mean: Math.round(mean), std, ciLower, ciUpper, n, nResamples };""",
)]

# M4: no CI is published for n < 4 -- the "95%" label on a 3-question
# dimension is a guarantee the interval cannot make.
M4 = [(
    "src/core/evaluator.ts",
    """    if (count >= 2) {
      entry.ci = bootstrap95CI(dimScores.map((s) => s.score));
    }""",
    """    if (count >= 4) {
      entry.ci = bootstrap95CI(dimScores.map((s) => s.score));
    }""",
)]

# M5: the reporter publishes the number of questions behind the interval.
M5 = [(
    "src/core/reporter.ts",
    """  return `${ci.mean.toFixed(1)} ±${ci.std.toFixed(1)} [${ci.ciLower.toFixed(1)}, ${ci.ciUpper.toFixed(1)}]`;""",
    """  return `${ci.mean.toFixed(1)} ±${ci.std.toFixed(1)} [${ci.ciLower.toFixed(1)}, ${ci.ciUpper.toFixed(1)}] (n=${ci.n})`;""",
)]

# The PARTIAL repair: publish n in the CSV, keep the Markdown text alone.
M5b = [(
    "src/core/reporter.ts",
    """          const out: (string | number)[] = ci === null ? ['-', '-'] : [ci.ciLower, ci.ciUpper];""",
    """          const out: (string | number)[] = ci === null ? ['-', '-'] : [ci.ciLower, ci.ciUpper, ci.n];""",
)]

# M6: the producer publishes the OBSERVED RANGE (which is reproducible by
# construction) instead of the bootstrap bounds.  The repair is on the
# producer's carrier -- the reporter only ever renders what the CI object
# carries, so the bounds have to change where they are computed.
M6 = [(
    "src/core/evaluator.ts",
    """    if (count >= 2) {
      entry.ci = bootstrap95CI(dimScores.map((s) => s.score));
    }""",
    """    if (count >= 2) {
      const raw = dimScores.map((s) => s.score);
      const boot = bootstrap95CI(raw);
      entry.ci = {
        mean: boot.mean,
        std: boot.std,
        ciLower: Math.min(...raw),
        ciUpper: Math.max(...raw),
        n: boot.n,
        nResamples: boot.nResamples,
      };
    }""",
)]

# NEGATIVE control: an inert comment.
N1 = [(
    "src/core/reporter.ts",
    """// src/core/reporter.ts - 报告生成器""",
    """// src/core/reporter.ts - 报告生成器 (r546 negative control: inert)""",
)]

MUTANTS = [
    ("M1", "bootstrap: a SEEDED default rng (the interval becomes reproducible)", M1),
    ("M2", "evaluator: the caller injects a fixed seed", M2),
    ("M3", "bootstrap: the CI centre becomes the ROUNDED average", M3),
    ("M4", "evaluator: no CI is published for n < 4", M4),
    ("M5", "reporter: publish the number of questions behind the interval", M5),
    ("M5b", "reporter: the PARTIAL repair -- publish n in the CSV only", M5b),
    ("M6", "reporter: publish the OBSERVED RANGE instead of the bootstrap bounds", M6),
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
    actually changed the bytes (R456-10).
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
    # R475-2: refuse to run on a dirty OWNED file.  A `git checkout` restore
    # would silently destroy a concurrent agent's in-flight edit, and a
    # snapshot taken on top of somebody else's edit would restore THEIR
    # edit into a tree that no longer matches the snapshot.
    dirty = []
    for rel, path in OWNED.items():
        proc = subprocess.run(
            ["git", "status", "--porcelain", "--", path],
            cwd=str(REPO), capture_output=True, text=True,
        )
        if proc.stdout.strip():
            dirty.append(rel)
    if dirty:
        print("ABORT: the OWNED file(s) %s are DIRTY in the working tree." % dirty)
        print("Refusing to inject into them: the restore would clobber a")
        print("concurrent edit.  Commit or stash first.")
        return 2

    print("=== CONTROL (must be GREEN before any verdict below means anything) ===")
    print("suite     : %s (%d arms declared in the file)" % (SUITE_REL, EXPECTED_TOTAL))
    verdict, detail, _ = run_suite()
    print("control: %s  %s" % (verdict, detail))
    if verdict != "GREEN":
        print("CONTROL NOT GREEN -- aborting matrix")
        return 1

    baseline = {rel: md5(p) for rel, p in OWNED.items()}
    baseline_mtime = {rel: mtime_ns(p) for rel, p in OWNED.items()}
    tmp = tempfile.mkdtemp(prefix="r546_matrix_")
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
            for rel, (b, m) in snapshots.items():
                with open(OWNED[rel], "wb") as f:
                    f.write(b)
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
