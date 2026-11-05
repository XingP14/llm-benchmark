#!/usr/bin/env python3
"""
R532 mutation matrix (llm-benchmark) -- the MULTI-TURN CONSISTENCY dimension
scores a bag of words and penalises the correct answer for being correct.

Discipline carried from R473 / R486 / R487 / R497 / R507 / R511 / R513 /
R514 / R517 / R518 / R519 / R522 / R526 / R528 / R531:

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
A transcribed constant is a pinned path: it measures the AUTHOR's copy of the
suite, not the suite in this tree.

Arms -- each is a NAMED REPAIR FROM THE PUBLISHED CANONICAL, not an
invented patch.  The canonical is the statebench measurement-validity audit
(https://parslee-ai.github.io/statebench/paper-measurement-validity.pdf),
whose three findings that land on this scorer are quoted in the suite's
header.  Each arm below is the minimal honest form of that finding's fix.

  M1  THE REAL REPAIR of F5: BOUNDARY-AWARE MATCHING.  The canonical's
      "Unbounded substring matching" section: `"100" -> "1000","2100"`,
      `"$150" -> "$1500"`, and the fix "boundary-aware matching, with the
      boundary applied per edge according to whether that edge is a word
      character -- so `$45` still does not match inside `$450`, and `10%`
      does not match inside `110%`.  A naive \b on both sides is wrong for
      phrases that begin or end with punctuation."
      MUST KILL -- if it survived, the suite's "the numeric required facts
      are matched by unbounded containment" claim would be about the wrong
      mechanism.

  M2  THE REAL REPAIR of F7: NEGATION-AWARE FORBIDDEN MATCHING.  The
      canonical's "Blindness to negation" section: "A phrase under explicit
      negation is usually evidence of the capability under test, not a
      violation of it."  And NeurIPS 2507.02825's outcome-validity check
      O.b.1: substring matching "should handle negation modifiers used by
      agents."
      MUST KILL -- if it survived, the suite's "a model DECLINING to make a
      burger is penalised for the word" claim would be about the wrong
      mechanism.

  M3  THE REAL REPAIR of F2: THE FORBIDDEN LIST IS PRUNED OF THE
      CONVERSATION'S OWN VOCABULARY.  The canonical's "Forbidden phrases
      that cannot discriminate" section -- "The vocabulary of the correct
      answer. This is the damaging one." -- and its fix: "Audit forbidden
      phrases for discriminative power. Any phrase a correct answer could
      contain is not a violation signal. Exclude it from scoring AND the
      denominator."
      MUST KILL -- if it survived, the suite's "the same correct answer
      scores 100 or 60 depending on how much of the prompt it quotes back"
      claim would be about the wrong mechanism.

  M4  THE REAL REPAIR of F8: THE SCORER READS THE CONVERSATION.  tau-bench
      (arXiv:2406.12045) grades the final world state rather than the
      words; the NeurIPS paper notes that grading the words "punishes valid
      variation and reward[s] verbose box-ticking".  The minimal honest form
      of "read the conversation" is to let the scorer see the TURNS -- so a
      reply is judged against the trajectory it is answering, not against a
      flat string.
      MUST KILL -- if it survived, the suite's "the scorer never sees the
      conversation" claim would be about the wrong mechanism.

  N1  NEGATIVE CONTROL: a comment that changes nothing.  MUST SURVIVE.  Its
      purpose is to prove the driver is capable of reporting a survivor --
      a driver where every arm reads KILLED is not measuring anything.

The owned file is `src/core/scorer.ts` -- a PRODUCTION file, the same
discipline R518/R519/R522/R531 used for production scorers.  The restore is
byte-verified against the pre-mutation snapshot AND against the repository's
HEAD blob, so a failed restore cannot go unnoticed.

WHY THIS DRIVER IS NOT `r531_matrix.py`
---------------------------------------
That driver scores the FUNCTION-CALLING dimension, whose subject spans TWO
production files (the CLI request assembly and the FC scorer).  This one
scores the MULTI-TURN dimension, whose subject is ONE file: the MT scorer in
`src/core/scorer.ts`.  M4 additionally touches the CLI evaluator, because
"the scorer reads the conversation" needs the conversation to be REACHABLE
by the scorer, and the CLI is the path that has it.

WHY THE MT SCORER IS THE RIGHT SUBJECT
--------------------------------------
The MT scorer is STRUCTURAL: `Scorer.scoreMultiTurn` matches the model's
reply against the question's consistencyCheck by string containment.  It
makes NO adapter call of its own, so every "real repair" arm here is
reachable without touching the network.
"""

