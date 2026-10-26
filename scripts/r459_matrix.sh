#!/usr/bin/env bash
# r459 mutation matrix -- FAILS LOUD if the fix is not in place (pitfall R456-1).
set -uo pipefail
cd "$(dirname "$0")/.."
S=scripts/sweep-no-runtime-import.py
BASE=$(md5sum "$S" | cut -d' ' -f1)
echo "baseline md5 $BASE"

# R507 (2026-10-27): THE RESTORE PATH WAS A LANEMINE.
#
# This driver used to restore the mutated source with
#     cp /root/.hermes/cache/scratch/r459_fix.py "$S"
# -- a file in the PRUNED SCRATCH DIRECTORY, not in the repo.  MEASURED
# 2026-10-27: that file no longer exists (scratch entries idle for 24h are
# pruned), so `cp` fails with rc=1, the restore is a NO-OP, and the tracked
# source scripts/sweep-no-runtime-import.py is LEFT MUTATED (md5 d024ffb0...
# vs baseline b2928799...).  The md5 check at the bottom of this script runs
# AFTER the failed restore, so it reports the damage only after doing it.
#
# The fix: snapshot into the REPO (a path this script owns and creates), and
# restore from THAT snapshot.  The snapshot is created fresh on every run, so
# pruning cannot touch it.
#
# The trap RESTORES, it does not merely delete: a driver that dies between the
# injection and the restore (SIGTERM, a failed `timeout`, an aborted run)
# must still put the source back.  Deleting the snapshot on exit without
# restoring would leave the mutant in place AND destroy the only copy of the
# pristine source.  (R131: a cron tick can be killed mid-step.)
SNAP="scripts/.r459_snapshot.py"
cp "$S" "$SNAP"
restore() { cp "$SNAP" "$S"; }
cleanup() {
  # Restore FIRST, then remove the snapshot.  Order is load-bearing: a
  # restore that never ran is the exact failure this whole change exists to
  # remove.
  cp "$SNAP" "$S" 2>/dev/null || true
  python3 -c "import os,sys; p=sys.argv[1]; os.path.exists(p) and os.remove(p)" "$SNAP"
}
trap cleanup EXIT

run_arm() {  # $1 = mutant label
  timeout 300 npx jest tests/sweep-no-runtime-import.test.ts --runInBand \
    -t 'a regex literal holding a quote' 2>&1 | grep -E "^Tests:" || echo "TESTS-LINE-ABSENT"
}

report() {  # $1 = label, $2 = tests line
  local verdict
  case "$2" in
    *"1 failed"*) verdict="KILLED" ;;
    *"1 passed"*)  verdict="SURVIVED" ;;
    *)             verdict="ERROR" ;;
  esac
  printf '%-10s %s   %s\n' "$1" "$verdict" "$2"
}

# report_injected() -- R507 (2026-10-27).  A mutation that was NEVER APPLIED
# must never be reported as SURVIVED.
#
# The old driver called `report` unconditionally after each injection.  The
# injection blocks `assert needle in s`, so a stale needle aborted the python
# heredoc with a traceback, the SOURCE WAS NEVER TOUCHED, the suite stayed
# green -- and the driver printed "SURVIVED".  MEASURED 2026-10-27: the M3
# needle had drifted from the source (the template branch now appends the
# literal backtick `out.append("`")` where the needle still expected
# `out.append(q)`), so M3 was reported SURVIVED while it had never been
# injected at all.  A mutation that did not happen is NOT-INJECTED, and
# NOT-INJECTED is not a verdict about the code under test.
#
# The check is by BYTES: the md5 of the mutated file must differ from the
# baseline.  That catches both a stale needle AND a `str.replace` that was a
# no-op (R456-10c).
report_injected() {  # $1 = label
  local now after
  now=$(md5sum "$S" | cut -d' ' -f1)
  if [ "$now" = "$BASE" ]; then
    printf '%-10s %s   %s\n' "$1" "NOT-INJECTED" "source md5 unchanged ($now) -- the mutation never happened"
    return 0
  fi
  report "$1" "$(run_arm)"
}

