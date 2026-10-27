#!/usr/bin/env bash
# scripts/resolve-tool.sh -- resolve a TOOL from the tree this script stands in.
#
# R514 (woclaw, 2026-10-28) fixed the same defect class in the sibling
# repository: `hub/scripts/r514_matrix.py` resolved its compiler and its
# runner with `npx`, and `npx` resolves a binary against the CWD's package
# tree.  MEASURED in an ISOLATED WORKTREE of the same commit:
#
#     $ npx tsc --version
#     This is not the tsc command you are looking for
#     ...                                   (exit 2)
#     $ ./node_modules/.bin/tsc --version
#     Version 5.9.3
#
# A worktree has no installed `typescript` of its own, so the driver WORKED
# in the author's checkout and could not measure ANYTHING in a checkout it
# was COPIED into.  "A script validated on exactly ONE tree is a script
# validated on exactly ONE tree" -- one level down, the TOOL rather than
# the PATH.
#
# MEASURED HERE (2026-10-28, llm-benchmark): the same class, and the
# `npx jest` case is WORSE than the `npx tsc` case, because `npx` does not
# fail when the network is available -- it DOWNLOADS:
#
#     $ npx jest --version          # in a tree with no node_modules
#     30.5.2                        # <-- fetched from the registry
#     $ ./node_modules/.bin/jest --version   # in the repo
#     29.7.0                        # <-- what package.json pins (^29)
#
# So the driver was measuring its subject with a DIFFERENT MAJOR of its
# runner than the repository pins, and the version it used was decided by
# whatever the registry served at that moment -- not by the lockfile.
#
# THE FIX: resolve the tool from the tree the driver stands in, and ASSERT
# the resolution, so a tree without a toolchain fails LOUDLY with a message
# naming the missing path, instead of silently downloading a different
# version and reporting a verdict about it.
#
# Usage:  resolve-tool.sh <tool-name> [<tool-name> ...]
# Prints one absolute path per tool, one per line, in the order requested.
# Exits 2 with a diagnostic naming every missing tool.

set -euo pipefail

# The tree this script stands in: <repo>/scripts/resolve-tool.sh -> <repo>
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# The package's own toolchain lives in the repository root's node_modules.
BIN="$REPO/node_modules/.bin"

missing=()
for tool in "$@"; do
  candidate="$BIN/$tool"
  if [ -x "$candidate" ]; then
    printf '%s\n' "$candidate"
  else
    missing+=("$candidate")
  fi
done

if [ "${#missing[@]}" -gt 0 ]; then
  {
    echo "ERROR: the tool(s) below do not exist in the tree this script stands in."
    for m in "${missing[@]}"; do
      echo "  missing: $m"
    done
    echo "This driver resolves its toolchain from the tree it lives in, so it"
    echo "measures the SAME versions the repository pins -- not whatever the"
    echo "registry serves at run time.  Run \`npm ci\` in that tree first."
  } >&2
  exit 2
fi
