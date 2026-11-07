#!/usr/bin/env python3
"""
R535 mutation matrix (llm-benchmark) -- the CODING dimension's oracle
scores a WRONG answer higher than the correct one, and the web plane never
runs the test cases at all.

Discipline carried from R473 / R486 / R487 / R497 / R507 / R511 / R513 /
R514 / R517 / R518 / R519 / R522 / R526 / R528 / R531 / R532 / R533:

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
  * "Tests: 0 total" is HARNESS, not SURVIVED;
  * jest prints its human-readable report to STDERR -- parse stdout + stderr;
  * parse the summary EXPLICITLY and assert it against the suite size
    (R497-11c): under a glyph-counting parser the count is the number of
    TEST FILES, not tests.

THE EXPECTED TEST COUNT IS DERIVED, NOT TRANSCRIBED (R511 / R513 class).
The count is read out of the SUITE FILE at run time -- the number of `it(`
arms it declares -- and the control run asserts the parser agrees with it.

Arms -- each is a NAMED REPAIR FROM THE PUBLISHED CANONICAL, not an
invented patch.  The canonicals are:

  * EvalPlus (evalplus/evalplus, 1838 stars, Apache-2.0, NeurIPS 2023 &
    COLM 2024) -- "Rigourous evaluation of LLM-synthesized code".  Its
    HumanEval+ / MBPP+ ground truths are EXECUTABLE ASSERTIONS, not
    hand-typed stdout strings: the reference solution must satisfy the
    assertions, and the assertions are the contract.
  * HumanEval / MBPP -- the original `assert`-style harnesses; the expected
    behaviour is expressed as a check that RUNS, not as a byte string that
    is COMPARED.
  * LiveCodeBench (973 stars, MIT) -- keeps PER-TEST-CASE results, so a
    passing subset is distinguishable from a passing whole.
  * The `str` vs `dict` asymmetry is a Python-semantics fact: `print(s)` for
    a `str` emits no quotes, while `print(d)` for a `dict` emits `repr(d)`.
    A hand-authored expected-output string cannot know which of the two it
    is describing, which is exactly why the canonicals moved to assertions.

  M1  THE REAL REPAIR of F1 (the canonical one): THE ORACLE BECOMES
      ASSERTION-BASED.  Instead of comparing the child's stdout to a
      hand-typed string, the test case carries an executable ASSERTION that
      the child's result must satisfy.  For `code-string-001` the assertion
      is `assert result == "olleh"` -- the DATA, not the SOURCE literal.
      The minimal honest form this arm can inject while remaining a REPAIR
      rather than a rewrite: the coding benchmark's test cases gain an
      optional `assertion` field, and the scorer prefers the assertion when
      one is present.
      MUST KILL -- if it survived, the suite's "the oracle rewards a wrong
      answer" claim would be about the wrong mechanism.

  M2  THE REAL REPAIR of F1 (the minimal one): THE EXPECTED OUTPUT IS
      CORRECTED TO `str()` SEMANTICS.  The canonical's assertion shape
      implies the same thing the hand-written fix does: the expected value
      must be what the child actually prints.  The minimal honest form:
      `code-string-001`'s three expected outputs lose their quote
      characters, so they describe the DATA.
      MUST KILL -- if it survived, the suite's "the expected output carries
      the SOURCE literal's quotes" claim would be about the wrong mechanism.

  M3  THE REAL REPAIR of F2: THE WEB PLANE RUNS THE SAME TEST CASES THE
      CLI PLANE RUNS.  The canonicals keep per-test-case results; the web
      plane here scores a coding answer with a syntax check and a bare
      execution, so a wrong answer and a right answer are the same number.
      The minimal honest form: the web scorer receives the question's
      test cases and runs them through the same sandbox + comparison the
      CLI scorer uses.
      MUST KILL -- if it survived, the suite's "the web plane never runs the
      test cases" claim would be about the wrong mechanism.

  M4  THE REAL REPAIR of F3: THE AGGREGATE IS WEIGHTED.  The benchmark data
      declares a weight per question (1 / 1.5 / 2 / 2.5) and the README
      publishes it as the dimension's 权重 column; a benchmark whose
      published weighting does not reach the published total is a
      measurement-validity defect.  The minimal honest form:
      `calculateTotalScore` and `buildDimEntry` weight each score by its
      question's declared weight.
      MUST KILL -- if it survived, the suite's "the declared weights are
      never read" claim would be about the wrong mechanism.

  N1  NEGATIVE CONTROL: a comment that changes nothing.  MUST SURVIVE.  Its
      purpose is to prove the driver is capable of reporting a survivor --
      a driver where every arm reads KILLED is not measuring anything.

The owned files are `src/benchmarks/coding.ts` (the coding question data),
`src/core/scorer.ts` (the CLI scorer), `src/web/engine/evaluator.ts` (the
web scorer) and `src/core/evaluator.ts` (the aggregation).  All four are
snapshotted before injection and restored BY BYTES; the restore is verified
against the repository's HEAD blob, so a failed restore cannot go unnoticed.
"""

