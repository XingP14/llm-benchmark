#!/usr/bin/env python3
"""R488 mutation matrix (llm-benchmark).

Discipline (R475-2 / R477 / R481 / R482 / R487 driver fixes):
  - declare OWNED files, assert each is TRACKED-CLEAN before injecting;
  - snapshot BEFORE any injection, assert byte-identical (md5) before each arm;
  - assert the needle was UNIQUELY anchored BEFORE writing (R477: a needle that
    matches twice half-applies and the driver reports success);
  - assert the text actually changed after writing (R456: needle-never-applied);
  - inject ONE mutation per arm, restore IMMEDIATELY, not only in finally;
  - classify on the SUMMARY SHAPE, not on the mere presence of "Tests "
    (r482 driver defect #2);
  - jest prints its human-readable report to STDERR -- parse stdout + stderr
    (r487 driver defect #1, which made every arm read SURVIVED);
  - a COMPILE-BROKEN arm is HARNESS, never a verdict (r487 driver defect #2).

Arms
----
  M1  REPAIR of F1/F2: add authMiddleware to the questions route.
  M2  REPAIR of F2 (the other half): stop projecting reference_answer.
  M3  REPAIR of F3: the scorer stops rewarding the key-facts echo.
  M4  REPAIR of F4: the shipped image no longer runs the web server.
  M5  the authMiddleware is imported but NOT applied (the near-miss repair).
  M6  NEGATIVE CONTROL: semantically equivalent, MUST survive.
"""
import hashlib
import os
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
from pathlib import Path

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

# R511 (2026-10-28): the tree must be DERIVED from this file, not
# transcribed from one author's checkout.
#
# REPO used to be the literal "/root/.hermes/workspace/llm-benchmark".  A
# path baked into a script is validated on exactly ONE host: MEASURED, a COPY
# of this driver placed in a DIFFERENT checkout still resolved REPO to the
# author's tree, so the copy's driver mutated, measured and restored the
# AUTHOR'S source files while the copy's own tree was never touched -- and
# the verdict it printed was about a tree the caller did not ask about.
#
# The derivation is ASSERTED against the repository's marker file, so a
# driver copied away from a checkout fails LOUDLY instead of quietly
# measuring somebody else's tree.
REPO = Path(__file__).resolve().parent.parent
if not (REPO / "jest.config.js").is_file():
    raise SystemExit(
        "ABORT: cannot derive a repository root above %s (no jest.config.js) -- "
        "this driver must live inside a checkout of the repository it measures."
        % Path(__file__).resolve()
    )

SUITE = REPO / "tests/web/r488-unauthenticated-questions-answers-leak.test.ts"
OWNED = [
    REPO / "src/web/routes/questions.ts",
    REPO / "src/web/middleware/auth.ts",
    REPO / "src/core/scorer.ts",
    REPO / "docker/Dockerfile",
]


def md5(p: Path) -> str:
    return hashlib.md5(p.read_bytes()).hexdigest()


# ── pre-injection: OWNED must be TRACKED-CLEAN (R477 D1) ──────────────────
_st = subprocess.run(
    ["git", "status", "--short", "--"] + [str(p.relative_to(REPO)) for p in OWNED],
    cwd=REPO, capture_output=True, text=True,
)
assert _st.stdout.strip() == "", f"ABORT pre-injection: OWNED files dirty -> {_st.stdout!r}"

BASE = {p: p.read_bytes() for p in OWNED}
EXPECT = {p: md5(p) for p in OWNED}

Q = OWNED[0]   # src/web/routes/questions.ts
A = OWNED[1]   # src/web/middleware/auth.ts
S = OWNED[2]   # src/core/scorer.ts
D = OWNED[3]   # docker/Dockerfile

