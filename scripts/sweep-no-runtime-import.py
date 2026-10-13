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
One shape remains invisible to this sweep, and it produces FALSE POSITIVES.
It is left reported rather than silenced, because a visible false positive
can be dismissed with evidence and a silently-dropped one cannot:

  1. TRANSITIVE drive. src/web/middleware/auth.ts exports authMiddleware,
     which is imported and registered by three ROUTE modules
     (routes/auth.ts, routes/configs.ts, routes/evaluations.ts). A test
     that imports any of those routes drives the middleware for real, but
     the middleware's name appears in no test import clause, and loading a
     module does not CALL what it exports -- so the load rule below cannot
     credit it either. This is the sweep's only remaining report and it is
     a REAL dependency with a tested behaviour; closing it needs a
     src-side reachability graph (import x -> calls y) that a test-side
     regex text cannot build. Anything else reported here should be checked
     against the module's own callers before it is treated as a gap.

MODULE-SCOPE VALUES ARE DRIVEN BY THE LOAD (added R449)
`export const` is only legal at module top level, so its initializer runs
the moment the module is evaluated -- there is no call site to reach it
and no test can drive it more "really" than loading its module. So when a
test imports ANY export of a module, every module-scope value export of
that module has been executed, and reporting it re-derives work already
done. Five of the six original reports were exactly this:
codeBenchmarks, dialogueBenchmarks, functionCallingBenchmarks,
longContextBenchmarks and multiTurnBenchmarks are module-scope const
arrays in files the suite loads at runtime.

This rule is scoped NARROWLY on purpose. It credits a value only when:
  - the module is actually resolved to a real file (so `../helpers` in the
    fixtures, which sits outside src/, still blocks), and
  - that file declares the export at module top level with `const`/`let`/
    `var` -- a `function`, `class` or `interface` needs a CALL, which a
    load does not perform, and
  - the test really loaded the module (an import clause of any of its
    exports counts), following `export ... from` chains to the defining
    file.
Arms (19), (20) and (21) are the falsifiers: they keep this from
degenerating into "credit every export of every module a test touches".

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


def exports_of(spec, test_abs, _cache={}):
    """Export names of the src module `spec` resolves to, or None if unknown.

    `test_abs` is the test file's ABSOLUTE path: specifiers are relative to the
    test file, and the fixtures this instrument is driven with live outside the
    repository, so resolving against REPO would make every lookup fail and
    silently disable the check.

    Returns None whenever the module cannot be resolved -- an unresolvable
    specifier, a barrel that star-re-exports more than one module, an alias --
    so the caller falls back to the old name-only behaviour rather than
    silently dropping a real drive.
    """
    if (spec, test_abs) in _cache:
        return _cache[(spec, test_abs)]
    result = _resolve_exports(spec, test_abs)
    _cache[(spec, test_abs)] = result
    return result


def module_scope_values(src_dir):
    """Map absolute module path -> names it exports as module-scope VALUES.

    Only `export const|let|var NAME` at module top level qualifies. An
    `export function`/`export class` is a BINDING whose body does not run at
    load, so a load cannot be evidence that it was driven -- crediting those
    would silence every callable gap in the repo (authMiddleware included).

    The anchor is the `export` keyword at column 0, not an optional indent:
    `export` is only legal at module top level in TypeScript, so an indented
    match would be a string or a nested artefact rather than a declaration.
    """
    values = {}
    decl = re.compile(
        r"^export\s+(?:declare\s+)?(const|let|var)\s+([A-Za-z_$][\w$]*)",
        re.M)
    for dp, _dn, fns in os.walk(src_dir):
        for fn in fns:
            if not fn.endswith(".ts"):
                continue
            p = os.path.normpath(os.path.join(dp, fn))
            src = open(p, encoding="utf-8").read()
            names = {m.group(2) for m in decl.finditer(src)}
            if names:
                values.setdefault(p, set()).update(names)
    return values