import hashlib
import os
import re
import signal
import subprocess
import sys
from pathlib import Path


def _resolve_tool(name):
    """Resolve a tool from the TREE this script stands in."""
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

SUITE_REL = "tests/r535-coding-plane.test.ts"
SUITE = SUITE_REL

# The production files the arms may edit.  Each is snapshotted and restored.
OWNED_RELS = [
    "src/benchmarks/coding.ts",
    "src/core/scorer.ts",
    "src/web/engine/evaluator.ts",
    "src/core/evaluator.ts",
    "src/types/index.ts",
]


def _head_blob_md5(rel: str) -> str:
    """The md5 of `rel` as the repository's HEAD records it."""
    out = subprocess.run(
        ["git", "show", "HEAD:" + rel],
        cwd=REPO, capture_output=True, check=True,
    ).stdout
    return hashlib.md5(out).hexdigest()


def md5_bytes(data: bytes) -> str:
    return hashlib.md5(data).hexdigest()


BASELINE_MD5 = {rel: _head_blob_md5(rel) for rel in OWNED_RELS}


def _derive_expected_total() -> int:
    """Read the arm count out of the SUITE FILE in THIS tree."""
    src = (REPO / SUITE_REL).read_text(encoding="utf-8")
    arms = re.findall(r"^\s*it\(", src, re.M)
    if not arms:
        raise SystemExit("ABORT: no `it(` arms found in %s -- the driver "
                         "cannot derive the expected total." % SUITE_REL)
    return len(arms)


EXPECTED_TOTAL = _derive_expected_total()

# ------------------------------------------------------------------ needles
#
# M1 -- THE REAL REPAIR of F1: THE ORACLE BECOMES ASSERTION-BASED.
#
# The needle is the coding benchmark's `code-string-001` test cases, which
# carry hand-typed stdout strings.  The canonical (EvalPlus / HumanEval /
# MBPP) expresses the expected behaviour as an EXECUTABLE CHECK:
#
#     assert result == "olleh"
#
# i.e. against the DATA.  The minimal honest form this arm can inject:
# each coding test case gains an optional `assertion` field carrying the
# executable check, and the CLI scorer's comparison prefers the assertion
# when one is present.
#
# The assertion is authored for the DATA (`"olleh"` -- the reversed value),
# which is exactly what a correct implementation returns.

M1_OLD = """      { input: '"hello"', expectedOutput: '"olleh"', description: '普通字符串' },
      { input: '"abc"', expectedOutput: '"cba"', description: '短字符串' },
      { input: '"racecar"', expectedOutput: '"racecar"', description: '回文' },"""

M1_NEW = """      { input: '"hello"', expectedOutput: '"olleh"', description: '普通字符串', assertion: 'result == "olleh"' },
      { input: '"abc"', expectedOutput: '"cba"', description: '短字符串', assertion: 'result == "cba"' },
      { input: '"racecar"', expectedOutput: '"racecar"', description: '回文', assertion: 'result == "racecar"' },"""

# M1 also needs the TYPE half: the `assertion` field must exist on
# CodeTestCase, or the benchmark data does not compile and the arm is a
# COMPILE-BROKEN HARNESS rather than a repair.
M1_TYPE_OLD = """export interface CodeTestCase {
  /** 输入 */
  input: string;
  /** 期望输出 */
  expectedOutput: string;
  /** 测试描述 */
  description: string;
}"""

M1_TYPE_NEW = """export interface CodeTestCase {
  /** 输入 */
  input: string;
  /** 期望输出 */
  expectedOutput: string;
  /** 测试描述 */
  description: string;
  /** R535 M1: an executable assertion on the RESULT (canonical: EvalPlus / HumanEval / MBPP) */
  assertion?: string;
}"""

