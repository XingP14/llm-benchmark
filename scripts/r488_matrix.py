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
import subprocess
import sys
from pathlib import Path

REPO = Path("/root/.hermes/workspace/llm-benchmark")
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
        ["npx", "jest", str(SUITE.relative_to(REPO))],
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