def defining_file(spec, test_abs):
    """Absolute path the specifier `spec` resolves to, or None.

    Follows `export ... from` chains to the DEFINING file, because a value
    declared in a.ts and re-exported by index.ts still executes when
    index.ts is loaded.

    The chain is followed THROUGH a non-src barrel, not stopped at it. A
    module that is imported is EVALUATED, and evaluating a barrel that
    imports src/a.ts evaluates a.ts -- so the answer to "what did this
    specifier load?" is still a.ts. Stopping at the first non-src segment
    (an earlier `if "src" not in cur_spec: return p`) reported the barrel
    itself and dropped the whole subtree behind it, which is the same
    transitive blindness the sweep's docstring already admits for CALLS;
    here it silently miscounts a LOAD. The cycle guard is what actually
    prevents a non-terminating walk.
    """
    cur_spec, cur_dir = spec, os.path.dirname(test_abs)
    seen = set()
    while cur_spec and cur_spec not in seen:
        seen.add(cur_spec)
        p = _resolve_path(cur_spec, cur_dir)
        if p is None:
            return None
        nxt = _reexport_target(p)
        if not nxt:
            # This IS the defining file: no chain to follow, so this is the
            # module a load evaluates. Falling out of the loop here instead
            # returned None for every ordinary module.
            return p
        cur_dir, cur_spec = os.path.dirname(p), nxt
    return None


def _resolve_path(spec, base):
    for cand in (spec, spec + ".ts", os.path.join(spec, "index.ts")):
        p = os.path.normpath(os.path.join(base, cand))
        if os.path.isfile(p):
            return p
    return None


def _reexport_target(path):
    """The specifier `path` forwards its exports from, or None.

    Both forwarding forms count, and they are NOT interchangeable:
      export * from './x'            -- forwards everything
      export { A, B } from './x'     -- forwards a named subset
    Only handling the first left `export { VIA_BARREL } from './a'` resolving
    to index.ts, whose own text has no `export const`, so the value in the
    defining file was never credited. A barrel that re-exports a subset is
    how the real repo reaches several benchmark arrays.
    """
    src = open(path, encoding="utf-8").read()
    for pat in (r"export\s+\*\s+from\s+'([^']*)'",
                r"export\s*\{[^}]*\}\s*from\s+'([^']*)'"):
        m = re.search(pat, src)
        if m:
            return m.group(1)
    return None


def _resolve_exports(spec, test_abs):
    base = os.path.dirname(test_abs)
    for cand in (spec, spec + ".ts", os.path.join(spec, "index.ts")):
        p = os.path.normpath(os.path.join(base, cand))
        if not os.path.isfile(p):
            continue
        src = open(p, encoding="utf-8").read()
        names = set()
        for m in re.finditer(
                r"export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)",
                src):
            names.add(m.group(1))
        for m in re.finditer(r"export\s*\{([^}]*)\}", src):
            for part in m.group(1).split(","):
                part = part.strip().split(" as ")[-1].strip()
                if re.fullmatch(r"[A-Za-z_$][\w$]*", part or ""):
                    names.add(part)
        if re.search(r"export\s+\*\s+from", src):
            # A star re-export makes this module's own name set incomplete.
            return None
        return names
    return None


def strip_comments(text):
    """Blank out `//` and block comments, preserving every offset and newline.

    Comments are REPLACED BY SPACES rather than deleted, so every match offset
    computed on the stripped text is also valid on the original -- the member
    windows and the binding pre-pass are offset-addressed and would silently
    misalign if the two texts had different lengths.

    This is not cosmetic. A comment in these suites routinely contains the
    literal shapes the sweep parses: `const { assertOkResponse } =` inside a
    // line, or a `{role:'user'}` inside a block comment. Reading either as a
    binding credits whatever name the pattern happens to stop on, and because
    a destructure is `note()`d rather than merely ignored, that turns a
    comment into a CLAIM that a symbol is pinned. tests/adapter.test.ts lost
    defaultPing that way -- it is destructured and driven for real on line 646,
    but a comment above it won the match.

    String literals are tracked so that a URL ('https://...') does not open a
    comment, and a template literal is treated as a plain string: a `//` inside
    one belongs to the string for this sweep's purposes, and a real comment
    after its close is still stripped.
    """
    out = []
    i, n = 0, len(text)
    while i < n:
        c = text[i]
        if c == "/" and i + 1 < n and text[i + 1] == "/":
            while i < n and text[i] != "\n":
                out.append(" ")
                i += 1
        elif c == "/" and i + 1 < n and text[i + 1] == "*":
            out.append("  ")
            i += 2
            while i < n and not (text[i] == "*" and i + 1 < n and text[i + 1] == "/"):
                out.append("\n" if text[i] == "\n" else " ")
                i += 1
            if i < n:                       # closing */
                out.append("  ")
                i += 2
            else:                           # unterminated: consume the rest
                out.append("  ")
        elif c in "'\"`":
            q = c
            out.append(c)
            i += 1
            while i < n:
                if text[i] == "\\":
                    out.append(text[i:i + 2])
                    i += 2
                    continue
                if text[i] == q:
                    out.append(q)
                    i += 1
                    break
                out.append("\n" if text[i] == "\n" else text[i])
                i += 1
        else:
            out.append(c)
            i += 1
    return "".join(out)


