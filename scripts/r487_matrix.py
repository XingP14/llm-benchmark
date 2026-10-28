#!/usr/bin/env python3
"""r487 mutation driver -- llm-benchmark.

Shape follows the R475/R486 driver (byte-snapshot restore, git-clean assert
before injection). Two rules learned the hard way and encoded here:

  * OWNED FILES are declared and asserted clean BEFORE any injection. A dirty
    tree makes byte-snapshot restore unsafe: `git checkout` would silently
    destroy work that is not this round's.
  * EVERY injection asserts the needle count BEFORE writing, and asserts
    new != old AFTER. A `str.replace` whose needle never occurs returns the
    original unchanged and a naive "did the suite go red?" check then reads a
    surviving mutant as a killed one (R456).

Usage: python3 scripts/r487_matrix.py [--keep-going]
"""
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
import tempfile

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SUITE = "tests/web/r487-web-coding-score-ignores-test-cases.test.ts"
WEB_EVAL = "src/web/engine/evaluator.ts"
CLI_EVAL = "src/core/evaluator.ts"

# Repairs whose RED-ness this round asserts.
ARMS = [
    # (name, file, needle, replacement, expect_arms_red)
    (
        "M1 REPAIR: scoreCoding reads question.testCases and routes to the core Scorer",
        WEB_EVAL,
        """    const hasDef = output.includes('def ');""",
        """    const q = _question as unknown as { testCases?: Array<{ input: string; expectedOutput: string; description: string }> };
    const stub = { chat: () => { throw new Error('no adapter'); } } as unknown as LLMAdapter;
    const cfg = { name: 'r487', type: 'openai', endpoint: '', apiKey: 'x' } as unknown as ModelConfig;
    return { score: (await new Scorer(stub, cfg).scoreCoding(_question, output, q.testCases)).score };
    const hasDef = output.includes('def ');""",
        True,
    ),
    (
        "M2 REPAIR: pass the question's first test-case input to the sandbox",
        WEB_EVAL,
        """      const result = await this.sandbox.execute(testCode, '');""",
        """      const cases = (_question as unknown as { testCases?: Array<{ input: string }> }).testCases;
      const result = await this.sandbox.execute(testCode, cases && cases.length > 0 ? cases[0].input : '');""",
        True,
    ),
    (
        "M3 REPAIR: make the harness actually invoke the function under test",
        WEB_EVAL,
        """      const testCode = `${output}\\n\\nprint("OK")`;""",
        """      const testCode = `${output}\\n\\n${output.match(/def\\s+(\\w+)\\s*\\(/)?.[1] || 'f'}()`;""",
        True,
    ),
    (
        "M4 CONTROL: a no-op rename that must NOT change any verdict",
        WEB_EVAL,
        """    const hasReturn = output.includes('return') || output.includes('print');""",
        """    const hasReturn =
        output.includes('return') || output.includes('print');""",
        False,
    ),
    (
        "M5 NEGATIVE: revert the CLI to ignore testCases (the defect, on the other path)",
        CLI_EVAL,
        """      return scorer.scoreCoding(question, modelOutput, codeQuestion.testCases);""",
        """      return scorer.scoreCoding(question, modelOutput);""",
        True,
    ),
]


def md5(path: str) -> str:
    with open(path, "rb") as fh:
        return hashlib.md5(fh.read()).hexdigest()


def run(cmd, **kw):
    return subprocess.run(cmd, cwd=REPO, shell=isinstance(cmd, str),
                          capture_output=True, text=True, **kw)


def git_dirty(paths):
    out = run(["git", "status", "--porcelain", "--"] + paths).stdout
    return [l for l in out.splitlines() if l.strip()]