ARMS = [
    ("M1 REPAIR: questions.ts gets authMiddleware (F1/F2 closed)",
     [(Q,
       "import { Router, Request, Response } from 'express';",
       "import { Router, Request, Response } from 'express';\n"
       "import { authMiddleware, AuthRequest } from '../middleware/auth';"),
      (Q,
       "const router = Router();",
       "const router = Router();\nrouter.use(authMiddleware);")],
     "KILLED"),

    ("M2 REPAIR: the route stops projecting reference_answer (F2, dialogue half)",
     [(Q,
       "    reference_answer: q.referenceAnswer,\n",
       "")],
     "KILLED"),

    ("M3 REPAIR: the scorer stops rewarding the key-facts echo (F3)",
     [(S,
       "        if (outputLower.includes(String(fact).toLowerCase())) {",
       "        if (false && outputLower.includes(String(fact).toLowerCase())) {")],
     "KILLED"),

    ("M4 REPAIR: the image no longer runs the web server (F4)",
     [(D,
       'CMD ["node", "dist/web/server.js"]',
       'CMD ["node", "dist/index.js"]')],
     "KILLED"),

    ("M5 NEAR-MISS: authMiddleware is imported but NEVER applied",
     [(Q,
       "import { Router, Request, Response } from 'express';",
       "import { Router, Request, Response } from 'express';\n"
       "import { authMiddleware } from '../middleware/auth';\n"
       "void authMiddleware;")],
     "SURVIVED"),

    ("M6 NEGATIVE CONTROL: semantically equivalent, MUST survive",
     [(Q,
       "const router = Router();",
       "const router = Router();\n// a comment that changes nothing")],
     "SURVIVED"),
]


def run(label: str):
    r = subprocess.run(
        [_resolve_tool("jest"), str(SUITE.relative_to(REPO))],
        cwd=REPO, capture_output=True, text=True, timeout=1200,
    )
    out = r.stdout + r.stderr
    # Require the SUMMARY SHAPE, not just the word "Tests" (r482 defect #2).
    line = [l for l in out.splitlines()
            if l.strip().startswith("Tests:") and "no tests" not in l]
    if not line:
        errs = [l for l in out.splitlines() if "error TS" in l][:3]
        return label, "HARNESS", (errs or out[-400:])
    res = line[-1].strip()
    if "failed" in res:
        return label, "KILLED", res
    return label, "SURVIVED", res


def mutate(path: Path, old: str, new: str):
    text = path.read_text()
    n = text.count(old)
    assert n == 1, f"anchor count {n} != 1 in {path.name} for {old[:70]!r}"
    path.write_text(text.replace(old, new))
    assert path.read_text() != text, f"injection did not change {path.name}"


results = []

# ── CONTROL FIRST (R479: a broken control is worse than a broken suite) ───
for p in OWNED:
    assert md5(p) == EXPECT[p], f"PRE-INJECTION: {p.name} is not the snapshot (dirty tree)"
label, verdict, detail = run("CONTROL")
results.append((label, verdict, detail, "SURVIVED"))
print(f"{label}: {verdict} — {detail}", flush=True)
assert verdict == "SURVIVED", f"ABORT: the baseline is not green ({verdict}: {detail})"

for name, edits, expect in ARMS:
    touched = sorted({e[0] for e in edits})
    for p in touched:
        assert md5(p) == EXPECT[p], f"ABORT: {p.name} not at snapshot"
    try:
        for p, old, new in edits:
            mutate(p, old, new)
        label, verdict, detail = run(name)
        results.append((label, verdict, detail, expect))
        print(f"{name}: {verdict} — {detail}   (expected {expect})", flush=True)
    finally:
        # restore IMMEDIATELY, per arm, byte-exact (R477/R481/R482)
        for p in touched:
            p.write_bytes(BASE[p])
        for p in touched:
            assert md5(p) == EXPECT[p], f"RESTORE FAILED {p.name}"

print("\n=== SUMMARY ===")
for n, v, d, e in results:
    flag = "" if v == e or n == "CONTROL" else "   <-- UNEXPECTED"
    print(f"{v:9s} (exp {e:8s}) {n}{flag}")
bad = [str(p) for p in OWNED if md5(p) != EXPECT[p]]
print("POST-MATRIX md5 mismatch:", bad or "none")
sys.exit(0)
