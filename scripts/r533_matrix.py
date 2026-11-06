#!/usr/bin/env python3
"""
R533 mutation matrix (llm-benchmark) -- the LONG-CONTEXT dimension ships a
46,000-character haystack of the SAME thirteen paragraphs, and its scorer
never reads it.

Discipline carried from R473 / R486 / R487 / R497 / R507 / R511 / R513 /
R514 / R517 / R518 / R519 / R522 / R526 / R528 / R531 / R532:

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

  * multigrid.ai "LongBench, RULER and Testing Long Context" -- the needle
    test's ceiling: "The filler is not distractor text. If the haystack is
    essays and the needle is about sandwiches, the needle is semantically
    isolated... Filler drawn from the same domain as the needle makes the
    test several times harder, and most published needle charts do not do
    that."
  * Chroma "Context Rot" -- NIAH "typically assesses direct lexical
    matching, which may not be representative of flexible, semantically
    oriented tasks"; the haystack must be coherent and the needle
    semantically related.
  * arXiv:2605.23170 "Positional Failures in Long-Context LLMs" -- a
    benchmark must "jointly control task position, filler content, and
    context length"; 76% of middle-position errors matched SURROUNDING
    FILLER TEXT, "consistent with filler-answer interference as a dominant
    error mode".
  * HELMET (ICLR 2025) -- existing long-context benchmarks "often provide
    noisy signals due to limited coverage of applications".
  * LongBench v2 (ACL 2025) -- existing long-context benchmarks "fail to
    reflect the long-context LLMs' deep understanding capabilities";
    extractive questions "are easily handled by modern long-context
    models", as evidenced by perfect NIAH recall.
  * RULER (arXiv:2404.06654) -- sweep the needle across a DEPTH x LENGTH
    grid, with multi-needle and aggregation tasks, not one needle at one
    depth.
  * R532's own canonical (the statebench measurement-validity audit) for the
    matcher defects: "Unbounded substring matching" ("100" -> "1000",
    "2100") and "Blindness to negation" ("A phrase under explicit negation
    is usually evidence of the capability under test, not a violation of
    it").

  M1  THE REAL REPAIR of F1: THE FILLER IS NOT REPEATED.  The minimal
      honest form of "the filler must be distractor text": each distinct
      paragraph appears ONCE, and the haystack is padded with DISTINCT
      paragraphs rather than the same six over and over.
      MUST KILL -- if it survived, the suite's "the haystack is 97%
      repeated filler" claim would be about the wrong mechanism.

  M2  THE REAL REPAIR of F2: THE SCORER READS THE CONTEXT.  RULER/CRE
      require the position and the content to be controlled, which means
      the scorer must be able to SEE the haystack it is judging against.
      The minimal honest form: the scorer takes the question's `content`
      into account, so a reply is judged against the context that was
      actually sent, not against a flat string.
      MUST KILL -- if it survived, the suite's "the scorer never reads the
      context" claim would be about the wrong mechanism.

  M3  THE REAL REPAIR of F3: EVERY keyFact MUST APPEAR IN THE QUESTION'S
      OWN referenceAnswer.  A fact the reference answer does not contain
      cannot be scored against it; the canonical's "ground truth must be
      sufficiently complex to prevent guessing" (NeurIPS 2507.02825 O.b.3)
      presumes the ground truth IS the reference.
      MUST KILL -- if it survived, the suite's "the benchmark's own
      reference answer scores 67" claim would be about the wrong mechanism.

  M4  THE REAL REPAIR of F4/F5: BOUNDARY-AWARE, WHITESPACE-TOLERANT,
      NEGATION-AWARE MATCHING.  The statebench audit's two findings that
      land on this scorer: unbounded substring matching, and blindness to
      negation.  Plus the whitespace defect: a required phrase that
      contains a space must not require the reply to contain that exact
      space, because the reply is not the question's answer key.
      MUST KILL -- if it survived, the suite's "a correct prose answer
      loses to a keyword dump" and "a wrong number scores 100" claims
      would be about the wrong mechanism.

  N1  NEGATIVE CONTROL: a comment that changes nothing.  MUST SURVIVE.  Its
      purpose is to prove the driver is capable of reporting a survivor --
      a driver where every arm reads KILLED is not measuring anything.

The owned files are `src/core/scorer.ts` (the LC scorer), `src/core/
evaluator.ts` (the CLI request assembly -- needed by M2 so the context is
REACHABLE by the scorer) and `src/benchmarks/long-context.ts` (the filler
generator -- needed by M1).  All three are snapshotted before injection and
restored BY BYTES; the restore is verified against the repository's HEAD
blob, so a failed restore cannot go unnoticed.
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

SUITE_REL = "tests/r533-long-context-plane.test.ts"
SUITE = SUITE_REL

# The production files the arms may edit.  Each is snapshotted and restored.
OWNED_RELS = [
    "src/core/scorer.ts",
    "src/core/evaluator.ts",
    "src/benchmarks/long-context.ts",
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
# M1 -- THE REAL REPAIR of F1: the filler is NOT repeated.
#
# The needle is the filler generator's repetition loop in
# `src/benchmarks/long-context.ts`:
#
#     let cur = '';
#     let i = 0;
#     while (cur.length < targetChars) {
#       cur += paragraphs[i % paragraphs.length] + '\n\n';
#       i++;
#     }
#
# The canonical's requirement (multigrid / Chroma / arXiv:2605.23170): the
# filler must be DISTINCT, COHERENT, and FACT-BEARING so that a retrieval
# error is distinguishable from a lucky lexical hit.  The minimal honest
# form that this arm can inject while remaining a REPAIR rather than a
# rewrite: each distinct paragraph is emitted ONCE, and the remaining
# length is made up of paragraphs that are DISTINCT but still on-theme --
# i.e. the repetition is removed, which is the defect this suite names.
#
# The arm adds a per-paragraph VARIANT marker so that no two emitted
# paragraphs are byte-identical, and it emits each source paragraph once
# per pass with a different suffix, so the number of DISTINCT paragraphs
# grows with the target length.

PAD_OLD = """  let cur = '';
  let i = 0;
  while (cur.length < targetChars) {
    cur += paragraphs[i % paragraphs.length] + '\\n\\n';
    i++;
  }"""

PAD_M1 = """  let cur = '';
  let i = 0;
  let pass = 0;
  while (cur.length < targetChars) {
    // R533 M1: the filler must be DISTINCT text, not the same paragraph
    // repeated.  Each pass emits a different suffix, so no two paragraphs
    // are byte-identical.
    cur += paragraphs[i % paragraphs.length] + ' (section ' + String(pass + 1) + ')' + '\\n\\n';
    i++;
    if (i % paragraphs.length === 0) pass++;
  }"""

# M2 -- THE REAL REPAIR of F2: the scorer READS THE CONTEXT.
#
# The needle is the keyFacts loop in `scoreLongContext`
# (src/core/scorer.ts):
#
#       for (const fact of keyFacts) {
#         if (outputLower.includes(String(fact).toLowerCase())) {
#           matched.push(fact);
#         } else {
#           missed.push(fact);
#         }
#       }
#
# RULER and CRE (arXiv:2605.23170) require the position and the content of
# the haystack to be CONTROLLED, which is only possible if the judge can
# see them.  The minimal honest form: the scorer also checks that each
# required fact is actually PRESENT IN THE CONTEXT it was given, so a
# fact that never appeared in the haystack cannot be credited by a reply
# that merely states it.  That is the smallest change that makes the
# context an INPUT to the verdict.

LC_LOOP_OLD = """      for (const fact of keyFacts) {
        if (outputLower.includes(String(fact).toLowerCase())) {
          matched.push(fact);
        } else {
          missed.push(fact);
        }
      }"""

LC_LOOP_M2 = """      const contextLower = String((lcQuestion as unknown as { content?: string }).content || '').toLowerCase();
      for (const fact of keyFacts) {
        const factLower = String(fact).toLowerCase();
        // R533 M2: a fact is only creditable when it was actually IN the
        // context the model was given -- the judge must see the haystack.
        const presentInContext = contextLower.includes(factLower);
        if (presentInContext && outputLower.includes(factLower)) {
          matched.push(fact);
        } else {
          missed.push(fact);
        }
      }"""

# M3 -- THE REAL REPAIR of F3: every keyFact must appear in the question's
# OWN referenceAnswer.  The needle is the keyFacts declaration site in
# `src/benchmarks/long-context.ts`:
#
#       keyFacts: ['杭州', '18.7 亿', '林承志'],
#
# for lc-multi-003:
#
#       keyFacts: ['23%', '280ms', 'Raft'],
#
# whose referenceAnswer is '23%;280ms' -- 'Raft' is NOT in it.  The
# minimal honest form of "the ground truth must be the reference": the
# reference answer is extended so that it covers every keyFact.

LC_MULTI_OLD = """      referenceAnswer: '23%;280ms',
      keyFacts: ['23%', '280ms', 'Raft'],"""

LC_MULTI_M3 = """      referenceAnswer: '23%;280ms;Raft',
      keyFacts: ['23%', '280ms', 'Raft'],"""

# M4 -- THE REAL REPAIR of F4/F5: boundary-aware, whitespace-tolerant,
# negation-aware matching.
#
# The needle is the SAME keyFacts loop as M2 (a single anchor, two arms),
# plus the helper the arm adds to the Scorer.
#
# The statebench audit's findings that land here:
#   * "Unbounded substring matching" -- `"100"` -> `"1000"`, `"2100"`; the
#     fix is "boundary-aware matching, with the boundary applied per edge
#     according to whether that edge is a word character".
#   * "Blindness to negation" -- "A phrase under explicit negation is
#     usually evidence of the capability under test, not a violation of
#     it."
# Plus the whitespace defect this suite measured: a required phrase that
# contains a space must not require the reply to contain that exact space.

LC_LOOP_M4 = """      const negationMarkers = ['并不', '不是', '也不是', '不', '未', '没', '无', '别', '不要', '不能', '不会'];
      for (const fact of keyFacts) {
        const factLower = String(fact).toLowerCase();
        // R533 M4: whitespace-tolerant, boundary-aware, negation-aware.
        const needleVariants = Array.from(new Set([
          factLower,
          factLower.replace(/\\s+/g, ''),
        ]));
        let hit = false;
        for (const variant of needleVariants) {
          if (variant.length === 0) continue;
          let idx = outputLower.indexOf(variant);
          while (idx !== -1) {
            const before = idx > 0 ? outputLower[idx - 1] : '';
            const after = idx + variant.length < outputLower.length ? outputLower[idx + variant.length] : '';
            const leftOk = !/\\w/.test(before) || !/\\w/.test(variant[0]);
            const rightOk = !/\\w/.test(after) || !/\\w/.test(variant[variant.length - 1]);
            let negated = false;
            for (const marker of negationMarkers) {
              if (outputLower.slice(Math.max(0, idx - marker.length), idx).includes(marker)) { negated = true; break; }
            }
            if (leftOk && rightOk && !negated) { hit = true; break; }
            idx = outputLower.indexOf(variant, idx + 1);
          }
          if (hit) break;
        }
        if (hit) {
          matched.push(fact);
        } else {
          missed.push(fact);
        }
      }"""

# N1 -- NEGATIVE CONTROL: a comment that changes nothing.  It must compile
# and it must be behaviour-neutral.

LC_LOOP_N1 = """      // negative control: a comment that changes nothing
      for (const fact of keyFacts) {
        if (outputLower.includes(String(fact).toLowerCase())) {
          matched.push(fact);
        } else {
          missed.push(fact);
        }
      }"""

# Each arm: label, {owned_rel: [(old, new), ...]}, expected verdict, note.
ARMS = [
    ("M1", {"src/benchmarks/long-context.ts": [(PAD_OLD, PAD_M1)]}, "KILLED",
     "the REAL REPAIR of F1: the filler paragraphs are DISTINCT (each pass "
     "emits a different suffix) instead of the same six repeated"),

    ("M2", {"src/core/scorer.ts": [(LC_LOOP_OLD, LC_LOOP_M2)]}, "KILLED",
     "the REAL REPAIR of F2: the scorer READS THE CONTEXT -- a fact is only "
     "creditable when it was actually present in the haystack"),

    ("M3", {"src/benchmarks/long-context.ts": [(LC_MULTI_OLD, LC_MULTI_M3)]}, "KILLED",
     "the REAL REPAIR of F3: the question's own referenceAnswer covers every "
     "keyFact (the 'Raft' fact was missing from it)"),

    ("M4", {"src/core/scorer.ts": [(LC_LOOP_OLD, LC_LOOP_M4)]}, "KILLED",
     "the REAL REPAIR of F4/F5: whitespace-tolerant, boundary-aware and "
     "negation-aware matching"),

    ("N1", {"src/core/scorer.ts": [(LC_LOOP_OLD, LC_LOOP_N1)]}, "SURVIVED",
     "NEGATIVE CONTROL: a comment added inside the long_context scorer"),
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
        tmp = p.with_suffix(p.suffix + ".r533tmp")
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
    snapshot_dir = REPO / ".r533-snapshots"
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
