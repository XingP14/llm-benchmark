#!/usr/bin/env python3
"""
R537 mutation matrix (llm-benchmark) -- the EXTERNAL-BENCHMARK plane: a
score that reaches the report's own data array but moves NONE of the
report's numbers.

Discipline carried from R473 / R486 / R487 / R497 / R507 / R511 / R513 /
R514 / R517 / R518 / R519 / R522 / R526 / R528 / R531 / R532 / R533 / R535:

  * control FIRST: the suite must be green before any mutation;
  * declare OWNED files, assert each is at a PINNED BASELINE before injecting
    -- a dirty owned file means somebody else owns it;
  * snapshot BEFORE any injection, restore BY BYTES (never `git checkout` --
    R446-1: `git checkout` destroys other agents' uncommitted work), and
    restore the mtime too (R528-6: a byte-restore BUMPS the mtime, and this
    repo has a test that asserts `dist/` is not older than its source);
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

  * OpenAI Evals (openai/evals) -- a registered `Eval` contributes to the
    run's aggregate view; an eval that is fetched but does not appear in the
    results table is a WIRING BUG, and the framework's own contract is that
    the run's `results` and the run's summary are the SAME set.
  * lm-evaluation-harness (EleutherAI/lm-evaluation-harness) -- each `task`
    contributes its metric to the run's `results` dict, and the harness's
    `make_table` renders the UNION of what was run.  A task whose metric is
    computed but never rendered is a silent drop.
  * HELM (stanford-crfm/helm) -- a `Scenario` produces a `Metric`; the `Run`
    object aggregates metrics ACROSS scenarios, and the leaderboard reads
    that aggregate.  The aggregation is a property of the RUN, not of the
    per-scenario computation.
  * promptfoo (promptfoo/promptfoo) -- providers and assertions are folded
    into ONE evaluation row set, and the summary table reads that row set.

  M1  THE REAL REPAIR of F1: THE AGGREGATES ARE RECOMPUTED AFTER THE
      DISPATCH.  This is the HELM shape: the aggregate is a property of the
      RUN, and the run is finished only when every scenario has contributed.
      The minimal honest form this arm can inject: `run()` recomputes
      `totalScore` and `dimensions` from the FINAL `scores[]` after every
      `dispatchExternalCall` has resolved.
      MUST KILL -- if it survived, the suite's "the external score is
      appended after the aggregates are computed" claim would be about the
      wrong mechanism.

  M2  THE REAL REPAIR of F1 (the OTHER shape): THE DISPATCH HAPPENS
      BEFORE THE AGGREGATE IS COMPUTED.  This is the OpenAI-Evals shape: the
      external evaluation is part of the evaluation, so it must be part of
      the score set that the aggregate is computed from.  The minimal honest
      form: `evaluateModel` runs the dispatch itself, before it computes
      `totalScore` / `dimensions`.
      MUST KILL -- if it survived, the suite's claim would be about the
      wrong mechanism again (a single repair shape would suffice, and M1
      would be redundant).

  M3  THE REAL REPAIR of F2: `safety` BECOMES A PUBLISHED DIMENSION.
      The lm-evaluation-harness shape: the summary table renders the UNION
      of what was measured, so a dimension that the harness produces a score
      for has a column.  The minimal honest form: `DimensionScore` gains a
      `safety` entry, `calculateDimensions` fills it, and `DIM_HEADERS`
      gains the sixth column.
      MUST KILL -- if it survived, the suite's "the safety dimension has
      nowhere to go" claim would be about the wrong mechanism.

  M4  THE REAL REPAIR of F3: THE PUBLISHED QUESTION COUNT COUNTS
      QUESTIONS.  The promptfoo shape: the summary's row count is the count
      of the things that were evaluated, and an external benchmark is a
      benchmark, not a question.  The minimal honest form: the reporter
      counts only the scores that came from a QUESTION.
      MUST KILL -- if it survived, the suite's "the question count counts
      benchmarks, not questions" claim would be about the wrong mechanism.

  N1  NEGATIVE CONTROL: a comment that changes nothing.  MUST SURVIVE.  Its
      purpose is to prove the driver is capable of reporting a survivor --
      a driver where every arm reads KILLED is not measuring anything.

The owned files are `src/core/evaluator.ts` (the dispatch + the
aggregation), `src/core/reporter.ts` (the published report) and
`src/types/index.ts` (the dimension schema).  All three are snapshotted
before injection and restored BY BYTES; the restore is verified against the
repository's HEAD blob, so a failed restore cannot go unnoticed.
"""