def main() -> int:
    keep = "--keep-going" in sys.argv
    owned = sorted({a[1] for a in ARMS})
    snapshots = {}
    failures = []

    # Guard 1: OWNED files must be clean before we inject anything.
    dirty = git_dirty(owned)
    if dirty:
        print("ABORT: owned files are dirty, restore would be unsafe:")
        for l in dirty:
            print("   ", l)
        return 2
    for rel in owned:
        src = os.path.join(REPO, rel)
        with open(src, "rb") as fh:
            snapshots[rel] = fh.read()
    before = {rel: md5(os.path.join(REPO, rel)) for rel in owned}
    print("pre-injection md5:", before)

    try:
        for name, rel, needle, repl, expect_red in ARMS:
            path = os.path.join(REPO, rel)
            with open(path, "r", encoding="utf-8") as fh:
                text = fh.read()

            # Guard 2: the needle must be present EXACTLY once, and the
            # replacement must actually change the bytes (R456 case (c)).
            n = text.count(needle)
            if n != 1:
                failures.append(f"{name}: needle count {n} (expected 1) -- HARNESS, not a verdict")
                print(f"[HARNESS] {name}: needle count {n}")
                continue
            mutated = text.replace(needle, repl)
            if mutated == text:
                failures.append(f"{name}: replacement was a no-op -- HARNESS")
                print(f"[HARNESS] {name}: no-op replacement")
                continue

            with open(path, "w", encoding="utf-8") as fh:
                fh.write(mutated)
            applied = md5(path)
            if applied == before[rel]:
                failures.append(f"{name}: md5 unchanged after write -- HARNESS")
                print(f"[HARNESS] {name}: md5 unchanged")
                continue

            # jest writes its human-readable report to STDERR, not stdout.
            # Parsing stdout alone yields an empty "Tests:" line and makes
            # every arm read SURVIVED (R486-class false green).
            proc = run([_resolve_tool("jest"), SUITE, "--coverage=false"], timeout=600)
            report = proc.stdout + proc.stderr
            tail = [l for l in report.splitlines() if l.strip()][-4:]
            failed = "failed" in report.lower() and "Tests:" in report
            # A suite that fails to COMPILE is not a detection. Counting it as
            # KILLED turns a broken arm into a false green (M1: the stub scored
            # TS2322/TS2352/TS1109 and "Tests: 0 total" -- the suite never ran).
            # Anchor every probe to the "Tests:" line: jest also prints
            # "Snapshots: 0 total", which a bare "0 total" test would catch.
            compile_broke = ("TS2" in report or "error TS" in report
                             or "Test suite failed to run" in report
                             or re.search(r"^Tests:\s+.*\b0 total\b", report, re.M) is not None)
            count = ""
            for l in report.splitlines():
                if l.startswith("Tests:"):
                    count = l.strip()
                    break
            verdict = "KILLED" if failed else "SURVIVED"
            ok = (verdict == "KILLED") == expect_red
            tag = "" if not compile_broke else "  [COMPILE-BROKEN: not a detection]"
            print(f"\n=== {name}\n    {verdict}  {count}  {'OK' if ok else '*** UNEXPECTED ***'}{tag}")
            if not ok or compile_broke:
                failures.append(f"{name}: {verdict}"
                                f"{', COMPILE-BROKEN' if compile_broke else ''}"
                                f", expected {'KILLED' if expect_red else 'SURVIVED'}")
            if failed:
                for l in tail:
                    if "✕" in l or "●" in l:
                        print("      ", l.strip()[:150])
            if not keep and not ok:
                break
            # restore this file before the next arm
            with open(path, "wb") as fh:
                fh.write(snapshots[rel])
    finally:
        for rel in owned:
            with open(os.path.join(REPO, rel), "wb") as fh:
                fh.write(snapshots[rel])
        after = {rel: md5(os.path.join(REPO, rel)) for rel in owned}
        print("\npost-restore md5:", after)
        if after != before:
            failures.append("RESTORE MISMATCH")
            print("*** RESTORE MISMATCH ***")
        still = git_dirty(owned)
        if still:
            failures.append("owned files dirty after restore")
            print("*** still dirty:", still)

    print("\n" + "=" * 60)
    if failures:
        print("MATRIX FAILURES:")
        for f in failures:
            print("  -", f)
        return 1
    print("MATRIX CLEAN: every arm behaved as declared")
    return 0


if __name__ == "__main__":
    sys.exit(main())
