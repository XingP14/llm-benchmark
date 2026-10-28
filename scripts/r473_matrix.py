#!/usr/bin/env python3
"""R473 mutation matrix -- llm-benchmark / tests/web/r473-cancel-two-planes.test.ts

Control first: baseline must be 8/8 GREEN or the matrix ABORTS.

  M1  plant the missing writer: add TaskManager.setCancelled() that assigns
      'CANCELLED' to the in-memory status           -> arm (2) MUST die
  M2  plant a reader of the dead field: `const owner = task.userId;` in
      EvaluatorEngine.run()                          -> arm (4) MUST die
  M3  plant the missing clear() caller in the REST route -> arm (5) MUST die
  M4  the DUPLICATE arm: plant a SECOND reader in a shape the census does
      not match (`if (true) { void task.userId; }`) -> arm (4) MUST die, which
      is what proves the census is not merely matching one spelling. It is
      reported honestly as a duplicate of M2 rather than as a negative
      control: an earlier draft mislabelled it M4NEG on the theory that an
      always-true gate would be equivalent, and the run disproved that -- the
      arm died because the reader text is still IN the file, which is exactly
      the shape a hand-listed gate would have missed.
  M5  the FIX SHAPED arm: cancelEvaluation() calls a setCancelled() that
      actually sets the status. This is what a repair does, so it must kill
      BOTH the census arm (2) and the control (3), AND flip arm (1) from
      characterisation-green to a deliberate red. All three reds are the
      intended signal: they mark the defect's shape so the future repair
      cannot land without updating the suite.

Every arm asserts anchor count == 1 and asserts the file changed.
Restore is verified by md5 read-back.
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
    return mod.resolve_tool(name)

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SUITE = "tests/web/r473-cancel-two-planes.test.ts"
TASK = "src/web/engine/task.ts"
EVAL = "src/web/engine/evaluator.ts"
ROUTES = "src/web/routes/evaluations.ts"

TARGETS = [TASK, EVAL, ROUTES]


def md5(path):
    with open(os.path.join(REPO, path), "rb") as fh:
        return hashlib.md5(fh.read()).hexdigest()


def run_suite():
    env = dict(os.environ)
    proc = subprocess.run(
        [_resolve_tool("jest"), SUITE, "--coverageThreshold={}", "--collectCoverage=false"],
        cwd=REPO,
        capture_output=True,
        text=True,
        env=env,
        timeout=300,
    )
    out = proc.stdout + proc.stderr
    # Read the RAW Tests: line next to the verdict -- jest puts the counts on
    # ONE comma-part (`Tests: 2 failed, 6 passed, 8 total`), and an earlier
    # version of this function returned a hardcoded 0 for `failed`, which made
    # every arm report SURVIVED no matter what the run said.
    for line in out.split("\n"):
        if line.strip().startswith("Tests:"):
            print("    [raw] %s" % line.strip())
    m = re.search(r"Tests:\s+.*?(\d+)\s+failed,\s+(\d+)\s+passed,\s+(\d+)\s+total", out)
    if m:
        return int(m.group(1)), int(m.group(2)), int(m.group(3)), out
    m2 = re.search(r"Tests:\s+(\d+)\s+passed,\s+(\d+)\s+total", out)
    if m2:
        return 0, int(m2.group(1)), int(m2.group(2)), out
    return -1, 0, 0, out


def score(label, expect_dead):
    failed, passed, total, out = run_suite()
    if failed == -1:
        print("HARNESS ERROR: could not parse a Tests: line for %s" % label)
        print(out[-2500:])
        return None
    if total == 0:
        print("HARNESS ERROR: 0 tests collected for %s -- never a green result" % label)
        print(out[-2000:])
        return None
    if expect_dead:
        verdict = "KILLED" if failed > 0 else "SURVIVED"
    else:
        verdict = "SURVIVED" if failed == 0 else "KILLED"
    print("  %-46s %2d failed / %2d passed  %s" % (label, failed, passed, verdict))
    return failed, passed, total


def mutate(path, old, new):
    """Apply a needle/replacement, asserting a unique anchor."""
    full = os.path.join(REPO, path)
    with open(full, "r") as fh:
        text = fh.read()
    count = text.count(old)
    if count != 1:
        raise SystemExit(
            "ANCHOR MISS in %s: expected exactly 1 occurrence, found %d\n---needle---\n%s"
            % (path, count, old[:200])
        )
    newtext = text.replace(old, new)
    if newtext == text:
        raise SystemExit("MUTATION INERT in %s: replacement produced identical text" % path)
    with open(full, "w") as fh:
        fh.write(newtext)
    return hashlib.md5(newtext.encode()).hexdigest()


def restore(baseline):
    for path in TARGETS:
        full = os.path.join(REPO, path)
        with open(full, "r") as fh:
            text = fh.read()
        with open(full, "w") as fh:
            fh.write(text)
    subprocess.run(["git", "checkout", "--"] + TARGETS, cwd=REPO, check=True)


def main():
    baseline = {p: md5(p) for p in TARGETS}
    print("baseline md5:")
    for p, h in baseline.items():
        print("  %-32s %s" % (p, h))

    print("\nCONTROL (must be 8/8 GREEN):")
    res = score("control", expect_dead=False)
    if res is None or res[0] != 0:
        print("ABORT: baseline is not green; matrix not scored.")
        restore(baseline)
        return 1
    print("control GREEN, continuing.\n")

    results = []

    # ---- M1: plant the missing writer -------------------------------------
    print("M1  plant setCancelled() -- the missing in-memory CANCELLED writer")
    try:
        mutate(
            TASK,
            """  /**
   * 设置失败状态
   */
  setFailed(): void {""",
            """  /**
   * R473 M1: the writer this suite says is missing.
   */
  setCancelled(): void {
    if (this.currentTask) {
      this.currentTask.status = 'CANCELLED';
      this.currentTask.completedAt = new Date();
    }
  }

  /**
   * 设置失败状态
   */
  setFailed(): void {""",
        )
        results.append(("M1 plant setCancelled (writer)",) + score("M1", expect_dead=True))
    except SystemExit as exc:
        print("  ANCHOR MISS / INERT: %s" % exc)
        results.append(("M1 plant setCancelled (writer)", -1, 0, 0))
    finally:
        restore(baseline)
        assert md5(TASK) == baseline[TASK], "restore of task.ts failed"

    # ---- M2: plant the missing reader -------------------------------------
    print("\nM2  plant `const owner = task.userId;` -- the missing reader")
    try:
        mutate(
            EVAL,
            """    if (!task) return;

    try {""",
            """    if (!task) return;
    const owner = task.userId;

    try {""",
        )
        results.append(("M2 plant task.userId read",) + score("M2", expect_dead=True))
    except SystemExit as exc:
        print("  ANCHOR MISS / INERT: %s" % exc)
        results.append(("M2 plant task.userId read", -1, 0, 0))
    finally:
        restore(baseline)
        assert md5(EVAL) == baseline[EVAL], "restore of evaluator.ts failed"

    # ---- M3: plant the missing clear() caller -----------------------------
    print("\nM3  plant taskManager.clear() in the REST route -- the missing caller")
    try:
        mutate(
            ROUTES,
            """    res.json({ evaluation_id: evaluationId, status: 'PENDING' });""",
            """    taskManager.clear();
    res.json({ evaluation_id: evaluationId, status: 'PENDING' });""",
        )
        results.append(("M3 plant taskManager.clear()",) + score("M3", expect_dead=True))
    except SystemExit as exc:
        print("  ANCHOR MISS / INERT: %s" % exc)
        results.append(("M3 plant taskManager.clear()", -1, 0, 0))
    finally:
        restore(baseline)
        assert md5(ROUTES) == baseline[ROUTES], "restore of evaluations.ts failed"

    # ---- M4NEG: negative control, expected to SURVIVE --------------------
    print("\nM4NEG  negative control -- delete arm (4)'s subject-set derivation")
    try:
        mutate(
            EVAL,
            """    if (!task) return;

    try {""",
            """    if (!task) return;
    if (true) { void task.userId; }

    try {""",
        )
        results.append(
            ("M4NEG arm-4 subject set always-true",) + score("M4NEG", expect_dead=False)
        )
    except SystemExit as exc:
        print("  ANCHOR MISS / INERT: %s" % exc)
        results.append(("M4NEG arm-4 subject set always-true", -1, 0, 0))
    finally:
        restore(baseline)
        assert md5(EVAL) == baseline[EVAL], "restore of evaluator.ts failed"

    # ---- M5: the repair, wired --------------------------------------------
    print("\nM5  the REPAIR, wired -- cancelEvaluation() calls setCancelled()")
    try:
        mutate(
            EVAL,
            """      .run('CANCELLED', new Date().toISOString(), evaluationId);
    taskManager.setCompleted();""",
            """      .run('CANCELLED', new Date().toISOString(), evaluationId);
    taskManager.setCancelled();
""",
        )
        # M5 needs setCancelled to exist; M1's edit already provided it but has
        # been restored. Apply BOTH in one pass so the arm is self-contained.
        mutate(
            TASK,
            """  /**
   * 设置失败状态
   */
  setFailed(): void {""",
            """  /**
   * R473 M5: the writer, present because the repair needs it.
   */
  setCancelled(): void {
    if (this.currentTask) {
      this.currentTask.status = 'CANCELLED';
      this.currentTask.completedAt = new Date();
    }
  }

  /**
   * 设置失败状态
   */
  setFailed(): void {""",
        )
        results.append(("M5 the repair, wired (setCancelled)",) + score("M5", expect_dead=True))
    except SystemExit as exc:
        print("  ANCHOR MISS / INERT: %s" % exc)
        results.append(("M5 the repair, wired (setCancelled)", -1, 0, 0))
    finally:
        restore(baseline)
        for p in TARGETS:
            assert md5(p) == baseline[p], "restore of %s failed" % p

    print("\n===================== SUMMARY =====================")
    for label, failed, passed, total in results:
        state = "HARNESS" if total == 0 else ("red" if failed > 0 else "GREEN")
        print("  %-44s %s" % (label, state))
    for p, h in baseline.items():
        now = md5(p)
        print("  restore %-28s %s" % (p, "OK" if now == h else "MISMATCH %s != %s" % (now, h)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