# ---- baseline (must be GREEN) ----
report "BASELINE" "$(run_arm)"

# ---- M1: revert the line-bound on the quote scan (the shipped defect) ----
python3 - <<'PY'
import re
p='scripts/sweep-no-runtime-import.py'
s=open(p).read()
needle="""                if text[i] == "\\n":
                    break
                out.append(text[i])
                i += 1
            if not closed:"""
assert needle in s, "M1 needle absent"
s=s.replace(needle,"""                out.append("\\n" if text[i] == "\\n" else text[i])
                i += 1
            if not closed:""")
open(p,'w').write(s)
PY
echo "M1 md5 $(md5sum "$S" | cut -d' ' -f1)"
report_injected "M1"
restore

# ---- M2: delete the whole no-close recovery branch (drop the byte, shift offsets) ----
python3 - <<'PY'
p='scripts/sweep-no-runtime-import.py'
s=open(p).read()
needle="""            if not closed:
                # Unterminated before the line ended: the quote was never a
                # string, so it stays ordinary text and the scan resumes from
                # the next character. Dropping it entirely would delete a byte
                # and shift every offset the member windows are computed on.
                out[-1] = c
"""
assert needle in s, "M2 needle absent"
s=s.replace(needle,"")
open(p,'w').write(s)
PY
echo "M2 md5 $(md5sum "$S" | cut -d' ' -f1)"
report_injected "M2"
restore

# ---- M3: bound the BACKTICK scan to one line too (over-correction) ----
# MEASURED: this SURVIVES the whole suite (45/45), including arm 43's
# multi-line template fixture. Arm 43's template is written with real newlines
# and the bounded scan still recovers `fake` because the anchor `^export` needs
# column 0 and the swallowed tail never produces one. An UNEXAMINED survivor is
# the most expensive thing a matrix emits, so this one is recorded as a
# surviving mutant with its scope stated, not quietly dropped. Fixing it would
# need a fixture whose template content is anchored at column 0.
#
# R507 (2026-10-27): the needle BELOW HAD DRIFTED from the source.  The
# template branch now appends the LITERAL backtick (`out.append("`")`) where
# the needle still expected the VARIABLE (`out.append(q)`), so the assert
# aborted the heredoc, the source was never touched, and the driver printed
# "M3 SURVIVED" -- a verdict about a mutation that had never happened.  The
# needle is re-anchored to the CURRENT source, and `report_injected` now
# refuses to call an uninjected mutation SURVIVED.
python3 - <<'PY'
p='scripts/sweep-no-runtime-import.py'
s=open(p).read()
needle="""            q = c
            out.append(c)
            i += 1
            while i < n:
                if text[i] == "\\\\":
                    out.append(text[i:i + 2])
                    i += 2
                    continue
                if text[i] == q:
                    out.append("`")
                    i += 1
                    break
                out.append("\\n" if text[i] == "\\n" else text[i])
                i += 1"""
assert needle in s, "M3 needle absent"
s=s.replace(needle,"""            q = c
            out.append(c)
            i += 1
            while i < n:
                if text[i] == "\\\\":
                    out.append(text[i:i + 2])
                    i += 2
                    continue
                if text[i] == q:
                    out.append("`")
                    i += 1
                    break
                if text[i] == "\\n":
                    break
                out.append(text[i])
                i += 1""")
open(p,'w').write(s)
PY
echo "M3 md5 $(md5sum "$S" | cut -d' ' -f1)"
report_injected "M3"
restore

AFTER=$(md5sum "$S" | cut -d' ' -f1)
echo "restored md5 $AFTER"
[ "$AFTER" = "$BASE" ] || { echo "WARNING: source NOT restored"; exit 1; }