# Only a clause that is ENTIRELY type-only is erased. The brace-list
# alternative is deliberately absent: `import { type A, B }` is ONE clause whose
# B is a real runtime import, so skipping the whole clause would hide a value
# that is genuinely covered -- the direction that sends the next tick to rebuild
# work that is already done (arms 26/27).
_TYPE_ONLY_CLAUSE = re.compile(r"^\s*(?:type\b|typeof\b)")
_INLINE_TYPE_SPEC = re.compile(r"\btype\s+[A-Za-z_$][\w$]*\s*(?:,|as\s|\}|\Z)")


def _without_type_specifiers(clause):
    """Blank `type` specifiers out of an import clause.

    `import { type A, B } from './m'` is legal TypeScript and A is erased while
    B is a real runtime import. Dropping the whole clause would over-correct
    (arm 26) and crediting A would over-report coverage of a type. So the
    erased specifier is REPLACED BY SPACES, which leaves the name invisible to
    the identifier scan note() runs over the clause.

    Arm 27 is the falsifier for a stronger claim this note does not make. It is
    MEASURED, not assumed: replacing the blanking with deletion (M3) leaves all
    28 arms green, because the clause is only ever scanned for identifiers and
    never sliced, so an offset shift here changes nothing. The length-preserving
    form is belt-and-braces and NOT load-bearing; M3 is a surviving mutation
    explained by artefact (R194), not a suite gap.
    """
    out, last = [], 0
    for m in _INLINE_TYPE_SPEC.finditer(clause):
        out.append(clause[last:m.start()])
        out.append(" " * (m.end() - m.start()))
        last = m.end()
    out.append(clause[last:])
    return "".join(out)


def _starts_binding(prefix):
    """True when text immediately before a candidate can be a binding start.

    A binding is either the first thing in its statement (`const m = ...`, or
    `m = ...` with nothing ahead) or an element of a binding list, so what may
    precede it is a statement start, a `const`/`let`/`var` keyword, or one of
    the separators `,` `{` `;` and a newline.

    `f(a, b)` ends with `b`, which reaches the end of the clause and would
    otherwise be credited as an imported name; there the preceding text ends
    with `(`, so this returns False.
    """
    if not prefix:
        return True
    return bool(re.search(
            r"(?:^|[;\n{,]|\b(?:const|let|var)\b\s*)$", prefix))


