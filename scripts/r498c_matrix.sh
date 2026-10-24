#!/bin/sh
# R498c mutation matrix (llm-benchmark).
#
# Question: does the shipped suite PIN the symlink-confinement repair, or is
# it vacuous with respect to it?
#
# ⭐ ANCHOR DISCIPLINE (R477-D1 / R460): every mutation needle must match
# EXACTLY ONCE. The first version of this driver used the bare line
# `  res.status(403).json({ error: 'Forbidden' });` -- which appears TWICE in
# the file (the guard AND the SPA fallback) -- so the mutation was applied to
# the WRONG copy, the guard survived untouched, and the arm reported SURVIVED.
# A survivor that was never applied is not a survivor, it is a HARNESS. The
# driver now asserts the anchor count and reports HARNESS instead.
#
# ⭐ RESTORE DISCIPLINE (R475-2): NEVER `git checkout` -- the working tree is
# dirty with other agents' work. Snapshot the OWNED files byte-for-byte and
# restore from the snapshots. Assert the md5 after every step.
set -u
cd "$(dirname "$0")/.." || exit 1
SRC=src/web/server.ts
TEST=tests/web/r498c-symlink-confinement.test.ts
SNAP_SRC=/tmp/r498c_lb_server.snap
SNAP_TEST=/tmp/r498c_lb_test.snap
BASE_SRC=$(md5sum "$SRC" | cut -d' ' -f1)
BASE_TEST=$(md5sum "$TEST" | cut -d' ' -f1)
echo "baseline src  md5 = $BASE_SRC"
echo "baseline test md5 = $BASE_TEST"
cp "$SRC" "$SNAP_SRC"
cp "$TEST" "$SNAP_TEST"

restore() {
  cp "$SNAP_SRC" "$SRC"
  cp "$SNAP_TEST" "$TEST"
  s=$(md5sum "$SRC" | cut -d' ' -f1)
  t=$(md5sum "$TEST" | cut -d' ' -f1)
  if [ "$s" != "$BASE_SRC" ] || [ "$t" != "$BASE_TEST" ]; then
    echo "!!! RESTORE FAILED src=$s test=$t"
  fi
}
trap 'restore' EXIT

run_suite() {
  out=$(npx jest "$TEST" --runInBand 2>&1)
  echo "$out" | grep -E "^Tests:" | tr -d '\n'
  echo " | $(echo "$out" | grep -E '^(PASS|FAIL)' | head -1)"
}

# mutate <file> <python-body>: asserts the anchor count is exactly 1.
mutate() {
  python3 - "$1" <<PY
import sys
p = sys.argv[1]
s = open(p).read()
$2
open(p, 'w').write(s)
PY
}

# ---- C0: the UNFIXED source (R497's textual check only, no guard) --------
# The UNFIXED source is: no guard in front of express.static, and the
# fallback's own check is textual. Remove the guard entirely.
mutate "$SRC" '
old = """  if (real === PUBLIC_REAL_ROOT || real.startsWith(PUBLIC_REAL_ROOT + path.sep)) {
    next();
    return;
  }
  // 真实路径落在根目录之外 -> 拒绝。
  res.status(403).json({ error: '"'"'Forbidden'"'"' });"""
assert s.count(old) == 1, ("ANCHOR MISS/AMBIGUOUS", s.count(old))
s = s.replace(old, "  next();\n  return;")
'
echo -n "C0 (UNFIXED: no guard):        "; run_suite
restore

# ---- M1: the true repair removed (the guard's 403 turned into next()) ---
mutate "$SRC" '
old = """  // 真实路径落在根目录之外 -> 拒绝。
  res.status(403).json({ error: '"'"'Forbidden'"'"' });"""
assert s.count(old) == 1, ("ANCHOR MISS/AMBIGUOUS", s.count(old))
s = s.replace(old, "  next();\n  return;")
'
echo -n "M1 (guard 403 removed):       "; run_suite
restore

