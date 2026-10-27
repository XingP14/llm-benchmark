#!/usr/bin/env python3
"""R486 mutation matrix -- llm-benchmark.

Subject set: tests/web/r486-duplicate-config-ids-are-evaluated-twice.test.ts
Premise files: src/web/routes/evaluations.ts, src/web/engine/task.ts,
               src/web/db/database.ts, src/web/engine/evaluator.ts

Discipline (R477/R475):
  * OWNED set declared here and ONLY these files are touched.
  * snapshot BEFORE any mutation, out of tree.
  * every needle carries an anchor-count==1 guard, else HARNESS (never a verdict).
  * restore before the next arm reads the file, not only in finally.
  * M6 is the negative control and MUST SURVIVE.
"""
import hashlib
import json
import os
import pathlib
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
    return mod.resolve_tool(name, here)
import tempfile

# R511 (2026-10-28): the tree and the snapshot must be DERIVED, not
# transcribed.
#
# REPO used to be the literal "/root/.hermes/workspace/llm-benchmark".  A
# path baked into a script is validated on exactly ONE host: MEASURED, a COPY
# of this driver placed in a DIFFERENT checkout still resolved REPO to the
# author's tree, so the copy's driver mutated, measured and restored the
# AUTHOR'S source files while the copy's own tree was never touched.  The
# verdict the driver printed was about a tree the caller did not ask about.
#
# The repository is now derived from THIS FILE's own location, and the
# derivation is ASSERTED against the repository's marker file -- so a driver
# that has been copied away from a checkout fails LOUDLY instead of quietly
# measuring somebody else's tree.
REPO = pathlib.Path(__file__).resolve().parent.parent
if not (REPO / "jest.config.js").is_file():
    raise SystemExit(
        "ABORT: cannot derive a repository root above %s (no jest.config.js) -- "
        "this driver must live inside a checkout of the repository it measures."
        % pathlib.Path(__file__).resolve()
    )

# R511 (2026-10-28): the snapshot used to live in the PRUNED SCRATCH
# DIRECTORY ("/root/.hermes/cache/scratch/r486_snap").  MEASURED 2026-10-28:
# that directory no longer contains it (scratch entries idle for 24h are
# pruned), and a restore from a path that does not exist is a NO-OP -- the
# exact failure class R507 fixed in the sibling driver.  The snapshot is now
# created fresh, OUT OF TREE, by tempfile.mkdtemp(), which is the same
# discipline r501_matrix.py already uses.
SNAP = pathlib.Path(tempfile.mkdtemp(prefix="r486-matrix-"))
SUITE = "tests/web/r486-duplicate-config-ids-are-evaluated-twice.test.ts"

OWNED = {
    "src/web/routes/evaluations.ts",
    "src/web/engine/task.ts",
    "src/web/db/database.ts",
    "src/web/engine/evaluator.ts",
}

# (id, relpath, old, new, expectation)
ARMS = [
    # M1 -- THE ACTUAL FIX for F1+F2 at the route boundary (dedup where the
    # input arrives). Must be killed by the behaviour arms.
    ("M1", "src/web/routes/evaluations.ts",
     "for (const configId of config_ids) {",
     "for (const configId of new Set(config_ids)) {",
     "KILLED"),
    # M2 -- the OTHER defensible layer: dedup inside taskManager.startTask.
    # Fixes the WORK list only; the link table is still written twice.
    ("M2", "src/web/engine/task.ts",
     "      status: 'PENDING',\n      configs,",
     "      status: 'PENDING',\n      configs: [...new Set(configs)],",
     "KILLED"),
    # M3 -- THE ACTUAL FIX for F4 (DISTINCT in the join).
    ("M3", "src/web/routes/evaluations.ts",
     "    JOIN evaluation_configs ec ON c.id = ec.config_id",
     "    JOIN evaluation_configs ec ON c.id = ec.config_id GROUP BY c.id",
     "KILLED"),
    # M4 -- THE ACTUAL FIX for F3 (honest denominator).
    ("M4", "src/web/engine/evaluator.ts",
     "const total = questions.length * task.configs.length;",
     "const total = questions.length * new Set(task.configs).size;",
     "KILLED"),
    # M5 -- a WRONG fix: reject the duplicate as invalid (400). Defensible on
    # paper, but the suite must go red on it -- that is the arm (5) contract.
    ("M5", "src/web/routes/evaluations.ts",
     "    // 关联配置\n    for (const configId of config_ids) {",
     "    // 关联配置\n    if (new Set(config_ids).size !== config_ids.length) {\n"
     "      res.status(400).json({ error: 'duplicate config id' });\n"
     "      return;\n    }\n    for (const configId of config_ids) {",
     "KILLED"),
    # M6 -- NEGATIVE CONTROL, must SURVIVE. Pure column ALIASING in the results
# SELECT: identical semantics, and no arm observes the query text of the
# SELECT list (arm (6) reads the JOIN line, which is a different line).
#
# NOTE the first attempt renamed the `for (const config of configs)` binding and
# scored HARNESS (0 tests) rather than SURVIVED: the loop body still referenced
# `config`, so ts-jest failed to compile the file and collected 0 tests. That is
# #181 -- "0 total" is a HARD HARNESS ERROR, never a survivor -- and it is the
# reason a control has to be authored as a mutation that COMPILES.
    ("M6", "src/web/routes/evaluations.ts",
     "    SELECT c.id, c.name, c.type\n",
     "    SELECT c.id AS id, c.name AS name, c.type AS type\n",
     "SURVIVE"),
]


