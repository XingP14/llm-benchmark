#!/usr/bin/env python3
"""
R528 mutation matrix -- llm-benchmark.

Does tests/r528-anchor-cannot-separate-judge-from-subject.test.ts actually
DETECT the shape it claims to pin, or is it a green test that cannot fail?

THE SUBJECT. In llm-benchmark the Scorer is handed the SUBJECT's
ModelConfig and uses it for BOTH roles -- the graded answer and the judge
that grades it. arXiv:2606.15474's attribution race needs a FROZEN anchor
set whose independence from system drift is guaranteed by construction
("the only thing that can move y_i(a) is the judge"). The suite pins that
this independence is IMPOSSIBLE here.

Arms:
  M1  THE REPAIR: the Scorer gets a SECOND ModelConfig slot for the judge
      (a separate judge model id).                               expect KILLED
  M2  the judge call uses an INDEPENDENT model id (not the subject's).
                                                               expect KILLED
  M3  comment-only change (no behaviour change).                expect SURVIVED
  N1  NEGATIVE CONTROL: the score PARSE takes the last number
      instead of the first -- a change to the scoring rule that is
      NOT about judge/subject separation.                        expect SURVIVED
      (if this KILLED, the suite would be over-broad: it would be
      asserting the number-parsing rule rather than the separation.)

TOOLCHAIN: resolved from THIS tree's node_modules/.bin via the SHARED
resolver (scripts/resolve_tool.py) -- R525-1: a driver that rolls its own
resolver silently leaves the family contract. The expected test count is
DERIVED from the suite file's own `it(` count. "Tests: 0 total" is a HARNESS
ERROR, never a verdict.

BASELINE: derived from the repository's own HEAD blob, never transcribed
(R511 / R513): a pinned hash is valid for exactly ONE state of ONE tree.

SNAPSHOT: lives in scripts/.r528_snapshot/, one slot per file, keyed by the
path RELATIVE TO REPO ROOT (R524-1: two files with the same basename must
not share a slot).

RECOVERY (inherited from R526's measured rules):
  * recovery runs FIRST -- the scenario it exists for is a DIRTY tree;
  * a file is restored ONLY when its current bytes are one of the mutants
    THIS driver can produce (derived by applying the arm injections to the
    pristine bytes, so a pinned literal is never needed);
  * a concurrent agent's edit is not one of ours, so it is left alone and
    the clean-tree assertion then refuses to run over it.

Usage:
  python3 scripts/r528_matrix.py                  # full matrix
  python3 scripts/r528_matrix.py --preflight-only  # recovery + clean check
"""

import hashlib
import os
import re
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)

SUITE = "tests/r528-anchor-cannot-separate-judge-from-subject.test.ts"
SNAP_DIR = os.path.join(HERE, ".r528_snapshot")

# Files this driver OWNS and may mutate. Nothing outside this list is
# touched -- a concurrent agent's edits must survive this driver (R475-9).
OWNED = [
    "src/core/scorer.ts",
]


def rel(path):
    return os.path.join(REPO, path)


def md5(path):
    with open(path, "rb") as f:
        return hashlib.md5(f.read()).hexdigest()


def _resolve_tool(name):
    """Resolve a tool from the TREE this script stands in (R517 contract).

    The import is LAZY on purpose: a driver is sometimes COPIED into another
    checkout on its own (R513's arm 3), and a module-level import would make
    that copy fail to import at all. The resolver derives the tree root from
    its OWN path, so the call passes ONE argument.
    """
    import importlib.util

    here = os.path.dirname(os.path.abspath(__file__))
    resolver = os.path.join(here, "resolve_tool.py")
    if not os.path.exists(resolver):
        raise SystemExit(
            "%s does not exist -- this driver resolves its toolchain from\n"
            "the tree it stands in, and the resolver must sit beside it.\n"
            "Copy scripts/resolve_tool.py next to this driver." % resolver
        )
    spec = importlib.util.spec_from_file_location("_resolve_tool_mod", resolver)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.resolve_tool(name)


def git_blob_bytes(path):
    try:
        out = subprocess.run(
            ["git", "show", "HEAD:" + path],
            cwd=REPO, capture_output=True, timeout=20,
        )
        if out.returncode == 0:
            return out.stdout
    except Exception:
        pass
    return None


def snapshot_slot(path):
    return os.path.join(SNAP_DIR, path.replace("/", "__"))


