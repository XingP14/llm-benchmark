#!/usr/bin/env python3
"""
R519 mutation matrix (llm-benchmark) -- the web coding score ignores the
benchmark's test cases.

Discipline carried from R473 / R486 / R487 / R497 / R507 / R511 / R513 /
R514 / R517 / R518:

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
  * parse the summary EXPLICITLY and assert it against the suite size
    (R497-11c): under a glyph-counting parser the count is the number of
    TEST FILES, not tests.

THE EXPECTED TEST COUNT IS DERIVED, NOT TRANSCRIBED (R511 / R513 class).
The count is read out of the SUITE FILE at run time -- the number of `it(`
arms it declares -- and the control run asserts the parser agrees with it.
A transcribed constant is a pinned path: it measures the AUTHOR's copy of
the suite, not the suite in this tree.

Arms
----
  M1  THE REAL REPAIR of the scoring path: the web scorer reads the
      question's test cases, runs the sandbox with each case's INPUT, and
      compares the output with the case's expectedOutput.  MUST KILL.

  M2  THE PARTIAL REPAIR of F2 alone: the web scorer still ignores the
      expectedOutput, but it now passes the question's first test-case
      INPUT to the sandbox instead of the empty string.  MUST KILL -- if it
      survived, the suite's headline claim ("the empty input is the cause")
      would be about the wrong mechanism.

  N1  NEGATIVE CONTROL: a comment that changes nothing.  MUST SURVIVE.  Its
      purpose is to prove the driver is capable of reporting a survivor --
      a driver where every arm reads KILLED is not measuring anything.

The owned file is `src/web/engine/evaluator.ts` -- a PRODUCTION file, the
same discipline R518 used for `src/web/routes/configs.ts`.  The restore is
byte-verified against the pre-mutation snapshot AND against the
repository's HEAD blob, so a failed restore cannot go unnoticed.

WHY THIS DRIVER IS NOT `r518_matrix.py`
---------------------------------------
That driver scores the config-delete route; this one scores the web coding
scorer.  It reuses the SAME resolver discipline (the runner is resolved from
the TREE this script stands in, via scripts/resolve_tool.py -- R514/R517),
and the SAME restore discipline (snapshot into a path this script owns,
restore on EXIT via a trap, restore BEFORE the snapshot is removed).
"""

import hashlib
import os
import re
import subprocess
import sys
from pathlib import Path


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

SUITE_REL = "tests/web/r519-web-coding-score-ignores-test-cases.test.ts"
SUITE = SUITE_REL
OWNED_REL = "src/web/engine/evaluator.ts"
OWNED = REPO / OWNED_REL


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


def _derive_expected_total() -> int:
    """Read the arm count out of the SUITE FILE in THIS tree.

    R511/R513 class: a transcribed constant is a pinned path.  The number of
    `it(` arms the suite declares is derived from the file, so a suite that
    gains or loses an arm is measured with its own count.
    """
    src = (REPO / SUITE_REL).read_text(encoding="utf-8")
    arms = re.findall(r"^\s*it\(", src, re.M)
    if not arms:
        raise SystemExit("ABORT: no `it(` arms found in %s -- the driver "
                         "cannot derive the expected total." % SUITE_REL)
    return len(arms)


EXPECTED_TOTAL = _derive_expected_total()

# ------------------------------------------------------------------ needles
#
# The web scorer (src/web/engine/evaluator.ts:305-327), verbatim:
#
#   private async scoreCoding(_question: BenchmarkQuestion, output: string): Promise<{ score: number }> {
#     // 基本语法检查
#     const hasDef = output.includes('def ');
#     const hasReturn = output.includes('return') || output.includes('print');
#
#     if (!hasDef) return { score: 20 };
#     if (!hasReturn) return { score: 40 };
#
#     // 尝试执行代码
#     try {
#       const funcMatch = output.match(/def\s+(\w+)\s*\(/);
#       if (!funcMatch) return { score: 50 };
#
#       // 简单执行测试
#       const testCode = `${output}\n\nprint("OK")`;
#       const result = await this.sandbox.execute(testCode, '');
#
#       if (result.success) {
#         return { score: 80 };
#       }
#     } catch {}
#
#     return { score: 60 };
#   }
#
# M1 -- THE REAL REPAIR: the scorer reads the question's test cases, runs the
# sandbox with each case's INPUT, and compares the printed output with the
# case's expectedOutput.  This is the fix the suite's header calls F1/F2/F3
# and it is deliberately NOT shipped -- the repair is a product decision
# (the file's "WHAT THIS FILE DELIBERATELY DOES NOT DO" section).  The arm
# exists so that "the suite would notice" is a measurement and not a claim.
#
# It needs the CodeBenchmarkQuestion TYPE, which the file does not import
# today.  A COMPILE-BROKEN arm would be scored HARNESS, which proves
# nothing -- so the import is part of the edit, not decoration.

IMPORT_OLD = """import { getAllCodeBenchmarks } from '../../benchmarks/coding';"""
IMPORT_M1 = """import { getAllCodeBenchmarks, CodeBenchmarkQuestion } from '../../benchmarks/coding';"""

