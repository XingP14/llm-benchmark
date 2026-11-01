#!/usr/bin/env python3
"""
R526 mutation matrix -- llm-benchmark.

Does tests/r526-judge-is-the-subject.test.ts actually DETECT the shapes it
claims to pin, or is it a green test that cannot fail?

Arms:
  M1  CLI entry: route the adapter by the MODEL's own type   expect KILLED
  M2  judge reply: parse the LAST number, not the first       expect KILLED
  M3  judge reply: parse a JSON field, not a first-match regex expect KILLED
  M4  comment-only change (no behaviour change)               expect SURVIVED

NEGATIVE CONTROLS (the point of this driver, R525-1):
  N1  the Anthropic adapter's wire shape is changed           expect KILLED
      (arm D must be able to fail too -- if the control arm can
      never fail, arm A's red is not evidence)
  N2  a spelling change in the CLI entry's createAdapter call  expect SURVIVED
      (must NOT kill anything: a non-behavioural edit)

TOOLCHAIN: resolved from THIS tree's node_modules/.bin via the SHARED
resolver (scripts/resolve_tool.py) -- R525-1: a driver that rolls its own
resolver silently leaves the family contract. The expected test count is
DERIVED from the suite file's own `it(` count. "Tests: 0 total" is a HARNESS
ERROR, never a verdict.

SNAPSHOT: lives in scripts/.r526_snapshot/, one slot per file, keyed by the
path RELATIVE TO REPO ROOT (R524-1: two files with the same basename must not
share a slot).

RECOVERY (R526, 2026-10-31 23:03 -- two defects found by MEASUREMENT):

  D1  THE RECOVERY PATH WAS UNREACHABLE IN THE SCENARIO IT EXISTS FOR.
      The clean-tree assertion ran BEFORE the recovery, so a tree left
      MUTATED by a dead run -- the exact case recovery exists for -- made
      the driver ABORT (exit 2) instead of recovering.  The recovery was
      dead code.

  D2  THE INVERTED BRANCH INSTALLED A MUTANT.  The old rule restored the
      SNAPSHOT whenever the snapshot differed from the HEAD blob.  A
      snapshot that differs from HEAD was itself taken from an
      already-mutated tree, so restoring it INSTALLED the mutant.

  The recovery now runs FIRST, and it restores only the mutations THIS
  driver can produce -- the mutant images are DERIVED by applying the arm
  injections to the pristine bytes (R511: a pinned literal is a pinned path
  -- it is valid for exactly ONE state of ONE tree).  A concurrent agent's
  edit to an owned file is NOT one of our mutants, so it is left alone and
  the driver then refuses to run over a dirty tree.

  The arm injections are PURE text transforms: they take the file's text
  and return the mutated text.  Deriving a mutant image therefore never
  WRITES to the working tree, so deriving them cannot clobber a concurrent
  agent's edit even for an instant.

Usage:
  python3 scripts/r526_matrix.py                  # full matrix
  python3 scripts/r526_matrix.py --preflight-only  # recovery + clean check
"""

import hashlib
import os
import re
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)

SUITE = "tests/r526-judge-is-the-subject.test.ts"
SNAP_DIR = os.path.join(HERE, ".r526_snapshot")

# Files this driver OWNS and may mutate. Nothing outside this list is
# touched -- a concurrent agent's edits must survive this driver (R475-9).
OWNED = [
    "src/index.ts",
    "src/core/evaluator.ts",
    "src/core/scorer.ts",
    "src/adapters/anthropic-adapter.ts",
]


def rel(path):
    return os.path.join(REPO, path)


def md5(path):
    with open(path, "rb") as f:
        return hashlib.md5(f.read()).hexdigest()


def _resolve_tool(name):
    """Resolve a tool from the TREE this script stands in.

    R517 (2026-10-29) made the shared resolver the CONTRACT for every
    tracked Python driver: the driver must hand the resolver a tree the
    resolver can use, and must not roll its own resolution path.

    The import is LAZY, on purpose: a driver is sometimes COPIED into
    another checkout on its own (R513's arm 3 copies a driver into a fake
    repo and resolves its baseline there).  A module-level
    `from resolve_tool import resolve_tool` would make that copy fail to
    import at all -- the driver would break in exactly the situation it
    exists to be tested in.

    The call passes ONE argument: the resolver derives the tree root from
    its OWN path, and a repo-root override is exactly what R517's arm (1)
    rejects ("resolve_tool called with 2 args (a root override)").

    NOTE for the R517 probe: it evaluates the driver's module-level IMPORTS
    plus this function alone, so this function may only use names that come
    from a module-level import or from `__file__` -- never a module-level
    constant of this file.
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
        # restore the mtime leaves the file looking MODIFIED IN TIME to any
        # other suite that compares mtimes across the tree -- measured at the
        # R528 tick: this family's byte-restore made
        # tests/evaluator-log-helpers.test.ts (which asserts dist/ is not
        # older than src/) RED on a tree whose CONTENT never changed.
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
    which would destroy a concurrent agent's uncommitted edit)."""
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
        cwd=REPO, capture_output=True, text=True, timeout=900,
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
# text.  Purity is what lets the recovery derive the mutant images without
# writing to the working tree.
def m1_route_by_model_type(path, s):
    """THE REPAIR: choose the adapter per MODEL, not once from models[0].

    The Evaluator owns the adapter and reuses it for every model, so the
    repair has to live where the per-model decision is made: make the
    Evaluator build a per-model adapter from the model's OWN `type`, which
    is what the WEB path already does (src/web/engine/evaluator.ts:106 sits
    inside the config loop).
    """
    if path != "src/core/evaluator.ts":
        return None
    needle = "import { LLMAdapter } from '../adapters/adapter';"
    if needle not in s:
        raise RuntimeError("M1 needle not found")
    s2 = s.replace(
        needle,
        needle + "\nimport { createAdapter } from '../adapters/create-adapter';",
        1,
    )
    # Route by the MODEL's own type at the two chat call sites.
    s2 = s2.replace(
        "const modelOutput = await this.adapter.chat(turns, model);",
        "const modelOutput = await createAdapter(model.type).chat(turns, model);",
        1,
    )
    s2 = s2.replace(
        "const modelOutput = await this.adapter.chat(messages, model);",
        "const modelOutput = await createAdapter(model.type).chat(messages, model);",
        1,
    )
    if s2 == s:
        raise RuntimeError("M1 injection failed")
    if "createAdapter(model.type)" not in s2:
        raise RuntimeError("M1 injection did not land")
    return s2