def collect_imports(tests_dir, loaded_modules=None):
    """Map imported symbol name -> set of test files that import it.

    `loaded_modules` is an optional set of absolute module paths; every
    module-scope VALUE export of those modules is credited to the module
    itself, because loading a module evaluates its top-level initializers.
    The set is accumulated here (every specifier a test loads, from any
    clause shape) rather than trusted from a caller, so an import shape the
    note() rules miss still counts as a load.
    """
    importer = {}
    if loaded_modules is None:
        loaded_modules = set()

    def note(clause, spec, test_rel, test_abs):
        # Record the LOAD before the containment gate below. The load rule asks
        # "did evaluating this specifier run a module-scope initializer?", and
        # a NON-src barrel that forwards into src answers YES: importing
        # '../support' evaluates support/index.ts, which imports src/a.ts, so
        # a.ts is loaded too. Deferring this call to after the gate discarded
        # the walk's result and left the guard in defining_file() deciding
        # nothing -- R449 mutation M3 survived the suite for that reason.
        f = defining_file(spec, test_abs)
        if f:
            loaded_modules.add(f)
        # Only src/ imports count as evidence for the NAME. A symbol pulled
        # from ../types or a test helper is not evidence that its src
        # definition is driven.
        if "src" not in spec:
            return
        for n in re.finditer(r"[A-Za-z_$][\w$]*", clause):
            importer.setdefault(n.group(0), set()).add(test_rel)

    def note_binding(stmt, spec, test_rel, test_abs):
        """Credit only the names the BINDING PATTERN of `stmt` introduces.

        The text to the left of a require's `=` is not always the binding: a
        require can follow an unterminated statement (`const x = f(a, b)\\n`
        with no semicolon), and then the raw clause carries `a` and `b` as
        ordinary identifiers. Crediting those marks symbols as imported that
        nothing imports -- a false NEGATIVE, hiding the gap. So take the
        binding shape when the clause IS one (including a multi-line brace
        list), and otherwise take nothing rather than everything.

        The binding is whatever sits immediately LEFT of the `=`, so the
        pattern is anchored at the END of that text and read BACKWARDS to the
        start of the one construct it names. Slicing FORWARD from the start of
        the clause instead cannot work: `const { T1 } =` has its `{` anywhere
        in the clause, so a forward slice that keeps everything from the first
        `{` drags in every identifier from the unterminated statement ahead of
        it, which is the overreach this function exists to prevent.
        """
        left = stmt.rsplit("=", 1)[0] if "=" in stmt else ""
        # `[^{}]*`, not `[^}]*`: a binding list contains no nested braces, and
        # the permissive form matches from an EARLIER `{` all the way to the
        # one next to the `=` -- `describe('defaultPing ...', () => {\n ...\n
        # const { defaultPing }` matched as a single "binding", so the guard
        # below rejected it and tests/adapter.test.ts lost defaultPing, which
        # is destructured and driven for real on line 646.
        cands = list(re.finditer(
                r"(\{[^{}]*\}|[A-Za-z_$][\w$]*)\s*(?::[^=]*?)?\s*$", left))
        # Every candidate is gated by the SAME test, so the filter IS the
        # guard. R448 mutation M6 survived the first version of this line
        # because a backstop re-check sat below it and this version kept both:
        # two copies of one rule, the second unreachable by construction. Take
        # the LAST surviving candidate -- the one nearest the `=`, and so the
        # only one that can be the binding -- and drop the backstop.
        cands = [c for c in cands if _starts_binding(left[:c.start()])]
        if not cands:
            return
        bind = cands[-1]
        # Credit the MATCHED BINDING, never `left`. `left` still carries every
        # identifier of the unterminated statement ahead of it, so handing it
        # to note() credits `alpha`, `beta` and `unrelated` as imports of the
        # required module and the sweep silently loses those gaps. Validating
        # the binding and then crediting the raw clause is the same defect one
        # layer up: the check passes and the overreach ships anyway.
        note(bind.group(1), spec, test_rel, test_abs)

    def note_members(target, spec, test_rel, rest, test_abs):
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
        chunks = rest if isinstance(rest, list) else [rest]
        # A name counts as pinned by this read ONLY if the module that
        # `spec` resolves to actually exports it. Without this the sweep keys
        # purely on the NAME, so a read off a module that does not export it
        # still marks it pinned -- a false NEGATIVE that hides the very gap
        # the sweep exists to report.
        own = exports_of(spec, test_abs)
        f = defining_file(spec, test_abs)
        if f:
            # A member read means the module was loaded whatever the binding
            # rules decided, so the load rule applies even for the bare
            # `m = require(...)` shape whose binding arm bails out.
            loaded_modules.add(f)
        for chunk in chunks:
            for prop in re.finditer(rf"\b{re.escape(target)}\.(\w+)", chunk):
                if own is None or prop.group(1) in own:
                    importer.setdefault(prop.group(1), set()).add(test_rel)
            for prop in re.finditer(rf"\b{re.escape(target)}\['(\w+)'\]", chunk):
                if own is None or prop.group(1) in own:
                    importer.setdefault(prop.group(1), set()).add(test_rel)

    for dp, _dn, fns in os.walk(tests_dir):
        for fn in fns:
            if not fn.endswith(".ts"):
                continue
            p = os.path.join(dp, fn)
            text = open(p, encoding="utf-8").read()
            # Same LENGTH, different content: every offset below is computed on
            # `text` and used to slice it, so the stripped copy is what the
            # patterns must read while `text` stays the addressable original.
            parse = strip_comments(text)
            test_rel = os.path.relpath(p, REPO)

            # PRE-PASS: every `X = require('spec')` in this file, with the
            # offset of the require() itself. Needed before any member read is
            # attributed, because a read belongs to the binding that was LIVE
            # at its own offset, not to whichever require() a forward window
            # happens to start from.
            bindings = [(bm.group(1), bm.start(), bm.group(2)) for bm in re.finditer(
                r"(?:(?:const|let|var)\s+)?([A-Za-z_$][\w$]*)\s*"
                r"(?::[^=]*?)?=\s*require\s*\(\s*'([^']*)'\s*\)", parse)]

            # ES import, possibly spread over several lines.
            for m in re.finditer(r"import\s+([\s\S]*?)\s+from\s+'([^']*)'", parse):
                clause = m.group(1)
                # `import type` IS ERASED. TypeScript emits no require and no
                # load for it, so the module is never evaluated and its
                # module-scope initializer never runs. Crediting the LOAD here
                # would let an erased clause satisfy the load rule and silence
                # every value export of a module that only type-tests reach.
                if _TYPE_ONLY_CLAUSE.match(clause):
                    continue
                note(_without_type_specifiers(clause), m.group(2), test_rel, p)

            # CommonJS destructure ABOVE the call. The binding list can span
            # lines, so read the statement to the left of the paren -- reading
            # only to the right finds a bare `;` and loses every name.
            #
            # What is handed to note() must be the BINDING PATTERN -- the text
            # LEFT of the `=`, and only once it parses as one. Handing over the
            # raw statement instead sweeps in every identifier that happens to
            # sit before it, so a member read `m.SECRET_ALPHA;` on the line
            # above a rebinding require is recorded as if it were an imported
            # NAME, which hides the gap the sweep exists to report. That is
            # why the clause is validated rather than merely sliced.
            for m in re.finditer(r"require\(\s*'([^']*)'\s*\)", parse):
                head = parse[max(0, m.start() - 400):m.start()]
                stmt = head.rsplit(";", 1)[-1]
                note_binding(stmt, m.group(1), test_rel, p)
                # CommonJS cast AFTER the call, on the same line.
                tail = parse[m.end():m.end() + 400].split("\n")[0]
                as_m = re.match(r"\s*as\s*\{([^}]*)\}", tail)
                if as_m:
                    note(as_m.group(1), m.group(1), test_rel, p)

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
                    note_members(target, m.group(1), test_rel,
                                 member_window(parse, m.end(), target, bindings),
                                 p)
    return importer