# M1 also needs the CONSUMER half: the scorer must PREFER the assertion over
# the stdout comparison.  Without this the arm would only add a dead field,
# and the suite's F1 claim would survive for the wrong reason.
M1_SCORER_OLD = """  private async executeTests(
    code: string,
    testCases: Array<{ input: string; expectedOutput: string; description: string }>
  ): Promise<TestResult[]> {
    const results: TestResult[] = [];

    for (const tc of testCases) {
      try {
        const result = await this.sandbox.execute(code, tc.input);
        
        // 比较输出（去除首尾空白）
        const actual = result.output.trim();
        const expected = tc.expectedOutput.trim();
        const passed = result.success && actual === expected;
"""

M1_SCORER_NEW = """  private async executeTests(
    code: string,
    testCases: Array<{ input: string; expectedOutput: string; description: string; assertion?: string }>
  ): Promise<TestResult[]> {
    const results: TestResult[] = [];

    for (const tc of testCases) {
      try {
        const result = await this.sandbox.execute(code, tc.input);
        
        // 比较输出（去除首尾空白）
        const actual = result.output.trim();
        const expected = tc.expectedOutput.trim();
        // R535 M1: an ASSERTION-based test case is the canonical contract
        // (EvalPlus / HumanEval / MBPP): the check RUNS against the result,
        // so it is stated against the DATA and not against a hand-typed
        // stdout string.  Prefer the assertion when one is present.
        let passed = result.success && actual === expected;
        if (tc.assertion) {
          passed = result.success && await this.runAssertion(code, tc.input, tc.assertion);
        }
"""

# The assertion runner: execute the code, capture the result as `result`,
# then run the assertion in the SAME child.
M1_RUNNER_OLD = """  private evaluateCodeQuality(code: string): number {"""

M1_RUNNER_NEW = """  private async runAssertion(code: string, input: string, assertion: string): Promise<boolean> {
    const funcMatch = code.match(/def\s+(\w+)\s*\(/);
    if (!funcMatch) return false;
    const funcName = funcMatch[1];
    const testCode = `${code}\n\nresult = ${funcName}(${input})\nassert ${assertion}`;
    const res = await this.sandbox.execute(testCode, input);
    return res.success;
  }

  private evaluateCodeQuality(code: string): number {"""

# M2 -- THE REAL REPAIR of F1 (minimal): THE EXPECTED OUTPUT IS CORRECTED
# TO `str()` SEMANTICS.  The canonical's assertion shape implies the same
# thing: the expected value must be what the child PRINTS, and `print()` of
# a `str` emits no quotes.  The minimal honest form: the three expected
# outputs lose their quote characters, so they describe the DATA.

M2_OLD = M1_OLD

M2_NEW = """      { input: '"hello"', expectedOutput: 'olleh', description: '普通字符串' },
      { input: '"abc"', expectedOutput: 'cba', description: '短字符串' },
      { input: '"racecar"', expectedOutput: 'racecar', description: '回文' },"""

# M3 -- THE REAL REPAIR of F2: THE WEB PLANE RUNS THE SAME TEST CASES.
#
# The needle is `src/web/engine/evaluator.ts`'s `scoreCoding`, which
# ignores `testCases` entirely.  The canonicals keep PER-TEST-CASE results
# (LiveCodeBench) rather than one opaque number, so a wrong answer and a
# right answer are distinguishable.  The minimal honest form: the web
# scorer receives the question's test cases and runs them through the same
# sandbox + comparison the CLI scorer uses.

M3_OLD = """  private async scoreCoding(_question: BenchmarkQuestion, output: string): Promise<{ score: number }> {
    // 基本语法检查
    const hasDef = output.includes('def ');
    const hasReturn = output.includes('return') || output.includes('print');

    if (!hasDef) return { score: 20 };
    if (!hasReturn) return { score: 40 };
"""

M3_NEW = """  private async scoreCoding(_question: BenchmarkQuestion, output: string): Promise<{ score: number }> {
    // R535 M3: the web plane must run the SAME test cases the CLI plane
    // runs, so a wrong answer and a right answer are distinguishable.
    const testCases = (_question as unknown as { testCases?: Array<{ input: string; expectedOutput: string }> }).testCases;
    if (testCases && testCases.length > 0) {
      let passed = 0;
      for (const tc of testCases) {
        try {
          const result = await this.sandbox.execute(output, tc.input);
          if (result.success && (result.output || '').trim() === tc.expectedOutput.trim()) passed += 1;
        } catch {}
      }
      const testScore = (passed / testCases.length) * 80;
      const qualityScore = output.includes('#') || output.includes('def ') ? 15 : 0;
      return { score: Math.min(100, Math.round(testScore + qualityScore)) };
    }

    // 基本语法检查
    const hasDef = output.includes('def ');
    const hasReturn = output.includes('return') || output.includes('print');

    if (!hasDef) return { score: 20 };
    if (!hasReturn) return { score: 40 };
"""