def m2_parse_last_number(path, s):
    if path != "src/core/scorer.ts":
        return None
    needle = "const match = text.match(/(\\d+(?:\\.\\d+)?)/);"
    if needle not in s:
        raise RuntimeError("M2 needle not found")
    repl = "const match = text.match(/(\\d+(?:\\.\\d+)?)/g);"
    s2 = s.replace(needle, repl, 1)
    # The real behaviour change: take the LAST number.
    s2 = s2.replace(
        "const score = parseFloat(match[1]);",
        "const score = parseFloat(match[match.length - 1]);",
        1,
    )
    if s2 == s:
        raise RuntimeError("M2 injection failed")
    return s2


def m3_parse_json_field(path, s):
    if path != "src/core/scorer.ts":
        return None
    needle = "const match = text.match(/(\\d+(?:\\.\\d+)?)/);"
    if needle not in s:
        raise RuntimeError("M3 needle not found")
    # A defensive JSON-field parse (the dev.to recipe): read {"score": n}.
    s2 = s.replace(
        needle,
        "const match = /\"score\"\\s*:\\s*(\\d+(?:\\.\\d+)?)/.exec(text);",
        1,
    )
    if s2 == s:
        raise RuntimeError("M3 injection failed")
    return s2


def m4_comment_only(path, s):
    """A comment-only change in the SCORER (the file that owns the parse)."""
    if path != "src/core/scorer.ts":
        return None
    needle = "  private parseScore(text: string): number {"
    if needle not in s:
        raise RuntimeError("M4 needle not found")
    s2 = s.replace(
        needle,
        needle + "\n    // R526 M4 comment-only: no behaviour change",
        1,
    )
    if s2 == s:
        raise RuntimeError("M4 injection failed")
    return s2


def n1_anthropic_wire_shape(path, s):
    if path != "src/adapters/anthropic-adapter.ts":
        return None
    needle = "`${endpoint}/v1/messages`"
    if needle not in s:
        raise RuntimeError("N1 needle not found")
    s2 = s.replace(needle, "`${endpoint}/chat/completions`", 1)
    if s2 == s:
        raise RuntimeError("N1 injection failed")
    return s2


def n2_spelling(path, s):
    if path != "src/index.ts":
        return None
    needle = "const adapter = createAdapter(config.models[0].type);"
    if needle not in s:
        raise RuntimeError("N2 needle not found")
    s2 = s.replace(needle, "const adapter = createAdapter(config.models[0].type); // R526 N2", 1)
    if s2 == s:
        raise RuntimeError("N2 injection failed")
    return s2


ARMS = [
    ("M1  route the adapter by the model's own type", m1_route_by_model_type, "KILLED"),
    ("M2  parse the LAST number, not the first", m2_parse_last_number, "KILLED"),
    ("M3  parse a JSON field, not a first-match regex", m3_parse_json_field, "KILLED"),
    ("M4  comment-only change", m4_comment_only, "SURVIVED"),
    ("N1  change the Anthropic wire shape (control)", n1_anthropic_wire_shape, "KILLED"),
    ("N2  comment-only change (control)", n2_spelling, "SURVIVED"),
]


def inject(path, s, fn):
    """Apply one arm to one file's text.  Returns the mutated text or None
    when the arm does not target this file."""
    return fn(path, s)


# ---------------------------------------------------------------- recovery
def derive_mutant_images(pristine):
    """The byte images THIS driver can produce, DERIVED by applying the arm
    injections to the PRISTINE bytes.

    Derived, never hand-written (R511: a pinned literal is a pinned path --
    it is valid for exactly ONE state of ONE tree).  The transforms are
    pure, so nothing is written to the working tree.

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

    Measured rules (R526, 2026-10-31 23:03):

      * The pristine source is the HEAD blob.  The snapshot is trustworthy
        ONLY when its bytes ARE the HEAD blob; a snapshot that differs
        from HEAD was taken from an already-mutated tree, so installing it
        would INSTALL the mutant (the old, inverted rule).

      * A file is restored ONLY when its current bytes are one of the
        mutants this driver can produce (derived, not listed).  A
        concurrent agent's edit is not one of ours, so it is left alone --
        and the clean-tree assertion then refuses to run over it.

      * This runs BEFORE the clean-tree assertion.  Otherwise the exact
        scenario it exists for (a tree left mutated by a dead run) makes
        the driver ABORT instead of recovering.
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
        # The snapshot is the pristine source only when it IS the HEAD blob.
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

    print("R526 mutation matrix -- llm-benchmark")
    print("repo:", REPO)

    # RECOVERY FIRST (D1): the scenario recovery exists for is a DIRTY tree.
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
    # Captured BEFORE any injection, so the in-arm restore can put them back.
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
            # Restore the mtime too (see take_snapshot).
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