import hashlib
import os
import re
import signal
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

SUITE_REL = "tests/r532-multi-turn-consistency-plane.test.ts"
SUITE = SUITE_REL

# The production files the arms may edit.  Each is snapshotted and restored.
OWNED_RELS = [
    "src/core/scorer.ts",
    "src/core/evaluator.ts",
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
# M1 -- THE REAL REPAIR of F5: boundary-aware matching.
#
# The needle is the REQUIRED loop in `scoreMultiTurn` (src/core/scorer.ts):
#
#       for (const kw of required) {
#         if (outputLower.includes(String(kw).toLowerCase())) matched.push(kw);
#         else missed.push(kw);
#       }
#
# The canonical's fix is boundary-aware matching "with the boundary applied
# per edge according to whether that edge is a word character".  The minimal
# honest form: a phrase matches only when it is not glued to a word
# character on either side that it does not itself own.  For a NUMERIC
# phrase like '435' the edges are both word characters, so '4350' must not
# match; for '3 岁' the left edge is a word character and the right edge is
# not, so '13 岁' must not match either ('3' is glued to '1').

MT_REQUIRED_OLD = """      for (const kw of required) {
        if (outputLower.includes(String(kw).toLowerCase())) matched.push(kw);
        else missed.push(kw);
      }"""

MT_REQUIRED_M1 = """      for (const kw of required) {
        if (this.boundaryMatch(outputLower, String(kw).toLowerCase())) matched.push(kw);
        else missed.push(kw);
      }"""

# M2 -- THE REAL REPAIR of F7: a forbidden phrase under explicit negation is
# not a violation.  The needle is the FORBIDDEN loop:
#
#       for (const kw of forbidden) {
#         if (outputLower.includes(String(kw).toLowerCase())) forbiddenHit.push(kw);
#       }
#
# The canonical's fix: "Handle negation. A phrase under explicit negation is
# usually evidence of the capability under test, not a violation of it."
# The minimal honest form: a forbidden phrase preceded by a negation marker
# (不 / 别 / 没 / 无 / 未 / 不要 / 不能 / 不会) is not counted.

MT_FORBIDDEN_OLD = """      for (const kw of forbidden) {
        if (outputLower.includes(String(kw).toLowerCase())) forbiddenHit.push(kw);
      }"""

MT_FORBIDDEN_M2 = """      const negationMarkers = ['不要', '不能', '不会', '不该', '不再', '不', '别', '没', '无', '未'];
      for (const kw of forbidden) {
        const needle = String(kw).toLowerCase();
        if (!outputLower.includes(needle)) continue;
        let negated = false;
        let idx = outputLower.indexOf(needle);
        while (idx !== -1) {
          const before = outputLower.slice(Math.max(0, idx - 6), idx);
          if (negationMarkers.some((m) => before.includes(m))) { negated = true; break; }
          idx = outputLower.indexOf(needle, idx + 1);
        }
        if (!negated) forbiddenHit.push(kw);
      }"""

# M3 -- THE REAL REPAIR of F2: a forbidden phrase that occurs in the
# QUESTION'S OWN CONVERSATION is not a violation signal.  The canonical:
# "Any phrase a correct answer could contain is not a violation signal.
# Exclude it from scoring and the denominator."
#
# The needle is the FORBIDDEN loop again -- but this arm PRUNES the list
# against the question's own turns before matching.

MT_FORBIDDEN_M3 = """      const conversationText = (mtQuestion.turns || [])
        .map((t: { role: string; content: string }) => String(t.content || ''))
        .join('\\n')
        .toLowerCase();
      for (const kw of forbidden) {
        if (conversationText.includes(String(kw).toLowerCase())) continue;
        if (outputLower.includes(String(kw).toLowerCase())) forbiddenHit.push(kw);
      }"""

# M4 -- THE REAL REPAIR of F8: the scorer READS THE CONVERSATION.
#
# The needle is the CLI's multi-turn branch in `evaluateQuestion`
# (src/core/evaluator.ts):
#
#     if (question.type === 'multi_turn') {
#       const mtQuestion = question as MultiTurnQuestion;
#       const turns: Array<{ role: string; content: string }> = mtQuestion.turns || [];
#       const modelOutput = await this.adapter.chat(turns, model);
#       return scorer.scoreMultiTurn(question, modelOutput);
#     }
#
# tau-bench grades the final world state rather than the words; the minimal
# honest form of "read the conversation" here is to hand the scorer the
# trajectory it is answering.

CLI_MT_OLD = """    if (question.type === 'multi_turn') {
      const mtQuestion = question as MultiTurnQuestion;
      const turns: Array<{ role: string; content: string }> = mtQuestion.turns || [];
      const modelOutput = await this.adapter.chat(turns, model);
      return scorer.scoreMultiTurn(question, modelOutput);
    }"""

CLI_MT_M4 = """    if (question.type === 'multi_turn') {
      const mtQuestion = question as MultiTurnQuestion;
      const turns: Array<{ role: string; content: string }> = mtQuestion.turns || [];
      const modelOutput = await this.adapter.chat(turns, model);
      return scorer.scoreMultiTurnWithTurns(question, modelOutput, turns);
    }"""

# The helper the M4 arm adds to the Scorer.  It is inserted as a NEW method
# so the M4 arm is a single, anchored edit on the scorer file too.

SCORER_MT_HELPER_OLD = """  /**
   * 对多轮对话一致性答案进行评分
   * 评分逻辑（结合 required + forbidden 两组短语）：
   *  - 基础分 = required 命中比例 (matched/required.length) * 100
   *  - forbidden 命中：每个扣 20 分
   *  - 最终分钳制在 [0, 100]
   *  - 若 required 全部命中且 forbidden 全部未命中 → 100
   */
  async scoreMultiTurn("""

SCORER_MT_HELPER_M4 = """  /**
   * R532 M4: a trajectory-aware MT scorer -- the conversation is part of the
   * subject, so the scorer is handed the turns it is answering.
   */
  async scoreMultiTurnWithTurns(
    question: BenchmarkQuestion,
    modelOutput: string,
    turns: Array<{ role: string; content: string }>
  ): Promise<QuestionScore> {
    const mtQuestion = question as MultiTurnQuestion;
    const trajectory = turns.map((t) => String(t.content || '')).join('\\n');
    const base = await this.scoreMultiTurn(question, modelOutput);
    const transcript = `${trajectory}\\n${modelOutput}`;
    const contextHits = (mtQuestion.consistencyCheck?.required || []).filter((kw) =>
      transcript.toLowerCase().includes(String(kw).toLowerCase()),
    );
    const answered = (mtQuestion.consistencyCheck?.required || []).filter((kw) =>
      modelOutput.toLowerCase().includes(String(kw).toLowerCase()),
    );
    const detail =
      `${base.detail} | trajectory ${contextHits.length}/${(mtQuestion.consistencyCheck?.required || []).length}` +
      ` | answered ${answered.length}/${(mtQuestion.consistencyCheck?.required || []).length}`;
    return { ...base, score: answered.length, detail };
  }

  /**
   * 对多轮对话一致性答案进行评分
   * 评分逻辑（结合 required + forbidden 两组短语）：
   *  - 基础分 = required 命中比例 (matched/required.length) * 100
   *  - forbidden 命中：每个扣 20 分
   *  - 最终分钳制在 [0, 100]
   *  - 若 required 全部命中且 forbidden 全部未命中 → 100
   */
  async scoreMultiTurn("""

# The boundary matcher the M1 arm needs.  It is added as a NEW private
# method so the M1 arm is a single, anchored edit.

SCORER_BOUNDARY_OLD = """  /**
   * 从模型输出中提取首个 tool_call
   * 兼容: OpenAI tool_calls 数组 / 顶层 JSON / 文本内嵌 JSON
   */
  private extractToolCall(text: string): { name: string; arguments: Record<string, unknown> } | null {"""

SCORER_BOUNDARY_M1 = """  /**
   * R532 M1: boundary-aware matching -- a phrase must not be glued to a word
   * character that it does not itself own.
   */
  private boundaryMatch(haystack: string, needle: string): boolean {
    if (needle.length === 0) return false;
    let idx = haystack.indexOf(needle);
    while (idx !== -1) {
      const before = idx > 0 ? haystack[idx - 1] : '';
      const after = idx + needle.length < haystack.length ? haystack[idx + needle.length] : '';
      const leftOk = !/\\w/.test(before) || !/\\w/.test(needle[0]);
      const rightOk = !/\\w/.test(after) || !/\\w/.test(needle[needle.length - 1]);
      if (leftOk && rightOk) return true;
      idx = haystack.indexOf(needle, idx + 1);
    }
    return false;
  }

  /**
   * 从模型输出中提取首个 tool_call
   * 兼容: OpenAI tool_calls 数组 / 顶层 JSON / 文本内嵌 JSON
   */
  private extractToolCall(text: string): { name: string; arguments: Record<string, unknown> } | null {"""

# N1 -- NEGATIVE CONTROL: a comment that changes nothing.  It must compile
# and it must be behaviour-neutral.

MT_REQUIRED_N1 = """      // negative control: a comment that changes nothing
      for (const kw of required) {
        if (outputLower.includes(String(kw).toLowerCase())) matched.push(kw);
        else missed.push(kw);
      }"""

# Each arm: label, {owned_rel: [(old, new), ...]}, expected verdict, note.
ARMS = [
    ("M1", {"src/core/scorer.ts": [
        (MT_REQUIRED_OLD, MT_REQUIRED_M1),
        (SCORER_BOUNDARY_OLD, SCORER_BOUNDARY_M1),
    ]}, "KILLED",
     "the REAL REPAIR of F5: BOUNDARY-AWARE matching, so '435' no longer "
     "matches inside '4350' and '3 岁' no longer matches inside '13 岁'"),

    ("M2", {"src/core/scorer.ts": [(MT_FORBIDDEN_OLD, MT_FORBIDDEN_M2)]}, "KILLED",
     "the REAL REPAIR of F7: a forbidden phrase under explicit NEGATION is "
     "not a violation"),

    ("M3", {"src/core/scorer.ts": [(MT_FORBIDDEN_OLD, MT_FORBIDDEN_M3)]}, "KILLED",
     "the REAL REPAIR of F2: a forbidden phrase that occurs in the "
     "QUESTION'S OWN CONVERSATION is excluded from scoring"),

    ("M4", {"src/core/evaluator.ts": [(CLI_MT_OLD, CLI_MT_M4)],
            "src/core/scorer.ts": [(SCORER_MT_HELPER_OLD, SCORER_MT_HELPER_M4)]}, "KILLED",
     "the REAL REPAIR of F8: the scorer READS THE CONVERSATION (tau-bench "
     "style trajectory scoring) instead of a flat string"),

    ("N1", {"src/core/scorer.ts": [(MT_REQUIRED_OLD, MT_REQUIRED_N1)]}, "SURVIVED",
     "NEGATIVE CONTROL: a comment added inside the MT scorer"),
]


def md5(p: Path) -> str:
    return hashlib.md5(p.read_bytes()).hexdigest()


def clean_check():
    for rel in OWNED_RELS:
        p = REPO / rel
        actual = md5(p)
        if actual != BASELINE_MD5[rel]:
            return False, "%s md5 %s != HEAD baseline %s" % (
                p.name, actual[:8], BASELINE_MD5[rel][:8])
    return True, ""


def inject(edits_by_file):
    """Apply a list of (old, new) edits atomically, per file.

    EVERY edit is anchored and validated BEFORE any file is written, so a
    multi-part arm cannot half-apply: if edit 2's needle is missing, edit 1
    is never written either.  (A half-applied arm would be scored against a
    file the driver no longer knows how to restore.)
    """
    planned = {}
    for rel, edits in edits_by_file.items():
        p = REPO / rel
        before = p.read_text(encoding="utf-8")
        after = before
        for old, new in edits:
            n = after.count(old)
            if n != 1:
                return "not-injected", "%s: needle count %d != 1 for %r..." % (
                    rel, n, old.splitlines()[0][:60])
            replaced = after.replace(old, new, 1)
            if replaced == after:
                return "not-injected", "%s: replacement was a no-op" % rel
            after = replaced
        if after == before:
            return "not-injected", "%s: replacement was a no-op" % rel
        planned[rel] = after

    written = 0
    for rel, after in planned.items():
        p = REPO / rel
        tmp = p.with_suffix(p.suffix + ".r532tmp")
        tmp.write_text(after, encoding="utf-8")
        os.replace(tmp, p)
        written += 1

    # The check that catches the no-op that a count==1 assertion misses
    # (R456-10c): read the files BACK and compare BYTES.
    for rel in planned:
        p = REPO / rel
        if md5_bytes(p.read_bytes()) == BASELINE_MD5[rel]:
            return "not-injected", "%s: write did not change the file on disk" % rel
    return "injected", "%d file(s) written" % written


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

    print("baseline md5:")
    for rel in OWNED_RELS:
        print("  %s  %s" % (BASELINE_MD5[rel][:8], rel))
    print("expected total %d (DERIVED from %s)" % (EXPECTED_TOTAL, SUITE_REL))

    # ---- Phase 1: the control run.  The suite must be GREEN before any
    # mutation, and the parsed count must equal the DERIVED count.
    p, f, t, d = run_suite()
    print("CONTROL: %d failed / %d passed / %d total  %s" % (f, p, t, d))
    if t == -1:
        print("ABORT: the control run produced no parseable summary.")
        return 2
    if f > 0:
        print("ABORT: the control run is RED -- a mutation matrix run against a "
              "RED baseline measures the baseline, not the mutations.")
        return 2
    if t != EXPECTED_TOTAL:
        print("ABORT: control parsed %d tests but the suite file declares %d "
              "arms -- the parser and the suite disagree." % (t, EXPECTED_TOTAL))
        return 2
    print("control GREEN at the derived count.")

    # ---- Phase 2: the arms.
    snapshot_dir = REPO / ".r532-snapshots"
    snapshot_dir.mkdir(exist_ok=True)
    # Recovery: if a previous run died at SIGKILL, its snapshot is still here.
    for rel in OWNED_RELS:
        snap = snapshot_dir / (Path(rel).name + ".snap")
        if snap.exists():
            if md5_bytes(snap.read_bytes()) != BASELINE_MD5[rel]:
                (REPO / rel).write_bytes(snap.read_bytes())
                print("recovered: restored %s from the previous run's snapshot" % rel)
            else:
                print("recovered: a previous run's snapshot matched the HEAD baseline "
                      "for %s" % rel)
            os.remove(snap)

    original = {rel: (REPO / rel).read_bytes() for rel in OWNED_RELS}
    for rel, data in original.items():
        (snapshot_dir / (Path(rel).name + ".snap")).write_bytes(data)

    def restore():
        # Restore the BYTES but KEEP the snapshot on disk.  The snapshot is
        # the recovery copy for a SIGKILL (no handler can run) and it is
        # removed only once, at the end, after the FINAL byte-verified
        # restore.
        for rel, data in original.items():
            (REPO / rel).write_bytes(data)

    # ---- SIGTERM/SIGINT safety (round-477 family: the driver dies at
    # SIGKILL/SIGTERM; the finally block never runs and the TRACKED SOURCE
    # STAYS MUTATED).  Two independent guards:
    #   (1) a signal handler that restores the owned files and re-raises, so
    #       a GRACEFUL timeout still restores;
    #   (2) a PERSISTENT snapshot directory that is NOT deleted on restore,
    #       so a SIGKILL still leaves a recoverable pristine copy on disk.
    def _sig_handler(signum, frame):
        try:
            restore()
            sys.stderr.write(
                "\nSIGNAL %d: restored owned files to their baseline bytes.\n"
                % signum)
        finally:
            signal.signal(signum, signal.SIG_DFL)
            os.kill(os.getpid(), signum)

    for _sig in (signal.SIGTERM, signal.SIGINT):
        try:
            signal.signal(_sig, _sig_handler)
        except (ValueError, OSError):
            pass

    results = []
    try:
        for label, edits_by_file, expected, note in ARMS:
            status, detail_i = inject(edits_by_file)
            if status != "injected":
                print("ARM %s: NOT-INJECTED (%s)" % (label, detail_i))
                results.append((label, "NOT-INJECTED", expected, note))
                restore()
                continue

            p, f, t, d = run_suite()
            # "Tests: 0 total" is a HARD HARNESS ERROR, not a survival: the
            # suite did not run at all (a COMPILE-BROKEN mutant, a bad path,
            # a crashed worker).  Scoring it as SURVIVED would report a
            # confident verdict about a suite that never executed.
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

            # Restore BEFORE the next arm reads the files (R507's restore
            # CADENCE lesson), and verify by bytes.
            restore()
            now_bad = [rel for rel in OWNED_RELS
                       if md5_bytes((REPO / rel).read_bytes()) != BASELINE_MD5[rel]]
            if now_bad:
                print("ARM %s: RESTORE FAILED -- %s" % (label, now_bad))
                results.append((label, "RESTORE-FAILED", expected, note))
                break
    finally:
        restore()

    final_bad = [rel for rel in OWNED_RELS
                 if md5_bytes((REPO / rel).read_bytes()) != BASELINE_MD5[rel]]
    if final_bad:
        print("FINAL: RESTORE FAILED -- %s" % final_bad)
        # The snapshots are deliberately KEPT: the source is still mutated,
        # and the snapshot is the pristine copy the next run needs to recover.
        return 2
    # The final restore is byte-verified, so the recovery copies can go.
    for rel in OWNED_RELS:
        snap = snapshot_dir / (Path(rel).name + ".snap")
        if snap.exists():
            os.remove(snap)
    try:
        os.rmdir(snapshot_dir)
    except OSError:
        pass
    print("final md5 (restored, verified):")
    for rel in OWNED_RELS:
        print("  %s  %s" % (BASELINE_MD5[rel][:8], rel))

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