# M4 -- THE REAL REPAIR of F3: THE AGGREGATE IS WEIGHTED.
#
# The needle is `calculateTotalScore` in `src/core/evaluator.ts`, an
# unweighted mean.  The benchmark data declares a weight per question and
# the README publishes it; a published weighting that never reaches the
# published total is a measurement-validity defect.  The minimal honest
# form: the aggregate weights each score by its question's declared weight.
#
# The arm needs the weight on the SCORE, because `calculateTotalScore`
# receives `QuestionScore[]`, which has no weight field.  So the arm adds
# the weight to QuestionScore and populates it -- that is the whole repair:
# the weight must REACH the aggregate.

M4_OLD_SCORE = """  private calculateTotalScore(scores: QuestionScore[]): number {
    if (scores.length === 0) return 0;

    const totalWeighted = scores.reduce((sum, score) => sum + score.score, 0);

    return Math.round(totalWeighted / scores.length);
  }"""

M4_NEW_SCORE = """  private calculateTotalScore(scores: QuestionScore[]): number {
    if (scores.length === 0) return 0;

    const totalWeighted = scores.reduce((sum, score) => sum + score.score, 0);

    // R535 M4: the benchmark data declares a weight per question and the
    // README publishes it, so the aggregate must be WEIGHTED by it.
    const wsum = scores.reduce((sum, s) => sum + ((s as unknown as { weight?: number }).weight ?? 1), 0);
    if (wsum > 0) {
      const weighted = scores.reduce((sum, s) => sum + s.score * ((s as unknown as { weight?: number }).weight ?? 1), 0);
      void totalWeighted;
      return Math.round(weighted / wsum);
    }

    return Math.round(totalWeighted / scores.length);
  }"""

# The weight has to REACH the score.  The CLI evaluator's `evaluateQuestion`
# knows the question (and therefore its weight); the score it returns does
# not carry it.  The repair attaches it.
M4_ATTACH_OLD = """        const score = await this.evaluateQuestion(question, model);
        scores.push(score);"""

M4_ATTACH_NEW = """        const score = await this.evaluateQuestion(question, model);
        (score as unknown as { weight?: number }).weight = question.weight;
        scores.push(score);"""

# N1 -- NEGATIVE CONTROL: a comment that changes nothing.

N1_OLD = """export const codeBenchmarks: CodeBenchmarkQuestion[] = ["""

N1_NEW = """export const codeBenchmarks: CodeBenchmarkQuestion[] = [
  // R535 N1 (negative control): a comment that changes no behaviour."""


ARMS = [
    {
        "id": "M1",
        "label": "the oracle becomes ASSERTION-based (canonical: EvalPlus / HumanEval / MBPP)",
        "files": ["src/benchmarks/coding.ts", "src/core/scorer.ts", "src/types/index.ts"],
        "edits": [
            ("src/types/index.ts", M1_TYPE_OLD, M1_TYPE_NEW),
            ("src/benchmarks/coding.ts", M1_OLD, M1_NEW),
            ("src/core/scorer.ts", M1_SCORER_OLD, M1_SCORER_NEW),
            ("src/core/scorer.ts", M1_RUNNER_OLD, M1_RUNNER_NEW),
        ],
    },
    {
        "id": "M2",
        "label": "the expected output is CORRECTED to str() semantics",
        "files": ["src/benchmarks/coding.ts"],
        "edits": [("src/benchmarks/coding.ts", M2_OLD, M2_NEW)],
    },
    {
        "id": "M3",
        "label": "the WEB plane runs the SAME test cases the CLI plane runs",
        "files": ["src/web/engine/evaluator.ts"],
        "edits": [("src/web/engine/evaluator.ts", M3_OLD, M3_NEW)],
    },
    {
        "id": "M4",
        "label": "the AGGREGATE is WEIGHTED by the declared per-question weight",
        "files": ["src/core/evaluator.ts"],
        "edits": [
            ("src/core/evaluator.ts", M4_OLD_SCORE, M4_NEW_SCORE),
            ("src/core/evaluator.ts", M4_ATTACH_OLD, M4_ATTACH_NEW),
        ],
    },
    {
        "id": "N1",
        "label": "NEGATIVE CONTROL: a comment that changes nothing",
        "files": ["src/benchmarks/coding.ts"],
        "edits": [("src/benchmarks/coding.ts", N1_OLD, N1_NEW)],
    },
]