def member_window(text, start, target, bindings):
    """The text in which `target.<prop>` still refers to the module just bound.

    A member read only counts for the require() whose binding is the LIVE one
    at the read's own offset. Forward-scanning from the require() gets this
    wrong: an unbounded window reads past a REBIND (`m = require('./b')` after
    `m = require('./a')`) and credits `m.x` to './a' when it is really './b' --
    a FALSE NEGATIVE, the dangerous direction, because the genuine gap on
    './a' is then reported as pinned and the sweep hides the hole it exists to
    find. So bound the window at the NEXT rebind of `target` anywhere in the
    file, and read only up to there.
    """
    positions = sorted(p for t, p, _s in bindings if t == target)
    later = [p for p in positions if p > start]
    end = later[0] if later else len(text)
    return text[start:end]


def sweep(src_dir, tests_dir):
    """Return (missing_sorted, exported, importer) for the given dirs."""
    exported = collect_exports(src_dir)
    loaded = set()
    importer = collect_imports(tests_dir, loaded)
    # THE LOAD RULE. A module-scope value runs when its module is evaluated,
    # so a test that loaded the module has executed it. Applied AFTER the
    # import scan so it cannot mask an import-shape regression, and keyed on
    # resolved paths so a module nothing loads credits nothing.
    for path, names in module_scope_values(src_dir).items():
        if path in loaded:
            for n in names:
                importer.setdefault(n, set()).add(os.path.relpath(path, REPO))
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