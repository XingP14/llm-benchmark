#!/usr/bin/env python3
"""List src exported symbols that NO test file imports at runtime.

WHY THIS EXISTS
A helper is "pinned" by a test that drives it for real. A test that only
greps the source text is not coverage: the text it reads can be deleted or
moved and the suite stays green. So the question this answers is -- which
exported symbols are backed ONLY by source-text assertions, or by nothing?

WHAT WENT WRONG IN THE FIRST VERSION (keep this in mind before editing)
The original sweep matched only ES `import ... from '...src/...'`. The runtime
suites added later load the real module through CommonJS, in three shapes:

    const { a } = require('../src/x')          # name ABOVE the paren
    const m  = require('../src/index') as { a }  # name AFTER it
    const m  = require('../src/x'); m.a         # name ACCESSED off the binding

Handling none reported shipped runtime suites as unpinned, and handling only
one or two still misreports the rest. A sweep that over-reports is worse than
no sweep: it points the next tick at work that is already done. So every
import shape has to be recognized here, and tests/sweep-no-runtime-import.test.ts
pins them.

STILL NOT RECOGNIZED (know these before trusting a report)
Two shapes remain invisible to this sweep, and both produce FALSE POSITIVES.
They are left reported rather than silenced, because a visible false positive
can be dismissed with evidence and a silently-dropped one cannot:

  1. TRANSITIVE drive. src/web/routes/auth.ts does
     `import { authMiddleware } from '../middleware/auth'` and registers it on
     a route. A test that imports the ROUTE drives the middleware for real,
     but the middleware's name appears in no test import clause.
  2. INTRA-FILE drive. `codeBenchmarks` is exported by coding.ts and read by
     getTestCases() in the same file. Driving getTestCases() executes
     codeBenchmarks, but the name appears in no test import clause.

  Both need the src-side reachability graph that a test-side regex text cannot
  build. Anything reported here must be checked against the module's own
  callers before it is treated as a coverage gap.

USAGE
  python3 scripts/sweep-no-runtime-import.py            # from the repo root
  python3 scripts/sweep-no-runtime-import.py <src> <tests>
Exits 0 always; this is a reporting tool, not a gate.
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)


def collect_exports(src_dir):
    """Map exported symbol name -> source file relative to REPO."""
    exported = {}
    for dp, _dn, fns in os.walk(src_dir):
        for fn in fns:
            if not fn.endswith(".ts"):
                continue
            p = os.path.join(dp, fn)
            src = open(p, encoding="utf-8").read()
            for m in re.finditer(
                    r"export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)", src):
                exported.setdefault(m.group(1), os.path.relpath(p, REPO))
            for m in re.finditer(r"export\s*\{([^}]*)\}", src):
                for part in m.group(1).split(","):
                    part = part.strip().split(" as ")[-1].strip()
                    if re.fullmatch(r"[A-Za-z_$][\w$]*", part or ""):
                        exported.setdefault(part, os.path.relpath(p, REPO))
    return exported


def collect_imports(tests_dir):
    """Map imported symbol name -> set of test files that import it."""
    importer = {}

    def note(clause, spec, test_rel):
        # Only src/ imports count. A symbol pulled from ../types or a test
        # helper is not evidence that its src definition is driven.
        if "src" not in spec:
            return
        for n in re.finditer(r"[A-Za-z_$][\w$]*", clause):
            importer.setdefault(n.group(0), set()).add(test_rel)

    def note_members(target, spec, test_rel, rest):
        """Record `m.a` / `m['a']` reads off a module object bound to `target`.

        A member read is a real runtime touch of a real export: the module was
        loaded and the property fetched. The name appears in no import clause,
        which is why this shape was invisible before.

        The containment test is `"src" in spec`, the same one `note()` uses.
        A relative specifier is `'../../src/x'`, not `'src/x'`, so an
        anchored test silently skipped every member read in the repo.
        """
        if "src" not in spec:
            return
        for prop in re.finditer(rf"\b{re.escape(target)}\.(\w+)", rest):
            importer.setdefault(prop.group(1), set()).add(test_rel)
        for prop in re.finditer(rf"\b{re.escape(target)}\['(\w+)'\]", rest):
            importer.setdefault(prop.group(1), set()).add(test_rel)

    for dp, _dn, fns in os.walk(tests_dir):
        for fn in fns:
            if not fn.endswith(".ts"):
                continue
            p = os.path.join(dp, fn)
            text = open(p, encoding="utf-8").read()
            test_rel = os.path.relpath(p, REPO)

            # ES import, possibly spread over several lines.
            for m in re.finditer(r"import\s+([\s\S]*?)\s+from\s+'([^']*)'", text):
                note(m.group(1), m.group(2), test_rel)

            # CommonJS destructure ABOVE the call. The binding list can span
            # lines, so read the statement to the left of the paren -- reading
            # only to the right finds a bare `;` and loses every name.
            for m in re.finditer(r"require\(\s*'([^']*)'\s*\)", text):
                head = text[max(0, m.start() - 400):m.start()]
                note(head.rsplit(";", 1)[-1], m.group(1), test_rel)
                # CommonJS cast AFTER the call, on the same line.
                tail = text[m.end():m.end() + 400].split("\n")[0]
                as_m = re.match(r"\s*as\s*\{([^}]*)\}", tail)
                if as_m:
                    note(as_m.group(1), m.group(1), test_rel)

                # MEMBER ACCESS on the bound module object. `const m =
                # require('../src/db/database'); m.EVALUATION_MIGRATION_COLUMNS`
                # is a real runtime read of a real export, but the name never
                # appears in an import clause, so it was reported as unpinned --
                # and tests/web/db-migration-missing-function-calling.test.ts
                # drives that module for real. Two spellings matter: the inline
                # `const m = require(...)`, and the BARE assignment `m =
                # require(...)` to a `let m!: Mod` declared earlier -- the shape
                # a jest.isolateModules() caller must use, because the binding
                # has to outlive the callback.
                stmt = head.rsplit(";", 1)[-1]
                for bind_m in re.finditer(
                        r"(?:(?:const|let|var)\s+)?"
                        r"(\{[^}]*\}|[A-Za-z_$][\w$]*)\s*(?::[^=]*)?=\s*$",
                        stmt):
                    target = bind_m.group(1)
                    if target.startswith("{"):
                        # `const { a, b } = require(...)` -- names already noted.
                        continue
                    note_members(target, m.group(1), test_rel, text[m.end():])
    return importer


def sweep(src_dir, tests_dir):
    """Return (missing_sorted, exported, importer) for the given dirs."""
    exported = collect_exports(src_dir)
    importer = collect_imports(tests_dir)
    missing = sorted(set(exported) - set(importer))
    return missing, exported, importer


def main(argv):
    src_dir = argv[0] if len(argv) > 0 else os.path.join(REPO, "src")
    tests_dir = argv[1] if len(argv) > 1 else os.path.join(REPO, "tests")
    missing, exported, importer = sweep(src_dir, tests_dir)
    for name in missing:
        print(f"NO-RUNTIME-IMPORT  {name:45s}  {exported[name]}")
    print(f"\ntotal exported={len(exported)}  no-runtime-import={len(missing)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))