# ---------------------------------------------------------------- snapshots
def take_snapshot():
    os.makedirs(SNAP_DIR, exist_ok=True)
    for p in OWNED:
        with open(rel(p), "rb") as f:
            data = f.read()
        with open(snapshot_slot(p), "wb") as f:
            f.write(data)
        # The MTIME travels with the snapshot. A byte-restore that does NOT
        # restore the mtime leaves the file's mtime NEWER than it was, and
        # that perturbs a DIFFERENT suite's precondition:
        # tests/evaluator-log-helpers.test.ts asserts that
        # dist/core/evaluator.js is not older than src/core/evaluator.ts
        # (a real guard: a stale dist turns a recursion check into a false
        # green). A matrix that owns src/core/evaluator.ts and restores it
        # by bytes therefore makes that guard RED on a tree whose CONTENT
        # never changed. Measured at this tick: the full suite went
        # 1652/1653 with exactly that one failure, and it passed again
        # after `npm run build`.
        # => restore the mtime as well as the bytes.
        st = os.stat(rel(p))
        with open(snapshot_slot(p) + ".mtime", "w", encoding="utf-8") as f:
            # st_mtime_ns keeps the FULL nanosecond precision: st_mtime is a
            # float and loses the last digits, so a restore through it is
            # NOT byte-equal in time (measured: 1793555089.6131854 ->
            # 1793555089.613185). A suite that compares mtimes would still
            # see a difference.
            f.write("%d\n" % st.st_mtime_ns)


def restore_snapshot():
    """Restore by BYTES from the snapshot (R475-2: never `git checkout`,
    which would destroy a concurrent agent's uncommitted edit), and restore
    the mtime as well (see take_snapshot)."""
    for p in OWNED:
        slot = snapshot_slot(p)
        if not os.path.exists(slot):
            continue
        with open(slot, "rb") as f:
            data = f.read()
        with open(rel(p), "wb") as f:
            f.write(data)
        mtime_slot = slot + ".mtime"
        if os.path.exists(mtime_slot):
            with open(mtime_slot, "r", encoding="utf-8") as f:
                try:
                    saved = int(f.read().strip())
                except (ValueError, OSError):
                    saved = None
            if saved is not None:
                try:
                    os.utime(rel(p), ns=(saved, saved))
                except OSError:
                    pass


# ------------------------------------------------------------------ runner
def run_suite(tool):
    """Run the suite; return (passed, failed, harness_error, output)."""
    proc = subprocess.run(
        [tool, SUITE, "--runInBand", "--coverage=false"],
        cwd=REPO, capture_output=True, text=True, timeout=1800,
    )
    out = proc.stdout + proc.stderr
    m = re.search(r"Tests:\s+(?:(\d+) failed,\s*)?(\d+) passed,\s*(\d+) total", out)
    if not m:
        return 0, 0, True, out
    failed = int(m.group(1) or 0)
    passed = int(m.group(2))
    total = int(m.group(3))
    harness = total == 0
    return passed, failed, harness, out


def expected_test_count():
    with open(rel(SUITE), "r", encoding="utf-8") as f:
        src = f.read()
    return len(re.findall(r"\bit\(", src))


# ------------------------------------------------------------- mutations
# Every arm is a PURE text transform: (repo-relative path, text) -> mutated
# text. Purity is what lets the recovery derive the mutant images without
# writing to the working tree.
def m1_separate_judge_slot(path, s):
    """THE REPAIR: give the Scorer a SECOND ModelConfig slot for the judge.

    The judge call then uses the judge's own model id, so the frozen anchor
    is re-scored by a judge that is independent of the subject -- the shape
    arXiv:2606.15474's race requires.
    """
    if path != "src/core/scorer.ts":
        return None
    needle = "  private model: ModelConfig;"
    if needle not in s:
        raise RuntimeError("M1 needle not found")
    s2 = s.replace(
        needle,
        needle + "\n  private judgeModel: ModelConfig;",
        1,
    )
    s2 = s2.replace(
        "  constructor(adapter: LLMAdapter, model: ModelConfig) {\n    this.adapter = adapter;\n    this.model = model;",
        "  constructor(adapter: LLMAdapter, model: ModelConfig, judgeModel?: ModelConfig) {\n"
        "    this.adapter = adapter;\n"
        "    this.model = model;\n"
        "    this.judgeModel = judgeModel ?? model;",
        1,
    )
    if s2 == s:
        raise RuntimeError("M1 injection failed")
    if "private judgeModel" not in s2 or "judgeModel ?? model" not in s2:
        raise RuntimeError("M1 injection did not land")
    return s2