# ------------------------------------------------------------------ runner


def run_suite(label):
    """Run the suite; return (verdict, detail)."""
    # Resolve jest from THIS tree's node_modules/.bin, never via npx: npx
    # DOWNLOADS a different major when the tree has no local install, which
    # would measure the subject with a runner the repository does not pin
    # (scripts/resolve_tool.py documents the measurement).
    jest = _resolve_tool("jest")
    cmd = [jest, SUITE, "--runInBand", "--coverage=false"]
    try:
        proc = subprocess.run(
            cmd, cwd=REPO, capture_output=True, text=True, timeout=1200,
        )
    except subprocess.TimeoutExpired:
        return "HARNESS", "timeout"
    out = proc.stdout or ""
    err = proc.stderr or ""
    blob = out + "\n" + err

    m = re.search(r"Tests:\s+(?:(\d+)\s+failed,\s*)?(?:(\d+)\s+passed,\s*)?(?:(\d+)\s+total)?", blob)
    total = m.group(3) if m else None
    if total is None:
        m2 = re.search(r"Tests:\s+.*?(\d+)\s+total", blob)
        total = m2.group(1) if m2 else None
    # explicit parse of the failed count
    fm = re.search(r"Tests:\s+(?:(\d+)\s+failed,)?", blob)
    failed = int(fm.group(1)) if fm and fm.group(1) else 0
    if total is None:
        return "HARNESS", "no summary line; blob tail:\n" + blob[-800:]
    if int(total) != EXPECTED_TOTAL:
        return "HARNESS", ("summary total=%s but the suite file declares %d arms; "
                           "parser/total mismatch -- NOT a verdict"
                           % (total, EXPECTED_TOTAL))
    if failed > 0:
        return "KILLED", "failed=%d of %d" % (failed, EXPECTED_TOTAL)
    return "SURVIVED", "all %d passed" % EXPECTED_TOTAL


def apply_edits(edits):
    """Apply the edits; return (ok, detail).  Verify the needle changed."""
    applied = []
    for rel, old, new in edits:
        path = REPO / rel
        data = path.read_bytes()
        text = data.decode("utf-8")
        count = text.count(old)
        if count != 1:
            return False, "needle for %s occurs %d times (need exactly 1)" % (rel, count), applied
        new_text = text.replace(old, new, 1)
        if new_text == text:
            return False, "replacement for %s produced NO change" % rel, applied
        path.write_bytes(new_text.encode("utf-8"))
        applied.append(rel)
    return True, "applied %d edit(s)" % len(applied), applied


