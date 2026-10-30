#!/usr/bin/env python3
"""
R524 mutation matrix -- llm-benchmark.

Does tests/web/r524-web-drops-question-system-prompt.test.ts actually DETECT
the defect it claims to pin, or is it a green test that cannot fail?

Arms:
  M1  web path: push the system message (THE REPAIR)      expect KILLED
  M2  web path: push a system message with the WRONG content  expect KILLED
  M3  CLI path: stop pushing the system message              expect KILLED
  M4  CLI path: push the system message LAST, not first      expect KILLED
  M5  comment-only change (no behaviour change)              expect SURVIVED

TWO DEFECTS THIS DRIVER FIXES, both measured on the orphan driver that
the 2026-10-31 03:03 slot left behind (the slot died on HTTP 429 before
committing, and its driver had already destroyed the tree):

  (1) THE BACKUP-KEY DEFECT -- a snapshot keyed by BARE FILENAME.

        backups[p] = snap / p.name

      Both production files under test are named `evaluator.ts`
      (`src/web/engine/evaluator.ts` and `src/core/evaluator.ts`). The
      second copy OVERWROTE the first, so the snapshot held the CORE file
      twice and the final restore wrote the CORE file over the WEB file.
      The tree was left with `src/web/engine/evaluator.ts` byte-identical
      to `src/core/evaluator.ts` (md5 60371f4924234e362db9f3ae22e0f5fd):
      the web `EvaluatorEngine` class was GONE (0 occurrences) and the
      tree did not even typecheck.

      Fix: key every slot by the path RELATIVE TO ROOT, so two files with
      the same basename land in distinct slots. The driver also REFUSES to
      start if the two slots collide, or if the two files are already
      byte-identical before the run.

  (2) THE RECOVERY DEFECT -- a driver that dies leaves the tree corrupted
      and the NEXT tick inherits a corruption it did not cause.

      A `finally` block does not run under SIGKILL, and the 03:03 slot's
      owner was killed at the scheduler level. So the snapshot must live
      in a path this driver OWNS, and the driver must RECOVER FROM A
      STALE SNAPSHOT BEFORE it captures a new baseline -- otherwise the
      next run captures the corrupted tree as its own baseline and every
      later restore restores the corruption.

      Fix: the snapshot lives in `scripts/.r524_snapshot/`. On startup the
      driver compares each stale snapshot against the HEAD blob: if it
      differs, the stale snapshot is RESTORED (the tree was left mutated);
      if it matches, the stale snapshot is merely a leftover and is
      discarded. The snapshot is removed only AFTER the final restore is
      verified byte-identical to the pre-run md5 of EACH file.

The toolchain is resolved from THIS tree's node_modules/.bin, never npx.
The expected test count is DERIVED from the suite file's own `it(` count.
"Tests: 0 total" is a HARNESS ERROR, never a verdict.

Verdict PASS iff every arm landed on its expected side.

Usage: python3 scripts/r524_matrix.py
"""
import hashlib
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SUITE = ROOT / "tests" / "web" / "r524-web-drops-question-system-prompt.test.ts"
WEB_EVAL = ROOT / "src" / "web" / "engine" / "evaluator.ts"
CLI_EVAL = ROOT / "src" / "core" / "evaluator.ts"

# A path this driver OWNS, inside the tree so it is greppable and
# gitignore-able. Never under /tmp: a driver must be able to find its own
# leftovers after a SIGKILL.
SNAP_DIR = ROOT / "scripts" / ".r524_snapshot"

WEB_ORIG = "output = await adapter.chat(\n                [{ role: 'user', content: question.content }],\n                this.buildModelConfig(config)\n              );"
WEB_REPAIR = "output = await adapter.chat(\n                (question.systemPrompt\n                  ? [{ role: 'system', content: question.systemPrompt },\n                     { role: 'user', content: question.content }]\n                  : [{ role: 'user', content: question.content }]),\n                this.buildModelConfig(config)\n              );"
WEB_WRONG = "output = await adapter.chat(\n                (question.systemPrompt\n                  ? [{ role: 'system', content: 'you are a helpful assistant' },\n                     { role: 'user', content: question.content }]\n                  : [{ role: 'user', content: question.content }]),\n                this.buildModelConfig(config)\n              );"

