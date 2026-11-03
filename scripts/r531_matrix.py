#!/usr/bin/env python3
"""
R531 mutation matrix (llm-benchmark) -- the function-calling TOOL CONTRACT is
never sent to the model.

Discipline carried from R473 / R486 / R487 / R497 / R507 / R511 / R513 /
R514 / R517 / R518 / R519 / R522 / R526 / R528:

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

Arms
----
  M1  THE REAL REPAIR of F1/F2: the request carries the tool DECLARATION.
      The request gains a `tools` payload naming the declared tool and its
      schema.  MUST KILL -- if it survived, the suite's headline claim
      ("the contract is never sent") would be about the wrong mechanism.

  M2  THE REAL REPAIR of F3: the scorer accepts a name-agnostic match --
      it compares the ARGUMENTS only, so a model that calls the RIGHT tool
      under a different (but declared) name is credited.  MUST KILL -- if it
      survived, the suite's "the name is the discriminator" claim would be
      about the wrong mechanism.

  M3  THE REAL REPAIR of F4: a fully correct PROSE answer earns partial
      credit instead of 0.  MUST KILL -- if it survived, the suite's "a
      correct natural-language answer scores 0" claim would be about the
      wrong mechanism.

  M4  THE REAL REPAIR of F7: the argument matcher compares strings for
      EQUALITY instead of SUBSTRING inclusion, so a superset value no longer
      matches.  MUST KILL -- if it survived, the suite's "the matcher is
      substring-inclusive" claim would be about the wrong mechanism.

  N1  NEGATIVE CONTROL: a comment that changes nothing.  MUST SURVIVE.  Its
      purpose is to prove the driver is capable of reporting a survivor --
      a driver where every arm reads KILLED is not measuring anything.

The owned file is `src/core/evaluator.ts` -- a PRODUCTION file, the same
discipline R518/R519/R522 used for production routes/scorers.  The restore is
byte-verified against the pre-mutation snapshot AND against the repository's
HEAD blob, so a failed restore cannot go unnoticed.

WHY THIS DRIVER IS NOT `r522_matrix.py`
---------------------------------------
That driver scores the web DIALOGUE scorer and owns
`src/web/engine/evaluator.ts`.  This one scores the FUNCTION-CALLING
dimension, whose subject spans TWO production files:

  * `src/core/evaluator.ts` -- the CLI request assembly (the tool contract
    is never added to the messages) and the CLI's FC dimension wiring;
  * `src/core/scorer.ts`    -- the FC scorer (name match + argument match).

M1 owns the evaluator; M2/M3/M4 own the scorer.  The driver therefore
supports MULTI-FILE arms: each arm declares which files it edits, each file
is snapshotted and restored, and the restore is byte-verified per file.

WHY THE SCORER IS THE RIGHT SUBJECT FOR M2/M3/M4
-------------------------------------------------
The FC scorer is STRUCTURAL: `Scorer.scoreFunctionCalling` matches the
model's reply against the expected tool call by name and by argument.  It
makes NO adapter call of its own, so the "real repair" arms here are
reachable without touching the network.  That is also why the suite's own
F3 arm can vary the score by changing only the tool NAME: the score is
computed, not judged.
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

SUITE_REL = "tests/r531-function-calling-tool-contract-never-sent.test.ts"
SUITE = SUITE_REL

# The production files the arms may edit.  Each is snapshotted and restored.
OWNED_RELS = [
    "src/core/evaluator.ts",
    "src/core/scorer.ts",
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
# M1 -- THE REAL REPAIR of F1/F2: the tool DECLARATION is put in front of the
# model.  The minimal honest form: a `system` message carrying the declared
# tool's name and JSON schema, appended to the messages the CLI assembles.
#
# The needle is the CLI's message assembly in `evaluateQuestion`
# (src/core/evaluator.ts):
#
#     const messages: Array<{ role: string; content: string }> = [];
#
#     if (question.systemPrompt) {
#       messages.push({ role: 'system', content: question.systemPrompt });
#     }
#
#     messages.push({ role: 'user', content: question.content });
#
# The repair adds the declaration as a system message.  It is written so the
# file still COMPILES: `question` is a `BenchmarkQuestion`, which does not
# carry `availableTools` -- so the edit casts, exactly as the production code
# does for `MultiTurnQuestion` / `CodeBenchmarkQuestion` elsewhere.

CLI_ASSEMBLY_OLD = """    const messages: Array<{ role: string; content: string }> = [];

    if (question.systemPrompt) {
      messages.push({ role: 'system', content: question.systemPrompt });
    }

    messages.push({ role: 'user', content: question.content });"""

CLI_ASSEMBLY_M1 = """    const messages: Array<{ role: string; content: string }> = [];

    if (question.systemPrompt) {
      messages.push({ role: 'system', content: question.systemPrompt });
    }

    const fcDeclaration = (question as unknown as { availableTools?: Array<{ name: string; description: string; parameters: unknown }> }).availableTools;
    if (fcDeclaration && fcDeclaration.length > 0) {
      messages.push({
        role: 'system',
        content: 'Available tools:\\n' + JSON.stringify(fcDeclaration),
      });
    }

    messages.push({ role: 'user', content: question.content });"""

# N1 -- NEGATIVE CONTROL: a comment that changes nothing.  It must compile
# and it must be behaviour-neutral.

CLI_ASSEMBLY_N1 = """    const messages: Array<{ role: string; content: string }> = [];

    if (question.systemPrompt) {
      messages.push({ role: 'system', content: question.systemPrompt });
    }

    // negative control: a comment that changes nothing

    messages.push({ role: 'user', content: question.content });"""

# M2 -- THE REAL REPAIR of F3: the scorer stops treating the NAME as the
# discriminator and compares the ARGUMENTS only.  The needle is the scoring
# block in `scoreFunctionCalling` (src/core/scorer.ts):
#
#       const expectedName: string = expected.name;
#       const actualName: string = toolCall.name || '';
#       const nameMatch = actualName === expectedName;
#
#       const expectedArgs: Record<string, unknown> = expected.arguments ?? {};
#       const actualArgs: Record<string, unknown> = toolCall.arguments ?? {};
#       const argMatch = this.matchArgs(expectedArgs, actualArgs);
#
#       let score = 0;
#       if (nameMatch && argMatch.full) {
#         score = 100;
#       } else if (nameMatch && argMatch.partial) {
#         score = 70;
#       } else if (nameMatch) {
#         score = 40;
#       } else {
#         score = 0;
#       }
#
# The repair makes the score a function of the argument match, with the name
# contributing only when the arguments are already right.

SCORER_NAME_OLD = """      const expectedName: string = expected.name;
      const actualName: string = toolCall.name || '';
      const nameMatch = actualName === expectedName;

      const expectedArgs: Record<string, unknown> = expected.arguments ?? {};
      const actualArgs: Record<string, unknown> = toolCall.arguments ?? {};
      const argMatch = this.matchArgs(expectedArgs, actualArgs);

      let score = 0;
      if (nameMatch && argMatch.full) {
        score = 100;
      } else if (nameMatch && argMatch.partial) {
        score = 70;
      } else if (nameMatch) {
        score = 40;
      } else {
        score = 0;
      }"""

SCORER_NAME_M2 = """      const expectedName: string = expected.name;
      const actualName: string = toolCall.name || '';
      const nameMatch = actualName === expectedName;

      const expectedArgs: Record<string, unknown> = expected.arguments ?? {};
      const actualArgs: Record<string, unknown> = toolCall.arguments ?? {};
      const argMatch = this.matchArgs(expectedArgs, actualArgs);

      let score = 0;
      if (argMatch.full) {
        score = 100;
      } else if (argMatch.partial) {
        score = 70;
      } else if (nameMatch) {
        score = 40;
      } else {
        score = 0;
      }"""

# M3 -- THE REAL REPAIR of F4: a fully correct PROSE answer earns partial
# credit instead of 0.  The needle is the "no tool call" branch:
#
#       const toolCall = this.extractToolCall(modelOutput);
#       if (!toolCall) {
#         return {
#           questionId: question.id,
#           category: question.category,
#           score: 0,
#           dimension: 'function_calling',
#           modelOutput: modelOutput,
#           detail: '未检测到 tool_call',
#         };
#       }
#
# The repair credits a prose answer partially when the expected arguments'
# VALUES are present in the text (the keyFacts-style containment the OTHER
# dimensions already use).

SCORER_NOTOOL_OLD = """      const toolCall = this.extractToolCall(modelOutput);
      if (!toolCall) {
        return {
          questionId: question.id,
          category: question.category,
          score: 0,
          dimension: 'function_calling',
          modelOutput: modelOutput,
          detail: '未检测到 tool_call',
        };
      }"""

SCORER_NOTOOL_M3 = """      const toolCall = this.extractToolCall(modelOutput);
      if (!toolCall) {
        const expectedArgValues = Object.values(expected.arguments ?? {})
          .map((v) => (typeof v === 'string' ? v : JSON.stringify(v)))
          .filter((v) => v.length > 0);
        const hitCount = expectedArgValues.filter((v) =>
          (modelOutput || '').toLowerCase().includes(v.toLowerCase()),
        ).length;
        const proseScore =
          expectedArgValues.length > 0 && hitCount === expectedArgValues.length ? 50 : 0;
        return {
          questionId: question.id,
          category: question.category,
          score: proseScore,
          dimension: 'function_calling',
          modelOutput: modelOutput,
          detail: proseScore > 0 ? '散文作答，参数值命中' : '未检测到 tool_call',
        };
      }"""

# M4 -- THE REAL REPAIR of F7: the argument matcher compares strings for
# EQUALITY instead of SUBSTRING inclusion.  The needle is the string branch
# of `valueMatches` (src/core/scorer.ts):
#
#     if (typeof expected === 'string' && typeof actual === 'string') {
#       return actual.toLowerCase().includes(expected.toLowerCase());
#     }

VALUEMATCHES_OLD = """    if (typeof expected === 'string' && typeof actual === 'string') {
      return actual.toLowerCase().includes(expected.toLowerCase());
    }"""

VALUEMATCHES_M4 = """    if (typeof expected === 'string' && typeof actual === 'string') {
      return actual.toLowerCase() === expected.toLowerCase();
    }"""

# Each arm: label, {owned_rel: [(old, new), ...]}, expected verdict, note.
ARMS = [
    ("M1", {"src/core/evaluator.ts": [(CLI_ASSEMBLY_OLD, CLI_ASSEMBLY_M1)]}, "KILLED",
     "the REAL REPAIR of F1/F2: the tool DECLARATION is sent to the model"),
    ("M2", {"src/core/scorer.ts": [(SCORER_NAME_OLD, SCORER_NAME_M2)]}, "KILLED",
     "the REAL REPAIR of F3: the score compares the ARGUMENTS only, so the "
     "name is no longer the discriminator"),
    ("M3", {"src/core/scorer.ts": [(SCORER_NOTOOL_OLD, SCORER_NOTOOL_M3)]}, "KILLED",
     "the REAL REPAIR of F4: a correct PROSE answer earns partial credit"),
    ("M4", {"src/core/scorer.ts": [(VALUEMATCHES_OLD, VALUEMATCHES_M4)]}, "KILLED",
     "the REAL REPAIR of F7: the string matcher compares for EQUALITY, not "
     "substring inclusion"),
    ("N1", {"src/core/evaluator.ts": [(CLI_ASSEMBLY_OLD, CLI_ASSEMBLY_N1)]}, "SURVIVED",
     "NEGATIVE CONTROL: a comment added inside the message assembly"),
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
        tmp = p.with_suffix(p.suffix + ".r531tmp")
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
    passed, failed, total, detail = run_suite()
    print("BASELINE: %s" % detail)
    if failed != 0 or total != EXPECTED_TOTAL:
        print("ABORT: baseline is not green (%d failed / %d total, expected 0/%d)"
              % (failed, total, EXPECTED_TOTAL))
        return 2

    # ---- Phase 1: the arms.
    # The owned files are PRODUCTION files, so the snapshot discipline is
    # load-bearing: restore FIRST, remove the snapshot SECOND, and verify
    # the restore BY BYTES against the HEAD blob.
    snapshot_dir = REPO / "scripts" / ".r531_snapshots"
    snapshot_dir.mkdir(exist_ok=True)

    # ---- RECOVERY FIRST, before the snapshot is (re)written.
    #
    # A previous run that died mid-arm (SIGKILL -- no handler can intercept)
    # leaves BOTH a mutated owned file AND a stale snapshot on disk.  The
    # stale snapshot must be consumed BEFORE `original` is captured, or the
    # mutated bytes would be captured as the new baseline and every arm
    # would be measured against a mutant.
    for rel in OWNED_RELS:
        snap = snapshot_dir / (Path(rel).name + ".snap")
        if snap.exists():
            stale = snap.read_bytes()
            if md5_bytes(stale) != BASELINE_MD5[rel]:
                print("ABORT: a previous run left a snapshot that does NOT match the "
                      "HEAD baseline for %s -- refusing to guess which version is correct."
                      % rel)
                return 2
            if md5_bytes((REPO / rel).read_bytes()) != BASELINE_MD5[rel]:
                (REPO / rel).write_bytes(stale)
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