def m2_independent_judge_model_id(path, s):
    """A weaker repair: the judge call carries an id that is not the
    subject's, without adding a second slot.

    The needle is anchored on the DIALOGUE judge call (the one the suite
    drives) by its unique preceding line. An unanchored `this.model` needle
    occurs TWICE in this file -- the dialogue judge call and the coding
    judge call -- and R475-3 says a non-unique needle must be re-anchored,
    not silently resolved to the first copy: mutating one of two twin call
    sites is not the same mutation as mutating both, and the matrix must
    say which one it did.
    """
    if path != "src/core/scorer.ts":
        return None
    needle = (
        "    const prompt = this.buildDialogueScoringPrompt(question, modelOutput);\n"
        "\n"
        "    try {\n"
        "      const scoreText = await this.adapter.chat(\n"
        "        [{ role: 'user', content: prompt }],\n"
        "        this.model\n"
        "      );"
    )
    if needle not in s:
        raise RuntimeError("M2 needle not found")
    if s.count(needle) != 1:
        raise RuntimeError("M2 needle is not unique (%d)" % s.count(needle))
    s2 = s.replace(
        needle,
        needle.replace(
            "        this.model\n",
            "        { ...this.model, model: 'judge-' + String(this.model.model) }\n",
        ),
        1,
    )
    if s2 == s:
        raise RuntimeError("M2 injection failed")
    return s2


def m3_comment_only(path, s):
    """A comment-only change in the file that owns the judge call."""
    if path != "src/core/scorer.ts":
        return None
    needle = "  private model: ModelConfig;"
    if needle not in s:
        raise RuntimeError("M3 needle not found")
    s2 = s.replace(
        needle,
        needle + "\n  // R528 M3 comment-only: no behaviour change",
        1,
    )
    if s2 == s:
        raise RuntimeError("M3 injection failed")
    return s2


def n1_last_number(path, s):
    """NEGATIVE CONTROL: the score PARSE takes the LAST number, not the first.

    A change to the scoring RULE that is not about judge/subject separation.
    The suite must NOT go red on it -- if it did, the suite would be
    asserting the number-parsing rule rather than the separation.
    """
    if path != "src/core/scorer.ts":
        return None
    needle = "const match = text.match(/(\\d+(?:\\.\\d+)?)/);"
    if needle not in s:
        raise RuntimeError("N1 needle not found")
    s2 = s.replace(needle, "const match = text.match(/(\\d+(?:\\.\\d+)?)/g);", 1)
    s2 = s2.replace(
        "const score = parseFloat(match[1]);",
        "const score = parseFloat(match[match.length - 1]);",
        1,
    )
    if s2 == s:
        raise RuntimeError("N1 injection failed")
    return s2


ARMS = [
    ("M1  the Scorer gets a separate judge slot", m1_separate_judge_slot, "KILLED"),
    ("M2  the judge call uses an independent model id", m2_independent_judge_model_id, "KILLED"),
    ("M3  comment-only change", m3_comment_only, "SURVIVED"),
    ("N1  the score parse takes the last number (control)", n1_last_number, "SURVIVED"),
]


def inject(path, s, fn):
    """Apply one arm to one file's text.  Returns the mutated text or None
    when the arm does not target this file."""
    return fn(path, s)


# ---------------------------------------------------------------- recovery
def derive_mutant_images(pristine):
    """The byte images THIS driver can produce, DERIVED by applying the arm
    injections to the PRISTINE bytes.  Derived, never hand-written (R511).
    The transforms are pure, so nothing is written to the working tree.

    Returns {repo-relative path: set(mutant bytes)}.
    """
    muts = {}
    for p, data in pristine.items():
        try:
            text = data.decode("utf-8")
        except UnicodeDecodeError:
            continue
        for _label, fn, _expected in ARMS:
            try:
                out = inject(p, text, fn)
            except Exception:
                continue
            if out is None or out == text:
                continue
            muts.setdefault(p, set()).add(out.encode("utf-8"))
    return muts


def recover_stale_snapshot():
    """Recover from a run that died between the injection and the restore.

    Measured rules (R526):
      * The pristine source is the HEAD blob.  The snapshot is trustworthy
        ONLY when its bytes ARE the HEAD blob; a snapshot that differs from
        HEAD was taken from an already-mutated tree, so installing it would
        INSTALL the mutant.
      * A file is restored ONLY when its current bytes are one of the
        mutants this driver can produce.  A concurrent agent's edit is not
        one of ours, so it is left alone -- and the clean-tree assertion
        then refuses to run over it.
      * This runs BEFORE the clean-tree assertion.
    """
    recovered = []
    left_alone = []
    if not os.path.isdir(SNAP_DIR):
        return recovered, left_alone

    pristine = {}
    for p in OWNED:
        head = git_blob_bytes(p)
        if head is None:
            continue
        slot = snapshot_slot(p)
        snap = None
        if os.path.exists(slot):
            with open(slot, "rb") as f:
                snap = f.read()
        pristine[p] = snap if (snap is not None and snap == head) else head

    muts = derive_mutant_images(pristine)

    for p, clean_bytes in pristine.items():
        try:
            with open(rel(p), "rb") as f:
                current = f.read()
        except OSError:
            continue
        if current == clean_bytes:
            continue
        if current in muts.get(p, set()):
            with open(rel(p), "wb") as f:
                f.write(clean_bytes)
            recovered.append(p)
        else:
            left_alone.append(p)

    shutil.rmtree(SNAP_DIR, ignore_errors=True)
    return recovered, left_alone