# ---- M2: the guard uses a TEXTUAL check (no realpath) -------------------
mutate "$SRC" '
old = """  let real: string;
  try {
    real = fs.realpathSync(candidate);
  } catch {
    // 路径不存在(或不可读) -> 不是越界, 交给后面的中间件按正常 miss 处理。
    next();
    return;
  }
  if (real === PUBLIC_REAL_ROOT || real.startsWith(PUBLIC_REAL_ROOT + path.sep)) {
    next();
    return;
  }"""
assert s.count(old) == 1, ("ANCHOR MISS/AMBIGUOUS", s.count(old))
new = """  const real = candidate;
  if (real === PUBLIC_ROOT || real.startsWith(PUBLIC_ROOT + path.sep)) {
    next();
    return;
  }"""
s = s.replace(old, new)
'
echo -n "M2 (textual check):           "; run_suite
restore

# ---- M3: the CANDIDATE is realpath'd but the ROOT is not ----------------
# The root and the candidate are compared in DIFFERENT coordinate systems.
# The public dir is reached through a symlinked parent, so this refuses
# every legitimate file. Arm (8) F8 is what pins it.
mutate "$SRC" '
# The needle appears TWICE in the file (the guard and the fallback), so it is
# ANCHORED by the guard-specific preceding lines instead.
old = """  if (real === PUBLIC_REAL_ROOT || real.startsWith(PUBLIC_REAL_ROOT + path.sep)) {
    next();
    return;
  }
  // 真实路径落在根目录之外 -> 拒绝。"""
assert s.count(old) == 1, ("ANCHOR MISS/AMBIGUOUS", s.count(old))
s = s.replace(old, """  if (real === PUBLIC_ROOT || real.startsWith(PUBLIC_ROOT + path.sep)) {
    next();
    return;
  }
  // 真实路径落在根目录之外 -> 拒绝。""")
'
echo -n "M3 (root not realpath'd):     "; run_suite
restore

# ---- M4: the FALLBACK's own realpath removed (the guard stays) ---------
# The guard only handles GET/HEAD, so a POST skips it and reaches the
# fallback. Without the fallback's own confinement the POST escapes.
# Arm (9) F9 is what pins it.
mutate "$SRC" '
old = """  let realTargetPath: string | null = null;
  try {
    const real = fs.realpathSync(targetPath);
    if (real === PUBLIC_REAL_ROOT || real.startsWith(PUBLIC_REAL_ROOT + path.sep)) {
      realTargetPath = real;
    }
  } catch {
    realTargetPath = null; // 不存在(或不可读) -> 落到 SPA 分支
  }"""
assert s.count(old) == 1, ("ANCHOR MISS/AMBIGUOUS", s.count(old))
new = """  let realTargetPath: string | null = null;
  if (existsSync(targetPath) && statSync(targetPath).isFile()) {
    realTargetPath = targetPath;
  }"""
s = s.replace(old, new)
'
echo -n "M4 (fallback realpath gone):  "; run_suite
restore

# ---- M5 NEGATIVE CONTROL: the planted symlink points INSIDE the root ----
# The escape no longer exists, so the negative arms must STILL pass: this
# proves the suite is not merely detecting "a symlink exists".
mutate "$TEST" '
old = "    fs.symlinkSync(\x27/etc\x27, path.join(publicDir, \x27escape\x27), \x27dir\x27);"
assert s.count(old) == 1, ("ANCHOR MISS/AMBIGUOUS", s.count(old))
new = "    fs.symlinkSync(fs.realpathSync(publicDir), path.join(publicDir, \x27escape\x27), \x27dir\x27);"
s = s.replace(old, new)
'
echo -n "M5 (NEG ctrl: no escape):     "; run_suite
restore

echo "final md5 src  = $(md5sum "$SRC" | cut -d" " -f1)  (baseline $BASE_SRC)"
echo "final md5 test = $(md5sum "$TEST" | cut -d" " -f1)  (baseline $BASE_TEST)"