SCORING_OLD = """  private async scoreCoding(_question: BenchmarkQuestion, output: string): Promise<{ score: number }> {
    // 基本语法检查
    const hasDef = output.includes('def ');
    const hasReturn = output.includes('return') || output.includes('print');

    if (!hasDef) return { score: 20 };
    if (!hasReturn) return { score: 40 };

    // 尝试执行代码
    try {
      const funcMatch = output.match(/def\\s+(\\w+)\\s*\\(/);
      if (!funcMatch) return { score: 50 };

      // 简单执行测试
      const testCode = `${output}\\n\\nprint("OK")`;
      const result = await this.sandbox.execute(testCode, '');

      if (result.success) {
        return { score: 80 };
      }
    } catch {}

    return { score: 60 };
  }"""

SCORING_M1 = """  private async scoreCoding(question: BenchmarkQuestion, output: string): Promise<{ score: number }> {
    const testCases = (question as CodeBenchmarkQuestion).testCases ?? [];
    if (testCases.length > 0) {
      let passed = 0;
      for (const tc of testCases) {
        try {
          const result = await this.sandbox.execute(output, tc.input);
          if (result.success && result.output.trim() === tc.expectedOutput.trim()) {
            passed += 1;
          }
        } catch {}
      }
      return { score: Math.round((passed / testCases.length) * 80) };
    }

    // 基本语法检查
    const hasDef = output.includes('def ');
    const hasReturn = output.includes('return') || output.includes('print');

    if (!hasDef) return { score: 20 };
    if (!hasReturn) return { score: 40 };

    // 尝试执行代码
    try {
      const funcMatch = output.match(/def\\s+(\\w+)\\s*\\(/);
      if (!funcMatch) return { score: 50 };

      // 简单执行测试
      const testCode = `${output}\\n\\nprint("OK")`;
      const result = await this.sandbox.execute(testCode, '');

      if (result.success) {
        return { score: 80 };
      }
    } catch {}

    return { score: 60 };
  }"""

# M2 -- THE PARTIAL REPAIR of F2 alone: the empty input becomes the
# question's first test-case input, but the scorer still never looks at the
# expectedOutput.  If the suite's arms still pass under M2, then the arms
# are measuring the INPUT and not the CORRECTNESS, and the file's headline
# claim would be over-stated.

SCORING_M2 = """  private async scoreCoding(_question: BenchmarkQuestion, output: string): Promise<{ score: number }> {
    // 基本语法检查
    const hasDef = output.includes('def ');
    const hasReturn = output.includes('return') || output.includes('print');

    if (!hasDef) return { score: 20 };
    if (!hasReturn) return { score: 40 };

    // 尝试执行代码
    try {
      const funcMatch = output.match(/def\\s+(\\w+)\\s*\\(/);
      if (!funcMatch) return { score: 50 };

      // 简单执行测试
      const testCode = `${output}\\n\\nprint("OK")`;
      const cases = (_question as unknown as { testCases?: Array<{ input: string }> }).testCases;
      const input = cases?.[0]?.input ?? '';
      const result = await this.sandbox.execute(testCode, input);

      if (result.success) {
        return { score: 80 };
      }
    } catch {}

    return { score: 60 };
  }"""

# N1 -- NEGATIVE CONTROL: a comment that changes nothing.  It must compile
# and it must be behaviour-neutral.  The first draft of an arm in this repo
# replaced the block with a BYTE-IDENTICAL copy of itself, so the
# replacement was a no-op and the arm scored NOT-INJECTED.  A control that
# does not change the file is not a control: it exercises nothing.

SCORING_N1 = """  private async scoreCoding(_question: BenchmarkQuestion, output: string): Promise<{ score: number }> {
    // 基本语法检查
    const hasDef = output.includes('def ');
    const hasReturn = output.includes('return') || output.includes('print');

    if (!hasDef) return { score: 20 };
    if (!hasReturn) return { score: 40 };

    // 尝试执行代码
    try {
      const funcMatch = output.match(/def\\s+(\\w+)\\s*\\(/);
      if (!funcMatch) return { score: 50 };

      // 简单执行测试
      // negative control: a comment that changes nothing
      const testCode = `${output}\\n\\nprint("OK")`;
      const result = await this.sandbox.execute(testCode, '');

      if (result.success) {
        return { score: 80 };
      }
    } catch {}

    return { score: 60 };
  }"""

ARMS = [
    ("M1", [(IMPORT_OLD, IMPORT_M1), (SCORING_OLD, SCORING_M1)], "KILLED",
     "the REAL REPAIR: run the benchmark's test cases with their INPUT and "
     "compare with expectedOutput"),
    ("M2", [(SCORING_OLD, SCORING_M2)], "KILLED",
     "the PARTIAL REPAIR of F2 alone: pass the first test case's INPUT "
     "instead of the empty string"),
    ("N1", [(SCORING_OLD, SCORING_N1)], "SURVIVED",
     "NEGATIVE CONTROL: a comment added inside the scorer"),
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
    tmp = p.with_suffix(p.suffix + ".r519tmp")
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
        cwd=REPO, capture_output=True, text=True, timeout=3600,
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
    print("expected total %d (DERIVED from %s)" % (EXPECTED_TOTAL, SUITE_REL))
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
    snapshot = REPO / "scripts" / ".r519_snapshot.ts"
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
            # "Tests: 0 total" is a HARD HARNESS ERROR, not a survival: the
            # suite did not run at all (a COMPILE-BROKEN mutant, a bad path,
            # a crashed worker).  Scoring it as SURVIVED would report a
            # confident verdict about a suite that never executed -- and a
            # driver where every arm reads KILLED/SURVIVED for the wrong
            # reason measures nothing.  (R497-11c family: an explicit parse
            # plus an explicit assertion against a known count.)
            if t == -1:
                verdict = "HARNESS"
            elif t == 0:
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