# ------------------------------------------------------------------- main
def main():
    args = sys.argv[1:]
    preflight_only = "--preflight-only" in args

    print("R528 mutation matrix -- llm-benchmark")
    print("repo:", REPO)

    # RECOVERY FIRST: the scenario recovery exists for is a DIRTY tree.
    recovered, left_alone = recover_stale_snapshot()
    for p in recovered:
        print("RECOVERED: %s was left mutated by a dead run; restored." % p)
    for p in left_alone:
        print(
            "LEFT ALONE: %s differs from HEAD but is not one of this driver's "
            "mutations -- treating it as a concurrent agent's edit." % p
        )

    # R475-2: assert the tree is CLEAN before injecting anything.
    st = subprocess.run(
        ["git", "status", "--porcelain", "--", "src/"], cwd=REPO,
        capture_output=True, text=True, timeout=30,
    ).stdout.strip()
    if st:
        print("ABORT: src/ is not clean -- refusing to inject over someone else's edits:")
        print(st)
        return 2
    print("tree clean")

    if preflight_only:
        print("PREFLIGHT OK (recovery + clean-tree check)")
        return 0

    jest = _resolve_tool("jest")
    print("jest:", jest)
    print()

    take_snapshot()
    baseline = {p: md5(rel(p)) for p in OWNED}
    # The mtimes are captured HERE, before any injection, so that the
    # in-arm restore can put them back exactly.
    mtimes = {p: os.stat(rel(p)).st_mtime_ns for p in OWNED}

    # CONTROL FIRST (R404-M1 / R456-1): the unmutated tree must be GREEN.
    want = expected_test_count()
    print("expected test count (derived from the suite's own `it(` count) =", want)
    passed, failed, harness, out = run_suite(jest)
    print("CONTROL: passed=%d failed=%d harness=%s" % (passed, failed, harness))
    if harness or failed != 0 or passed != want:
        print("CONTROL FAILED -- the suite is not green on the unmutated tree.")
        print(out[-4000:])
        restore_snapshot()
        shutil.rmtree(SNAP_DIR, ignore_errors=True)
        return 2
    print("CONTROL OK (%d/%d green)\n" % (passed, want))

    verdicts_ok = True
    for label, fn, expected in ARMS:
        target = None
        for p in OWNED:
            with open(rel(p), "rb") as f:
                text = f.read().decode("utf-8")
            try:
                out = inject(p, text, fn)
            except RuntimeError:
                out = None
            if out is not None and out != text:
                target = (p, text, out)
                break
        if target is None:
            print("%-46s expect=%-9s got=%-9s MISMATCH (no injection landed)" % (label, expected, "HARNESS"))
            verdicts_ok = False
            continue
        p, before, after = target
        path = rel(p)
        with open(path, "w", encoding="utf-8") as f:
            f.write(after)
        try:
            _p, f_, h, _o = run_suite(jest)
            if h:
                verdict = "HARNESS"
            elif f_ > 0:
                verdict = "KILLED"
            else:
                verdict = "SURVIVED"
        finally:
            # restore by bytes, then assert byte-identity
            with open(path, "w", encoding="utf-8") as f:
                f.write(before)
            # Restore the mtime too: a byte-restore alone leaves the file
            # looking MODIFIED IN TIME to any other suite that compares
            # mtimes across the tree (see take_snapshot).
            if p in mtimes:
                try:
                    os.utime(path, ns=(mtimes[p], mtimes[p]))
                except OSError:
                    pass
        ok = md5(path) == baseline[p]
        if not ok:
            print("  !! restore FAILED for %s" % path)
            verdicts_ok = False
        status = "ok" if verdict == expected else "MISMATCH"
        if verdict != expected:
            verdicts_ok = False
        print("%-46s expect=%-9s got=%-9s %s" % (label, expected, verdict, status))

    print()
    for p in OWNED:
        after_md5 = md5(rel(p))
        print("md5 %-38s %s  %s" % (p, after_md5, "unchanged" if after_md5 == baseline[p] else "CHANGED"))

    shutil.rmtree(SNAP_DIR, ignore_errors=True)

    print()
    print("VERDICT:", "PASS" if verdicts_ok else "FAIL")
    return 0 if verdicts_ok else 1


if __name__ == "__main__":
    sys.exit(main())
