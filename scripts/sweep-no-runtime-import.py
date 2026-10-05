#!/usr/bin/env python3
"""List src exported symbols that NO test file imports at runtime.

WHY THIS EXISTS
A helper is "pinned" by a test that drives it for real. A test that only
greps the source text is not coverage: the text it reads can be deleted or
moved and the suite stays green. So the question this answers is -- which
exported symbols are backed ONLY by source-text assertions, or by nothing?

WHAT WENT WRONG IN THE FIRST VERSION (keep this in mind before editing)
The original sweep matched only ES `import ... from '...src/...'`. The runtime
suites added later load the real module through CommonJS, in two shapes:

    const { a } = require('../src/x')          # name ABOVE the paren
    const m  = require('../src/index') as { a }  # name AFTER it

Handling neither reported 4 shipped runtime suites as unpinned, and handling
only one still misreports the other. A sweep that over-reports is worse than
no sweep: it points the next tick at work that is already done. So every
import shape has to be recognized here, and tests/sweep-no-runtime-import.test.ts
pins them.

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