def md5(p: pathlib.Path) -> str:
    return hashlib.md5(p.read_bytes()).hexdigest()


def owned_clean() -> bool:
    st = subprocess.run(["git", "status", "--porcelain"], cwd=REPO,
                        capture_output=True, text=True).stdout
    dirty = {ln[3:].strip() for ln in st.splitlines() if ln[:2] != "??"}
    return not (dirty & OWNED)


def snapshot():
    if SNAP.exists():
        shutil.rmtree(SNAP)
    SNAP.mkdir(parents=True, exist_ok=True)
    for rel in OWNED:
        dst = SNAP / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(REPO / rel, dst)
    for rel in OWNED:
        (SNAP / rel).with_suffix((SNAP / rel).suffix + ".md5").write_text(md5(SNAP / rel))


def restore_all():
    for rel in OWNED:
        shutil.copy2(SNAP / rel, REPO / rel)
    return all(md5(SNAP / rel) == md5(REPO / rel) for rel in OWNED)


def run_suite() -> tuple[int, int, int, str]:
    r = subprocess.run(
        [_resolve_tool("jest"), SUITE, "--coverageThreshold={}", "--collectCoverage=false"],
        cwd=REPO, capture_output=True, text=True, timeout=600)
    # jest prints its summary to STDERR, not stdout (measured 2026-10-19 03:0x).
    # Capturing stdout alone silently yields total=0, which is the #181 "0 total"
    # HARNESS shape -- a parsing miss that reads as a broken suite.
    out = r.stdout + "\n" + r.stderr
    import re
    failed = passed = total = 0
    m = re.search(r"Tests:(?:.*?\b(\d+) failed)?(?:.*?\b(\d+) passed)?.*?\b(\d+) total", out)
    if m:
        failed = int(m.group(1) or 0)
        passed = int(m.group(2) or 0)
        total = int(m.group(3))
    return failed, passed, total, out


def main():
    if not owned_clean():
        print("HARNESS: owned set not clean -- refusing to mutate")
        return 2
    snapshot()

    print("=== BASELINE ===")
    f, p, t, _ = run_suite()
    print(f"baseline: {p} passed / {f} failed / {t} total")
    if t == 0 or f != 0 or p == 0:
        print("HARNESS: baseline is not green")
        restore_all()
        return 2
    baseline_md5 = {rel: md5(REPO / rel) for rel in OWNED}
    base_passed = p

    results = []
    for arm_id, rel, old, new, expect in ARMS:
        if not restore_all():
            print(f"{arm_id}: HARNESS (restore failed)")
            results.append((arm_id, "HARNESS", 0, 0, 0, expect))
            continue
        src = REPO / rel
        text = src.read_text()
        count = text.count(old)
        if count != 1:
            print(f"{arm_id}: HARNESS (anchor count={count}, expected 1)")
            results.append((arm_id, "HARNESS", 0, 0, count, expect))
            continue
        tmp = src.with_suffix(src.suffix + ".r486tmp")
        tmp.write_text(text.replace(old, new, 1))
        os.replace(tmp, src)          # atomic; never truncates the tracked file
        assert md5(src) != baseline_md5[rel], f"{arm_id}: mutation did not change bytes"

        f, p, t, out = run_suite()
        # M6 renames a variable the body still references -> compiles fail? measure.
        killed = f > 0
        if t == 0:
            verdict = "HARNESS"
        elif killed:
            verdict = "KILLED"
        else:
            verdict = "SURVIVED"

        ok = restore_all()
        results.append((arm_id, verdict, f, p, t, expect))
        detail = "" if ok else " [RESTORE FAILED]"
        fails = [ln.strip() for ln in out.splitlines() if ln.strip().startswith("✕")]
        print(f"{arm_id}: {verdict}  ({f} failed / {p} passed / {t} total){detail}")
        for x in fails:
            print(f"      {x}")

    print("\n=== VERIFY TREE RESTORED ===")
    final_ok = all(md5(SNAP / rel) == md5(REPO / rel) for rel in OWNED)
    print("restored byte-identical:", final_ok)
    print("baseline", baseline_md5)

    print("\n=== SUMMARY ===")
    tally = {"KILLED": 0, "SURVIVED": 0, "HARNESS": 0}
    for arm_id, verdict, f, p, t, expect in results:
        tally[verdict] = tally.get(verdict, 0) + 1
        flag = ""
        if expect == "SURVIVE" and verdict != "SURVIVED":
            flag = "  <-- CONTROL FAILED"
        if expect == "KILLED" and verdict != "KILLED":
            flag = "  <-- UNEXPECTED"
        print(f"  {arm_id}: {verdict} (expect {expect}){flag}")
    print(json.dumps(tally))
    return 0 if final_ok else 1


if __name__ == "__main__":
    sys.exit(main())
