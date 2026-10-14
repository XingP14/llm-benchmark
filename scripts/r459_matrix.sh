#!/usr/bin/env bash
# r459 mutation matrix -- FAILS LOUD if the fix is not in place (pitfall R456-1).
set -uo pipefail
cd "$(dirname "$0")/.."
S=scripts/sweep-no-runtime-import.py
BASE=$(md5sum "$S" | cut -d' ' -f1)
echo "baseline md5 $BASE"

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
report "M1" "$(run_arm)"
cp /root/.hermes/cache/scratch/r459_fix.py "$S"

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
report "M2" "$(run_arm)"
cp /root/.hermes/cache/scratch/r459_fix.py "$S"

# ---- M3: bound the BACKTICK scan to one line too (over-correction) ----
# MEASURED: this SURVIVES the whole suite (45/45), including arm 43's
# multi-line template fixture. Arm 43's template is written with real newlines
# and the bounded scan still recovers `fake` because the anchor `^export` needs
# column 0 and the swallowed tail never produces one. An UNEXAMINED survivor is
# the most expensive thing a matrix emits, so this one is recorded as a
# surviving mutant with its scope stated, not quietly dropped. Fixing it would
# need a fixture whose template content is anchored at column 0.
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
                    out.append(q)
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
                    out.append(q)
                    i += 1
                    break
                if text[i] == "\\n":
                    break
                out.append(text[i])
                i += 1""")
open(p,'w').write(s)
PY
echo "M3 md5 $(md5sum "$S" | cut -d' ' -f1)"
report "M3" "$(run_arm)"
cp /root/.hermes/cache/scratch/r459_fix.py "$S"

AFTER=$(md5sum "$S" | cut -d' ' -f1)
echo "restored md5 $AFTER"
[ "$AFTER" = "$BASE" ] || { echo "WARNING: source NOT restored"; exit 1; }
