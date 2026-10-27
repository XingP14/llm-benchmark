#!/usr/bin/env python3
"""
scripts/resolve_tool.py -- resolve a TOOL from the tree this script stands in.

R514 (woclaw, 2026-10-28) fixed the same defect class in the sibling
repository: `hub/scripts/r514_matrix.py` resolved its compiler and its
runner with `npx`, and `npx` resolves a binary against the CWD's package
tree.  MEASURED in an ISOLATED WORKTREE of the same commit:

    $ npx tsc --version
    This is not the tsc command you are looking for      (exit 1)
    $ ./node_modules/.bin/tsc --version
    Version 5.9.3

A worktree has no installed `typescript` of its own, so the driver WORKED
in the author's checkout and could not measure ANYTHING in a checkout it
was COPIED into.  "A script validated on exactly ONE tree is a script
validated on exactly ONE tree" -- one level down, the TOOL rather than the
PATH.

MEASURED HERE (2026-10-28, llm-benchmark): the same class, and the
`npx jest` case is WORSE than the `npx tsc` case, because `npx` does not
fail when the network is available -- it DOWNLOADS:

    $ npx jest --version                   # in a tree with no node_modules
    30.5.2                                 # <-- fetched from the registry
    $ ./node_modules/.bin/jest --version   # in the repo
    29.7.0                                 # <-- what package.json pins (^29)

So the driver was measuring its subject with a DIFFERENT MAJOR of its
runner than the repository pins, and the version it used was decided by
whatever the registry served at that moment -- not by the lockfile.

THE FIX: resolve the tool from the tree the driver stands in, and ASSERT the
resolution, so a tree without a toolchain fails LOUDLY with a message
naming the missing path, instead of silently downloading a different
version and reporting a verdict about it.

Usage:
    from resolve_tool import resolve_tool
    jest = resolve_tool("jest")
"""

import os
import sys

__all__ = ["resolve_tool", "repo_root"]


def repo_root(script_file):
    """The repository root above a script in <repo>/scripts/."""
    return os.path.dirname(os.path.dirname(os.path.abspath(script_file)))


def resolve_tool(name, repo=None):
    """Return the absolute path of `name` in the tree's own node_modules/.bin.

    Raises SystemExit with a loud diagnostic when the tool is absent, so a
    tree without a toolchain fails LOUDLY instead of scoring nothing and
    reporting a verdict.
    """
    if repo is None:
        repo = repo_root(__file__)
    # Accept a str or a Path: the drivers spell their root both ways.
    candidate = os.path.join(str(repo), "node_modules", ".bin", name)
    if not os.path.exists(candidate):
        sys.stderr.write(
            "ERROR: %s does not exist -- the tree this script stands in has "
            "no %s, so this driver cannot measure anything. Run `npm ci` in "
            "that tree first.\n" % (candidate, name)
        )
        raise SystemExit(2)
    return candidate


if __name__ == "__main__":
    # CLI form: python3 scripts/resolve_tool.py jest tsc
    repo = repo_root(__file__)
    for tool in sys.argv[1:]:
        print(resolve_tool(tool, repo))