import hashlib
import os
import re
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

SUITE_REL = "tests/r537-external-benchmark-plane.test.ts"
SUITE = SUITE_REL

# The production files the arms may edit.  Each is snapshotted and restored.
OWNED_RELS = [
    "src/core/evaluator.ts",
    "src/core/reporter.ts",
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

# M1 -- THE REAL REPAIR of F1: RECOMPUTE THE AGGREGATES AFTER THE DISPATCH.
#
# The needle is the tail of `Evaluator.run()`: the `return results;` that
# closes the method, which follows every `dispatchExternalCall`.  The repair
# inserts a recompute between the last dispatch and the return.
#
# This is the HELM shape: the aggregate is a property of the RUN, and the
# run is not finished until every scenario has contributed.

M1_TAIL_OLD = """    return results;
  }

  /**
   * v0.5.0 dispatch: cyberseceval3 真实 fetch"""

M1_TAIL_NEW = """    // R537 M1 (final): recompute AFTER every dispatch has resolved.
    for (const result of results) {
      result.totalScore = this.calculateTotalScore(result.scores);
      result.dimensions = this.calculateDimensions(result.scores);
    }

    return results;
  }

  /**
   * v0.5.0 dispatch: cyberseceval3 真实 fetch"""


# M2 -- THE REAL REPAIR of F1 (the OTHER shape): THE DISPATCH HAPPENS
# BEFORE THE AGGREGATE IS COMPUTED.
#
# The OpenAI-Evals shape: the external evaluation is part of the
# evaluation, so it must be part of the score set the aggregate is
# computed from.  The needle is `evaluateModel`, which computes the
# aggregate and returns.  The repair moves the dispatch INSIDE it, before
# the aggregate is computed.
#
# This needs the dispatch to run against a single result, so the arm
# passes `[result]` rather than the whole `results` array.  The dispatch
# helper's signature takes `EvaluationResult[]`, so this is a minimal,
# honest, type-correct change.

M2_OLD = """    const totalScore = this.calculateTotalScore(scores);
    const dimensions = this.calculateDimensions(scores);"""

M2_NEW = """    // R537 M2: the external evaluation is part of the evaluation, so it
    // must be part of the score set the aggregate is computed from
    // (OpenAI Evals).
    const pending: EvaluationResult[] = [{
      modelName: model.name,
      model,
      scores,
      totalScore: 0,
      dimensions: {} as DimensionScore,
      timestamp: new Date(),
      duration: 0,
    }];
    await this.dispatchAllExternal(pending);

    const totalScore = this.calculateTotalScore(scores);
    const dimensions = this.calculateDimensions(scores);"""

# The `dispatchAllExternal` helper M2 needs.  It is a thin wrapper that
# calls each dispatch site with the pending result array.

M2_HELPER_OLD = """  private async dispatchV050External(
    results: EvaluationResult[],"""

M2_HELPER_NEW = """  /**
   * R537 M2: run every external dispatch against a pending result, BEFORE
   * the aggregate is computed (OpenAI Evals shape).
   */
  private async dispatchAllExternal(results: EvaluationResult[]): Promise<void> {
    await this.dispatchExternalCall(
      results, 'webdev_arena',
      (apiBase, model, timeoutMs, dispatchType) => this.fetchWebdevArenaScore(apiBase, model, timeoutMs, this.config._external_benchmarks_roadmap!.webdev_arena!.anchor_score, dispatchType),
    );
    await this.dispatchExternalCall(
      results, 'cyberseceval3',
      (apiBase, model, timeoutMs, dispatchType) => {
        const cse3 = this.config._external_benchmarks_roadmap!.cyberseceval3!;
        const cats = cse3.risk_categories?.join(',') ?? 'all-8';
        return this.fetchCyberseceval3Score(apiBase, model, timeoutMs, cats, dispatchType);
      },
    );
  }

  private async dispatchV050External(
    results: EvaluationResult[],"""


# M3 -- THE REAL REPAIR of F2: `safety` BECOMES A PUBLISHED DIMENSION.
#
# The lm-evaluation-harness shape: the summary table renders the UNION of
# what was measured, so a dimension the harness produces a score for has a
# column.  Three files change: the schema, the aggregation, and the
# report's column set.

M3_TYPES_OLD = """  /** v0.4.0+ 新增：多轮对话一致性评分汇总（可选，启用 multi_turn 评测时存在） */
  multi_turn?: {
    total: number;
    count: number;
    average: number;
    details: Record<string, number>;
    /** v0.6.0+ (optional) bootstrap 95% CI over per-question scores (via bootstrap95CI helper in core/evaluator.ts); absent when 0 scores */
    ci?: { mean: number; std: number; ciLower: number; ciUpper: number; n: number; nResamples: number };
  };
}"""

M3_TYPES_NEW = """  /** v0.4.0+ 新增：多轮对话一致性评分汇总（可选，启用 multi_turn 评测时存在） */
  multi_turn?: {
    total: number;
    count: number;
    average: number;
    details: Record<string, number>;
    /** v0.6.0+ (optional) bootstrap 95% CI over per-question scores (via bootstrap95CI helper in core/evaluator.ts); absent when 0 scores */
    ci?: { mean: number; std: number; ciLower: number; ciUpper: number; n: number; nResamples: number };
  };
  /** R537 M3: 安全评测维度汇总 (cyberseceval3) */
  safety?: {
    total: number;
    count: number;
    average: number;
    details: Record<string, number>;
    /** v0.6.0+ (optional) bootstrap 95% CI over per-question scores */
    ci?: { mean: number; std: number; ciLower: number; ciUpper: number; n: number; nResamples: number };
  };
}"""

M3_CALC_OLD = """      multi_turn: this.buildDimEntry(dimScores('multi_turn')),
    };
  }"""

M3_CALC_NEW = """      multi_turn: this.buildDimEntry(dimScores('multi_turn')),
      safety: this.buildDimEntry(dimScores('safety')),
    };
  }"""

M3_HEADERS_OLD = """  { key: 'multi_turn', label: '多轮对话', cn: '多轮对话' },
];"""

M3_HEADERS_NEW = """  { key: 'multi_turn', label: '多轮对话', cn: '多轮对话' },
  { key: 'safety', label: '安全能力', cn: '安全' },
];"""


# M4 -- THE REAL REPAIR of F3: THE PUBLISHED QUESTION COUNT COUNTS
# QUESTIONS.
#
# The promptfoo shape: the summary's row count is the count of the things
# that were evaluated, and an external benchmark is a benchmark, not a
# question.  The reporter counts only the scores that came from a question.
#
# An external score is recognisable: it carries a `dispatchType` (set by
# every fetcher) and its questionId has the form `<benchmark>_<model>`.
# The repair counts the scores that do NOT carry a dispatchType.

M4_STATS_OLD = """        totalQuestions: results.length > 0 ? results[0].scores.length : 0,"""

M4_STATS_NEW = """        totalQuestions: results.length > 0 ? countQuestions(results[0].scores) : 0,"""

M4_MD_OLD = """    md += `**总评测题数**: ${results[0]?.scores.length || 0}\\n\\n`;"""

M4_MD_NEW = """    md += `**总评测题数**: ${results[0] ? countQuestions(results[0].scores) : 0}\\n\\n`;"""

M4_CSV_OLD = """        r.scores.length,
      ];"""

M4_CSV_NEW = """        countQuestions(r.scores),
      ];"""

M4_HELPER_OLD = """export const DIM_HEADERS: ReadonlyArray<DimHeader> = ["""

M4_HELPER_NEW = """/**
 * R537 M4: count the QUESTIONS, not the external benchmark scores.
 * An external score carries a `dispatchType`; a question score does not.
 */
export function countQuestions(scores: QuestionScore[] | undefined): number {
  return (scores ?? []).filter((s) => s.dispatchType === undefined).length;
}

export const DIM_HEADERS: ReadonlyArray<DimHeader> = ["""


# N1 -- NEGATIVE CONTROL: a comment that changes nothing.

N1_OLD = """export const DIM_HEADERS: ReadonlyArray<DimHeader> = ["""

N1_NEW = """export const DIM_HEADERS: ReadonlyArray<DimHeader> = [
  // R537 N1 (negative control): a comment that changes no behaviour."""


ARMS = [
    {
        "id": "M1",
        "label": "the AGGREGATES are RECOMPUTED after the dispatch (canonical: HELM run-level aggregate)",
        "files": ["src/core/evaluator.ts"],
        "edits": [
            ("src/core/evaluator.ts", M1_TAIL_OLD, M1_TAIL_NEW),
        ],
    },
    {
        "id": "M2",
        "label": "the DISPATCH happens BEFORE the aggregate is computed (canonical: OpenAI Evals)",
        "files": ["src/core/evaluator.ts"],
        "edits": [
            ("src/core/evaluator.ts", M2_OLD, M2_NEW),
            ("src/core/evaluator.ts", M2_HELPER_OLD, M2_HELPER_NEW),
        ],
    },
    {
        "id": "M3",
        "label": "the `safety` dimension BECOMES a published dimension (canonical: lm-eval-harness union table)",
        "files": ["src/core/evaluator.ts", "src/core/reporter.ts", "src/types/index.ts"],
        "edits": [
            ("src/core/evaluator.ts", M3_CALC_OLD, M3_CALC_NEW),
            ("src/core/reporter.ts", M3_HEADERS_OLD, M3_HEADERS_NEW),
            ("src/types/index.ts", M3_TYPES_OLD, M3_TYPES_NEW),
        ],
    },
    {
        "id": "M4",
        "label": "the published QUESTION COUNT counts questions, not benchmarks (canonical: promptfoo row set)",
        "files": ["src/core/reporter.ts"],
        "edits": [
            ("src/core/reporter.ts", M4_STATS_OLD, M4_STATS_NEW),
            ("src/core/reporter.ts", M4_MD_OLD, M4_MD_NEW),
            ("src/core/reporter.ts", M4_CSV_OLD, M4_CSV_NEW),
            ("src/core/reporter.ts", M4_HELPER_OLD, M4_HELPER_NEW),
        ],
    },
    {
        "id": "N1",
        "label": "NEGATIVE CONTROL: a comment that changes nothing",
        "files": ["src/core/reporter.ts"],
        "edits": [("src/core/reporter.ts", N1_OLD, N1_NEW)],
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
    """Apply the edits; return (ok, detail, applied).  Verify the needle changed."""
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


def _tmp_dir():
    d = REPO / "_tmp"
    if not d.is_dir():
        d.mkdir(exist_ok=True)
    return d


def _restore(snaps):
    for rel, (data, mtime_ns) in snaps.items():
        path = REPO / rel
        if path.exists():
            path.write_bytes(data)
            try:
                os.utime(path, ns=(mtime_ns, mtime_ns))
            except OSError:
                pass


def main():
    print("R537 mutation matrix -- llm-benchmark external-benchmark plane")
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
    for rel in OWNED_RELS:
        data = (REPO / rel).read_bytes()
        # R528-6 (restore mtime): a byte-restore BUMPS the file's mtime, and
        # this repo has a test that asserts `dist/` is not older than its
        # source.  A restore that leaves the source NEWER than the build
        # artifact turns that test red -- a self-inflicted gate.  So the
        # snapshot records the mtime and the restore puts it back.
        mtime_ns = (REPO / rel).stat().st_mtime_ns
        snaps[rel] = (data, mtime_ns)
        snap_path = Path(_tmp_dir()) / ("r537_snap_" + rel.replace("/", "__"))
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
        try:
            os.remove(Path(_tmp_dir()) / ("r537_snap_" + rel.replace("/", "__")))
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


if __name__ == "__main__":
    sys.exit(main())