CLI_ORIG = "    if (question.systemPrompt) {\n      messages.push({ role: 'system', content: question.systemPrompt });\n    }"
CLI_DROP = "    // MUTANT M3: system message deliberately not pushed"
CLI_LAST = "    messages.push({ role: 'user', content: question.content });\n    if (question.systemPrompt) {\n      messages.push({ role: 'system', content: question.systemPrompt });\n    }"


def md5(path: Path) -> str:
    return hashlib.md5(path.read_bytes()).hexdigest()


def head_blob_md5(rel: Path) -> str:
    """md5 of the repository's HEAD blob for a path, via git."""
    out = subprocess.run(
        ["git", "show", f"HEAD:{rel.relative_to(ROOT).as_posix()}"],
        cwd=str(ROOT), capture_output=True,
    )
    if out.returncode != 0:
        raise SystemExit(f"FATAL: cannot read HEAD blob for {rel}")
    return hashlib.md5(out.stdout).hexdigest()


def expected_count() -> int:
    src = SUITE.read_text()
    return len(re.findall(r"\bit\(", src))


def _resolve_tool(name):
    """Resolve a tool from the TREE this script stands in.

    R517 (2026-10-29) made the shared resolver the CONTRACT for every
    tracked Python driver: the driver must hand the resolver a tree the
    resolver can use, and must not roll its own resolution path.

    This driver previously defined its OWN `resolve_tool(name)`, which
    happened to resolve the same path -- and that was the defect the R517
    suite caught in CI on 2026-10-31 (arm 2: "no _resolve_tool function
    found" for scripts/r524_matrix.py).  A gate that pins a CONTRACT and
    then has a member of the family quietly leave the contract is a gate
    that measures the family's MEMSHIP, not the family's behaviour: the
    new driver passed every behavioural check while being the one driver
    the suite reported as not participating.

    The import is LAZY, on purpose: a driver is sometimes COPIED into
    another checkout on its own (R513's arm 3 copies a driver into a fake
    repo and resolves its baseline there).  A module-level
    `from resolve_tool import resolve_tool` would make that copy fail to
    import at all -- the driver would break in exactly the situation it
    exists to be tested in.
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


def run_suite(tool: str) -> tuple[int, str]:
    proc = subprocess.run(
        [tool, str(SUITE.relative_to(ROOT)), "--runInBand"],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        timeout=600,
    )
    out = proc.stdout + proc.stderr
    # Parse the summary line explicitly. `--reporter=basic` counts FILES, not
    # TESTS, so the check count must come from the "Tests: N passed" line.
    m = re.search(r"Tests:\s+(?:(\d+) passed,)?", out)
    passed = int(m.group(1)) if (m and m.group(1)) else 0
    failed = len(re.findall(r"^\s*✕", out, re.M))
    if "failed" in out and re.search(r"Tests:.*\bfailed\b", out):
        fm = re.search(r"Tests:.*?(\d+) failed", out)
        if fm:
            failed = int(fm.group(1))
    # "Tests: 0 total" is a HARNESS ERROR, never a verdict.
    if re.search(r"Tests:\s*0 total", out):
        raise SystemExit("FATAL: harness produced 0 total tests -- HARNESS ERROR, not a verdict")
    return failed, out


def apply_mut(path: Path, orig: str, new: str) -> None:
    text = path.read_text()
    if orig not in text:
        raise SystemExit(f"FATAL: anchor not found in {path}")
    path.write_text(text.replace(orig, new, 1))


def slot_for(p: Path) -> Path:
    """UNIQUE slot per file: the path RELATIVE TO ROOT, not the basename.

    The orphan driver's bug was `snap / p.name`: two files named
    `evaluator.ts` collided in one slot and the restore destroyed the web
    engine.
    """
    return SNAP_DIR / p.relative_to(ROOT)


def recover_stale() -> list[str]:
    """Consume a snapshot left by a previous run BEFORE capturing a baseline.

    THE RULE: the snapshot IS the pristine pre-mutation copy. So the
    question is not "does the snapshot match HEAD?" but "does the TREE
    match the snapshot?". If the tree differs from the snapshot, a dead
    run left it mutated, and the snapshot is the only clean copy left.

    (The first draft of this function compared the SNAPSHOT against the
    HEAD blob and discarded the snapshot when they matched. That is
    exactly backwards for the case that matters: a dead run leaves
    (tree = mutated, snapshot = pristine), so the snapshot matches HEAD
    and the corrupted tree is KEPT. Measured: the driver then captured
    the mutated tree as its own baseline and its final restore wrote the
    mutation BACK -- the corruption became permanent. Comparing tree vs
    snapshot catches it; comparing snapshot vs HEAD does not.)

    Without this, a dead run's corruption becomes the next run's baseline
    and every later restore restores the corruption.
    """
    notes: list[str] = []
    if not SNAP_DIR.exists():
        return notes
    for p in (WEB_EVAL, CLI_EVAL):
        slot = slot_for(p)
        if not slot.exists():
            continue
        stale_md5 = hashlib.md5(slot.read_bytes()).hexdigest()
        tree_md5 = md5(p)
        head = head_blob_md5(p)
        if tree_md5 == stale_md5:
            notes.append(
                f"recovered: {p.relative_to(ROOT)} already matches the snapshot "
                f"(md5 {tree_md5}) -- no restore needed"
            )
            continue
        # The tree differs from the pristine snapshot => it was left mutated.
        p.write_bytes(slot.read_bytes())
        restored = md5(p)
        if restored != head:
            notes.append(
                f"WARNING: restored {p.relative_to(ROOT)} from the stale snapshot "
                f"(md5 {restored}), which itself differs from HEAD ({head}) -- "
                f"the snapshot was taken from an already-dirty tree"
            )
        else:
            notes.append(
                f"RECOVERED: {p.relative_to(ROOT)} was left MUTATED by a previous run "
                f"(tree md5 {tree_md5} != snapshot md5 {stale_md5}); restored from the snapshot"
            )
    return notes


def main() -> int:
    if not SUITE.exists():
        raise SystemExit("FATAL: suite missing")

    lines: list[str] = []

    # ---- RECOVERY FIRST, before any baseline is captured. ----
    for note in recover_stale():
        lines.append(note)

    n_expected = expected_count()
    tool = _resolve_tool("jest")

    backups: dict[Path, Path] = {}
    pre_md5: dict[Path, str] = {}
    for p in (WEB_EVAL, CLI_EVAL):
        slot = slot_for(p)
        slot.parent.mkdir(parents=True, exist_ok=True)
        backups[p] = slot
        shutil.copy2(p, backups[p])
        pre_md5[p] = md5(p)

    # Guard: the two files must occupy DIFFERENT slots and start DIFFERENT.
    if backups[WEB_EVAL] == backups[CLI_EVAL]:
        raise SystemExit("FATAL: backup slots collided -- the orphan driver's bug")
    if pre_md5[WEB_EVAL] == pre_md5[CLI_EVAL]:
        raise SystemExit("FATAL: the two production files are byte-identical before the run")

    arms = [
        ("M1", WEB_EVAL, WEB_ORIG, WEB_REPAIR, "KILLED", "web path pushes the system message (THE REPAIR)"),
        ("M2", WEB_EVAL, WEB_ORIG, WEB_WRONG, "KILLED", "web path pushes a system message with the WRONG content"),
        ("M3", CLI_EVAL, CLI_ORIG, CLI_DROP, "KILLED", "CLI path stops pushing the system message"),
        ("M4", CLI_EVAL, CLI_ORIG, CLI_LAST, "KILLED", "CLI path pushes the system message LAST instead of first"),
    ]

    killed = survived = harness = not_injected = 0

    def restore(p: Path) -> bool:
        shutil.copy2(backups[p], p)
        return md5(p) == pre_md5[p]

    try:
        # CONTROL: unmutated tree must be green.
        failed, out = run_suite(tool)
        control_ok = failed == 0
        lines.append(f"CONTROL  unmutated: {'GREEN' if control_ok else f'RED ({failed} failed)'}")
        if not control_ok:
            lines.append(out[-3000:])
            print("\n".join(lines))
            return 1
        lines.append(f"CONTROL  expected test count derived from suite file: {n_expected}")

        for arm, path, orig, new, expect, desc in arms:
            try:
                apply_mut(path, orig, new)
            except SystemExit as e:
                lines.append(f"{arm}  NOT-INJECTED  {desc}  ({e})")
                not_injected += 1
                restore(path)
                continue
            # The mutation MUST have changed the file.
            if md5(path) == pre_md5[path]:
                lines.append(f"{arm}  HARNESS-ERROR  mutation was a no-op (file unchanged)")
                harness += 1
                restore(path)
                continue
            failed, out = run_suite(tool)
            if failed == 0:
                verdict = "SURVIVED"
                survived += 1
            else:
                verdict = "KILLED"
                killed += 1
            mark = "OK " if verdict == expect else "!! "
            lines.append(f"{mark}{arm}  {verdict} (expected {expect})  {desc}")
            if not restore(path):
                lines.append(f"   FATAL: restore of {path} is NOT byte-identical")
                return 1

        # M5: comment-only, must SURVIVE.
        path = WEB_EVAL
        text = path.read_text()
        needle = "            // 调用 LLM"
        if needle in text:
            text2 = text.replace(needle, "            // R524 matrix M5: comment-only, no behaviour change\n" + needle, 1)
            path.write_text(text2)
            if md5(path) == pre_md5[path]:
                lines.append("M5  HARNESS-ERROR  mutation was a no-op (file unchanged)")
                harness += 1
            else:
                failed, out = run_suite(tool)
                verdict = "SURVIVED" if failed == 0 else "KILLED"
                if verdict == "SURVIVED":
                    survived += 1
                else:
                    killed += 1
                mark = "OK " if verdict == "SURVIVED" else "!! "
                lines.append(f"{mark}M5  {verdict} (expected SURVIVED)  comment-only change")
            restore(path)
        else:
            lines.append("M5  NOT-INJECTED  anchor not found")
            not_injected += 1
    finally:
        for p, b in backups.items():
            shutil.copy2(b, p)
        # FINAL assertion: BOTH files restored byte-identical to their own pre-run md5.
        for p in (WEB_EVAL, CLI_EVAL):
            if md5(p) != pre_md5[p]:
                lines.append(f"   FATAL: FINAL restore of {p} is NOT byte-identical")
                print("\n".join(lines))
                return 1

    lines.append("")
    lines.append(f"RESTORE web  {WEB_EVAL.relative_to(ROOT)} md5 {md5(WEB_EVAL)} (pre-run {pre_md5[WEB_EVAL]})")
    lines.append(f"RESTORE cli  {CLI_EVAL.relative_to(ROOT)} md5 {md5(CLI_EVAL)} (pre-run {pre_md5[CLI_EVAL]})")
    lines.append(f"KILLED={killed} SURVIVED={survived} HARNESS={harness} NOT-INJECTED={not_injected}")
    ok = killed == 4 and survived == 1 and harness == 0 and not_injected == 0
    lines.append("VERDICT " + ("PASS" if ok else "FAIL"))
    print("\n".join(lines))

    # The snapshot is removed ONLY after the final restore is verified.
    if SNAP_DIR.exists():
        shutil.rmtree(SNAP_DIR)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