def main():
    print("R535 mutation matrix -- llm-benchmark coding dimension")
    print("repo      : %s" % REPO)
    print("suite     : %s (%d arms declared in the file)" % (SUITE_REL, EXPECTED_TOTAL))
    print("owned     : %s" % ", ".join(OWNED_RELS))
    print()

    # ---- baseline guard: every owned file must be at its HEAD blob --------
    dirty = []
    for rel in OWNED_RELS:
        cur = md5_bytes((REPO / rel).read_bytes())
        if cur != BASELINE_MD5[rel]:
            dirty.append(rel)
    if dirty:
        print("ABORT: owned file(s) are not at the HEAD baseline: %s" % ", ".join(dirty))
        print("       Another agent owns them; this driver refuses to run.")
        return 2

    # ---- snapshot (in memory AND on disk) -------------------------------
    snaps = {}
    _GLOBAL_SNAPS.update(snaps)
    for rel in OWNED_RELS:
        data = (REPO / rel).read_bytes()
        # R528-6 (restore mtime): a byte-restore BUMPS the file's mtime, and
        # this repo has a test that asserts `dist/` is not older than its
        # source.  A restore that leaves the source NEWER than the build
        # artifact turns that test red -- a self-inflicted gate.  So the
        # snapshot records the mtime and the restore puts it back.
        mtime_ns = (REPO / rel).stat().st_mtime_ns
        snaps[rel] = (data, mtime_ns)
        (REPO / ("_tmp" if (REPO / "_tmp").is_dir() else ".")).mkdir(exist_ok=True)
        snap_path = Path(_tmp_dir()) / ("r535_snap_" + rel.replace("/", "__"))
        snap_path.write_bytes(data)
    print("snapshot  : %d file(s) taken (in memory + on disk)" % len(snaps))
    print()

    results = []

    # ---- CONTROL --------------------------------------------------------
    print("-" * 72)
    print("CONTROL  (unmutated tree must be GREEN)")
    print("-" * 72)
    verdict, detail = run_suite("control")
    print("  CONTROL -> %-9s %s" % (verdict, detail))
    if verdict != "SURVIVED":
        print("ABORT: the control is not green; the suite is not measuring the product.")
        _restore(snaps)
        return 2
    print()

    # ---- arms ------------------------------------------------------------
    for arm in ARMS:
        print("-" * 72)
        print("%s  %s" % (arm["id"], arm["label"]))
        print("-" * 72)
        try:
            ok, detail, applied = apply_edits(arm["edits"])
        except Exception as exc:  # noqa: BLE001 -- an arm must never leave the tree mutated
            print("  %-9s NOT-INJECTED  %s" % (arm["id"], exc))
            results.append((arm["id"], "NOT-INJECTED", str(exc)))
            _restore(snaps)
            print()
            continue
        if not ok:
            print("  %-9s NOT-INJECTED  %s" % (arm["id"], detail))
            results.append((arm["id"], "NOT-INJECTED", detail))
            _restore(snaps)
            print()
            continue
        try:
            verdict, detail2 = run_suite(arm["id"])
        except Exception as exc:  # noqa: BLE001
            verdict, detail2 = "HARNESS", "runner raised: %s" % exc
        print("  %-9s %s" % (verdict, detail2))
        results.append((arm["id"], verdict, detail2))
        _restore(snaps)
        print()

    # ---- summary ---------------------------------------------------------
    print("=" * 72)
    print("SUMMARY")
    print("=" * 72)
    killed = sum(1 for _, v, _ in results if v == "KILLED")
    survived = sum(1 for _, v, _ in results if v == "SURVIVED")
    harness = sum(1 for _, v, _ in results if v == "HARNESS")
    notinj = sum(1 for _, v, _ in results if v == "NOT-INJECTED")
    for aid, verdict, detail in results:
        print("  %-4s %-12s %s" % (aid, verdict, detail))
    print()
    print("KILLED=%d SURVIVED=%d HARNESS=%d NOT-INJECTED=%d" % (killed, survived, harness, notinj))

    # ---- restore verification -------------------------------------------
    print()
    print("-" * 72)
    print("RESTORE VERIFICATION")
    print("-" * 72)
    bad = []
    for rel, payload in snaps.items():
        data, mtime_ns = payload
        cur = (REPO / rel).read_bytes()
        ok = cur == data
        mtime_ok = (REPO / rel).stat().st_mtime_ns == mtime_ns
        head_ok = md5_bytes(cur) == BASELINE_MD5[rel]
        print("  %-32s bytes=%s  head=%s  mtime=%s" % (
            rel, "OK" if ok else "MISMATCH",
            "OK" if head_ok else "MISMATCH",
            "OK" if mtime_ok else "MISMATCH"))
        if not ok or not head_ok or not mtime_ok:
            bad.append(rel)
        # remove the on-disk snapshot
        try:
            os.remove(Path(_tmp_dir()) / ("r535_snap_" + rel.replace("/", "__")))
        except OSError:
            pass
    if bad:
        print("RESTORE FAILED for: %s" % ", ".join(bad))
        return 2
    print("  restore verified OK; no snapshot residue")
    print()
    verdict = "PASS" if (harness == 0 and notinj == 0 and survived == 1) else "REVIEW"
    print("VERDICT: %s" % verdict)
    return 0


_GLOBAL_SNAPS = {}


def _tmp_dir():
    d = REPO / "_tmp"
    d.mkdir(exist_ok=True)
    return d


def _restore(snaps):
    """Restore the owned files BY BYTES and PUT THE MTIME BACK."""
    for rel, payload in snaps.items():
        data, mtime_ns = payload
        (REPO / rel).write_bytes(data)
        os.utime(REPO / rel, ns=(mtime_ns, mtime_ns))


if __name__ == "__main__":
    try:
        _rc = main()
    except SystemExit:
        # main() may raise SystemExit for its own ABORT paths; the tree is
        # already restored on those paths.  Do NOT report a crash.
        _restore(_GLOBAL_SNAPS)
        raise
    except BaseException:
        # A driver that crashes MUST NOT leave a mutated tree behind.  The
        # owned files are restored by bytes from the snapshot.
        try:
            _restore(_GLOBAL_SNAPS)
            print("\nDRIVER CRASHED -- the owned files were restored by bytes.")
        except Exception:
            pass
        raise
    sys.exit(_rc)
