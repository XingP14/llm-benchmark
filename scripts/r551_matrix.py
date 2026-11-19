#!/usr/bin/env python3
"""
R551 mutation matrix -- the OPERATOR-CONFIG plane.

CONTROL STATE ON THE DEFECTIVE TREE (must be asserted, not inferred):
    A, A2, B, B2, C, C2, D, D2, E, E2, E3, F, G  ALL GREEN.

House style (shared with R535 / R537 / R539 / R546 / R548): every arm PINS
the observed defective behaviour, so the suite is GREEN on the defective
tree and a REPAIR flips the corresponding arm RED.  That is the kill signal.
(This repo's CI runs the WHOLE jest suite, so a suite that is RED on the
defective tree would turn the release gate RED -- a CI gate and a defect
detector are different instruments.)

The matrix's question for every mutant is exactly one:
    "did the set of RED arms CHANGE?"

ARMS (mutants):
    M1  THE REAL REPAIR #1 -- the evaluator honours `concurrency`.  The
        model loop is bounded by the declared value instead of running every
        model at once.  Expected: A flips RED (something now reads the
        field) and B2 flips RED (the observed peak in-flight count now
        follows the knob).  B stays GREEN -- with a SINGLE model a pool of
        1 and a pool of 99 give the same result, so B (which uses one
        model) is not the arm that detects this repair; B2 is.
        => KILLED.
    M2  THE REAL REPAIR #2 -- the evaluator honours `runs`.  The per-question
        loop is repeated `runs` times.  Expected: A2 flips RED (something
        now reads the field), C flips RED (five runs cost more than one) and
        G flips RED (a run WITH `runs: 9` now publishes a different report
        from a run without it).
        => KILLED.
    M3  THE REAL REPAIR #3 -- `ModelConfig.params` reaches the outbound
        body.  Expected: D flips RED (something now reads `params`) and C2
        flips RED (the body is no longer the fixed 4 fields).
        => KILLED.
    M4  THE REAL REPAIR #4 -- `companion_tools` is READ.  Expected: D2 flips
        RED and E3 flips RED (E3 pins "declared, shipped, asserted AND
        unread", so a reader breaks it too).
        => KILLED.
    M5  A NEGATIVE CONTROL -- an inert comment.  Expected: the control state
        is UNCHANGED (all 13 GREEN).  => NEG-CONTROL PASS.
    M6  A SECOND NEGATIVE CONTROL, in a DIFFERENT file (a comment in the
        reporter).  It must also leave the control state UNCHANGED, which
        proves the matrix does not report RED for anything it touches.
        => NEG-CONTROL PASS.
    M7  A NEIGHBOUR FIX that is NOT this suite's subject: the CSV report
        gains a `sample_size` column (a different plane -- the published
        artifact's shape).  Expected: NO arm flips; the suite pins the
        operator-config plane, not the report shape.  It must SURVIVE, and
        the driver records why (R512-6: a scoped survivor is recorded, not
        smoothed).

NOT-INJECTED / HARNESS buckets are separate and are reported, never
silently folded into a verdict (R507 / R489 / R530 discipline).  A mutant
that does not COMPILE is a HARNESS, never a kill.

The driver snapshots the bytes AND the mtime of every file it touches, and
restores both on EVERY exit path, because a byte-restore that bumps the
mtime turns a mtime-based staleness guard RED (R535 / R546 / R548 driver
note).

It also PRE-FLIGHTS the tree: if an owned file already differs from HEAD
before the matrix starts, the matrix refuses to run and says so.  A matrix
that measures a dirty tree reports a verdict about the dirt (this round's
own first run did exactly that: a killed run left a mutant in the tree and
the next run reported ARMS_MISSING against it).
"""

import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime


def _resolve_tool(name):
    """Resolve a tool from the TREE this script stands in (never `npx`).

    R514/R517/R548: `npx` DOWNLOADS a tool, so a driver can measure with a
    DIFFERENT MAJOR of its runner than the repository pins.
    """
    import importlib.util

    here = os.path.dirname(os.path.abspath(__file__))
    resolver = os.path.join(here, 'resolve_tool.py')
    if not os.path.exists(resolver):
        raise SystemExit(
            '%s does not exist -- this driver resolves its toolchain from the '
            'tree it stands in, and the resolver must sit beside it.' % resolver
        )
    spec = importlib.util.spec_from_file_location('_resolve_tool_mod', resolver)
    if spec is None or spec.loader is None:
        raise SystemExit('cannot load the resolver at %s' % resolver)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.resolve_tool(name)


REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SUITE = 'tests/r551-operator-config-plane.test.ts'
EVALUATOR = 'src/core/evaluator.ts'
ADAPTER = 'src/adapters/adapter.ts'
OPENAI = 'src/adapters/openai-adapter.ts'
REPORTER = 'src/core/reporter.ts'

OWNED = [EVALUATOR, ADAPTER, OPENAI, REPORTER]

# The arms, and what each one pins.
ARMS = {
    'A': 'no live code reads `concurrency`',
    'A2': 'no live code reads `runs`',
    'B': 'concurrency 1 and 99 give the same published output',
    'B2': 'the observed peak concurrency does not follow `concurrency`',
    'C': '`runs: 5` costs what `runs: 1` costs',
    'C2': '`params` does not reach the outbound body',
    'D': 'no live code reads `ModelConfig.params`',
    'D2': 'no live code reads `companion_tools`',
    'E': 'the dead fields are declared, written, shipped and asserted',
    'E2': 'the parity suite asserts presence/type, never effect',
    'E3': 'companion_tools is declared, shipped and asserted -- and unread',
    'F': 'a CONSUMED config field does change the run (positive control)',
    'G': 'the published report is identical with and without the dead fields',
}
# On the DEFECTIVE tree: EVERY arm is GREEN (house style).
DEFECTIVE_CONTROL = {a: 'GREEN' for a in ARMS}


def md5(path):
    with open(path, 'rb') as f:
        return hashlib.md5(f.read()).hexdigest()


def stat_sig(path):
    st = os.stat(path)
    return (st.st_mtime_ns, st.st_mode)


def head_blob_md5(rel):
    """The md5 of the file as it is at HEAD (so a dirty tree is detectable)."""
    proc = subprocess.run(['git', 'show', 'HEAD:' + rel], cwd=REPO,
                          capture_output=True)
    if proc.returncode != 0:
        return None
    return hashlib.md5(proc.stdout).hexdigest()


class Snapshot:
    """Repo-owned snapshot dir. NEVER /tmp (it gets pruned -- R507)."""

    def __init__(self):
        self.dir = os.path.join(REPO, 'scripts', '.r551_snapshot')
        self.files = {}

    def take(self, rel):
        path = os.path.join(REPO, rel)
        data = open(path, 'rb').read()
        self.files[rel] = (data, stat_sig(path))

    def restore(self):
        for rel, (data, sig) in self.files.items():
            path = os.path.join(REPO, rel)
            with open(path, 'wb') as f:
                f.write(data)
            os.utime(path, ns=(sig[0], sig[0]))
            os.chmod(path, sig[1])

    def cleanup(self):
        shutil.rmtree(self.dir, ignore_errors=True)


def run_suite():
    """Run the R551 suite and return (arms, error).

    arms: {arm_name: 'RED'|'GREEN'|'ABSENT'}
    error: None, or a HARNESS reason string.
    """
    jest = _resolve_tool('jest')
    out_path = os.path.join(REPO, '_tmp', 'r551_matrix_result.json')
    if os.path.exists(out_path):
        os.remove(out_path)
    cmd = [jest, SUITE, '--no-coverage', '--runInBand', '--json',
           '--outputFile', out_path]
    try:
        proc = subprocess.run(cmd, cwd=REPO, capture_output=True, text=True,
                              timeout=900)
    except subprocess.TimeoutExpired:
        return None, 'JEST_TIMEOUT'
    if not os.path.exists(out_path):
        return None, 'JEST_NO_OUTPUT: ' + (proc.stdout[-1500:] or '') + \
            (proc.stderr[-1500:] or '')
    data = json.load(open(out_path))
    os.remove(out_path)

    suite_result = None
    for tr in data.get('testResults', []):
        if tr.get('name', '').endswith(SUITE):
            suite_result = tr
            break
    if suite_result is None:
        return None, 'SUITE_NOT_FOUND'

    # A suite that did not compile produces zero assertions.  That is a
    # HARNESS, never a verdict about the subject (R489 / R530 discipline).
    if suite_result.get('status') == 'failed' and \
            not suite_result.get('assertionResults'):
        return None, 'SUITE_DID_NOT_COMPILE: ' + \
            (suite_result.get('message') or '')[:600]

    arms = {}
    for assertion in suite_result.get('assertionResults', []):
        title = assertion.get('title', '')
        m = re.search(r'arm ([A-Z][A-Z]?[0-9]?):', title)
        if not m:
            continue
        key = m.group(1)
        status = assertion.get('status')
        if status == 'passed':
            arms[key] = 'GREEN'
        elif status == 'failed':
            arms[key] = 'RED'
        else:
            arms[key] = 'ABSENT'

    missing = [a for a in ARMS if a not in arms]
    if missing:
        return arms, 'ARMS_MISSING:' + ','.join(missing)

    if data.get('numFailedTests', 0) and data.get('numPassedTests', 0) == 0:
        return arms, 'ZERO_TESTS_RUN'
    return arms, None


def classify(observed, expected):
    for arm, want in expected.items():
        if observed.get(arm) != want:
            return 'MISMATCH'
    return 'MATCH'


# --------------------------------------------------------------- mutations
MUTANTS = {}


def m1_real_repair_concurrency(snap):
    """THE REAL REPAIR #1: the evaluator honours `concurrency`.

    The model loop is bounded by the declared value instead of running every
    model at once.  A simple worker-pool over `this.config.models`.
    """
    p = os.path.join(REPO, EVALUATOR)
    src = open(p).read()
    needle = """    const results = await Promise.all(
      this.config.models.map((model, i) => {
        log(`\\n启动评测: ${model.name}`);
        return this.evaluateModel(model, i);
      })
    );"""
    assert src.count(needle) == 1, 'M1 anchor not unique'
    repl = """    const _conc = Math.max(1, this.config.concurrency ?? 3);
    const _results: EvaluationResult[] = new Array(this.config.models.length);
    let _next = 0;
    const _worker = async (): Promise<void> => {
      for (;;) {
        const _i = _next++;
        if (_i >= this.config.models.length) return;
        const _model = this.config.models[_i];
        log(`\\n启动评测: ${_model.name}`);
        _results[_i] = await this.evaluateModel(_model, _i);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(_conc, this.config.models.length) },
        () => _worker())
    );
    const results = _results;"""
    src = src.replace(needle, repl)
    open(p, 'w').write(src)


def m2_real_repair_runs(snap):
    """THE REAL REPAIR #2: the evaluator honours `runs`.

    The per-question loop is repeated `runs` times.  The extra closing
    brace is EXACTLY ONE (the runs-loop); the question-loop's own closing
    brace is already in the source.
    """
    p = os.path.join(REPO, EVALUATOR)
    src = open(p).read()
    needle = "    for (let i = 0; i < questions.length; i++) {"
    assert src.count(needle) == 1, 'M2 anchor not unique'
    repl = ("    const _runs = Math.max(1, this.config.runs ?? 1);\n"
            "    for (let _r = 0; _r < _runs; _r++) {\n"
            "    for (let i = 0; i < questions.length; i++) {")
    src = src.replace(needle, repl)

    needle2 = "    const totalScore = this.calculateTotalScore(scores);"
    assert src.count(needle2) == 1, 'M2 second anchor not unique'
    repl2 = "    }\n\n    const totalScore = this.calculateTotalScore(scores);"
    src = src.replace(needle2, repl2)
    open(p, 'w').write(src)


def m3_real_repair_params(snap):
    """THE REAL REPAIR #3: `ModelConfig.params` reaches the outbound body."""
    p = os.path.join(REPO, ADAPTER)
    src = open(p).read()
    needle = """export function buildOpenAIChatBody<M extends { role: string; content: string }>(
  model: string,
  messages: M[],
  maxTokens: number = 4096
): string {
  return JSON.stringify({
    model,
    messages,
    temperature: 0.7,
    max_tokens: maxTokens,
  });
}"""
    assert src.count(needle) == 1, 'M3 adapter anchor not unique'
    repl = """export function buildOpenAIChatBody<M extends { role: string; content: string }>(
  model: string,
  messages: M[],
  maxTokens: number = 4096,
  params?: Record<string, unknown>
): string {
  const base: Record<string, unknown> = {
    model,
    messages,
    temperature: 0.7,
    max_tokens: maxTokens,
  };
  for (const [k, v] of Object.entries(params ?? {})) {
    base[k] = v;
  }
  return JSON.stringify(base);
}"""
    src = src.replace(needle, repl)
    open(p, 'w').write(src)

    p2 = os.path.join(REPO, OPENAI)
    src2 = open(p2).read()
    n2 = "      body: buildOpenAIChatBody(model, messages, 4096),"
    assert src2.count(n2) == 1, 'M3 openai anchor not unique'
    src2 = src2.replace(
        n2,
        "      body: buildOpenAIChatBody(model, messages, 4096, config.params),")
    open(p2, 'w').write(src2)


def m4_real_repair_companion_tools(snap):
    """THE REAL REPAIR #4: `companion_tools` is READ.

    Minimal shape: the evaluator logs the companion-tool state (the
    "one-line change that makes the state VISIBLE" -- R512's cheap-fix
    principle).
    """
    p = os.path.join(REPO, EVALUATOR)
    src = open(p).read()
    needle = "    log(`\\n开始并行评测 ${this.config.models.length} 个模型...`);"
    assert src.count(needle) == 1, 'M4 anchor not unique'
    repl = (needle + "\n"
            "    log(`[companion_tools] "
            "${JSON.stringify(this.config.companion_tools ?? null)}`);")
    src = src.replace(needle, repl)
    open(p, 'w').write(src)


def m5_negative_control(snap):
    """A NEGATIVE CONTROL -- an inert comment. Nothing behavioural changes."""
    p = os.path.join(REPO, EVALUATOR)
    src = open(p).read()
    needle = "export class Evaluator {"
    assert src.count(needle) == 1, 'M5 anchor not unique'
    src = src.replace(
        needle,
        needle + "\n  // R551 M5 negative control: an inert comment, nothing changed.")
    open(p, 'w').write(src)


def m6_negative_control_other_file(snap):
    """A SECOND negative control, in a DIFFERENT file.

    It proves the matrix does not report RED for anything it touches.
    """
    p = os.path.join(REPO, REPORTER)
    src = open(p).read()
    needle = "export class Reporter {"
    assert src.count(needle) == 1, 'M6 anchor not unique'
    src = src.replace(
        needle,
        needle + "\n  // R551 M6 negative control: an inert comment, nothing changed.")
    open(p, 'w').write(src)


def m7_neighbour_fix(snap):
    """A NEIGHBOUR FIX that is NOT this suite's subject.

    The CSV report gains a `sample_size` column -- a different plane (the
    published artifact's shape).  This suite pins the operator-config plane,
    so it MUST survive -- and the driver records why (R512-6).
    """
    p = os.path.join(REPO, REPORTER)
    src = open(p).read()
    needle = "    const headers = ['rank', 'model', 'total', ...dimKeys, ...ciHeaders, 'duration_s', 'questions'];"
    assert src.count(needle) == 1, 'M7 anchor not unique'
    src = src.replace(
        needle,
        "    const headers = ['rank', 'model', 'total', ...dimKeys, ...ciHeaders, 'duration_s', 'questions', 'sample_size'];")
    needle2 = "        r.scores.length,\n      ];"
    assert src.count(needle2) == 1, 'M7 second anchor not unique'
    src = src.replace(needle2, "        r.scores.length,\n        r.scores.length,\n      ];")
    open(p, 'w').write(src)


MUTANTS['M1'] = (m1_real_repair_concurrency, {
    'A': 'RED', 'A2': 'GREEN',
    'B': 'GREEN', 'B2': 'RED', 'C': 'GREEN', 'C2': 'GREEN',
    'D': 'GREEN', 'D2': 'GREEN',
    'E': 'GREEN', 'E2': 'GREEN', 'E3': 'GREEN',
    'F': 'GREEN', 'G': 'GREEN',
}, 'the REAL repair: the evaluator honours `concurrency`')
MUTANTS['M2'] = (m2_real_repair_runs, {
    'A': 'GREEN', 'A2': 'RED',
    'B': 'GREEN', 'B2': 'GREEN', 'C': 'RED', 'C2': 'GREEN',
    'D': 'GREEN', 'D2': 'GREEN',
    'E': 'GREEN', 'E2': 'GREEN', 'E3': 'GREEN',
    'F': 'GREEN', 'G': 'RED',
}, 'the REAL repair: the evaluator honours `runs`')
MUTANTS['M3'] = (m3_real_repair_params, {
    'A': 'GREEN', 'A2': 'GREEN',
    'B': 'GREEN', 'B2': 'GREEN', 'C': 'GREEN', 'C2': 'RED',
    'D': 'RED', 'D2': 'GREEN',
    'E': 'GREEN', 'E2': 'GREEN', 'E3': 'GREEN',
    'F': 'GREEN', 'G': 'GREEN',
}, 'the REAL repair: `params` reaches the outbound body')
MUTANTS['M4'] = (m4_real_repair_companion_tools, {
    'A': 'GREEN', 'A2': 'GREEN',
    'B': 'GREEN', 'B2': 'GREEN', 'C': 'GREEN', 'C2': 'GREEN',
    'D': 'GREEN', 'D2': 'RED',
    'E': 'GREEN', 'E2': 'GREEN', 'E3': 'RED',
    'F': 'GREEN', 'G': 'GREEN',
}, 'the REAL repair: `companion_tools` is read')
MUTANTS['M5'] = (m5_negative_control, DEFECTIVE_CONTROL,
                 'negative control: an inert comment')
MUTANTS['M6'] = (m6_negative_control_other_file, DEFECTIVE_CONTROL,
                 'negative control #2: an inert comment in the reporter')
MUTANTS['M7'] = (m7_neighbour_fix, DEFECTIVE_CONTROL,
                 "neighbour fix (report shape): NOT this suite's subject -> must SURVIVE")


def main():
    # ---- PRE-FLIGHT: the owned files must be clean vs HEAD --------------
    dirty = []
    for rel in OWNED:
        head = head_blob_md5(rel)
        now = md5(os.path.join(REPO, rel))
        if head is None:
            continue
        if head != now:
            dirty.append(rel)
    if dirty:
        print('FATAL PRE-FLIGHT: owned files differ from HEAD:', dirty)
        print('A matrix that measures a dirty tree reports a verdict about '
              'the dirt. Restore them (git checkout --) and re-run.')
        return 2

    snap = Snapshot()
    baseline_md5 = {}
    for rel in OWNED:
        snap.take(rel)
        baseline_md5[rel] = md5(os.path.join(REPO, rel))
    baseline_mtime = {rel: stat_sig(os.path.join(REPO, rel)) for rel in OWNED}

    results = []
    verdict = 'PASS'
    try:
        observed, err = run_suite()
        if err:
            print('FATAL baseline:', err)
            return 2
        print('BASELINE control state:', observed)
        print('BASELINE expected      :', DEFECTIVE_CONTROL)
        base_ok = classify(observed, DEFECTIVE_CONTROL)
        print('BASELINE verdict       :', base_ok)
        results.append(('BASELINE', 'n/a', observed, base_ok, 'the defective tree itself'))
        if base_ok != 'MATCH':
            verdict = 'FAIL'
            print('!! the baseline control state does not match the declared state')

        for name in ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7']:
            fn, expected, desc = MUTANTS[name]
            snap.restore()
            before = {rel: md5(os.path.join(REPO, rel)) for rel in OWNED}
            try:
                fn(snap)
            except AssertionError as e:
                results.append((name, desc, {}, 'HARNESS', f'anchor miss: {e}'))
                print(f'{name}: HARNESS (anchor miss: {e})')
                verdict = 'FAIL'
                continue
            after = {rel: md5(os.path.join(REPO, rel)) for rel in OWNED}
            injected = [rel for rel in OWNED if before[rel] != after[rel]]
            if not injected:
                results.append((name, desc, {}, 'NOT-INJECTED', 'no byte changed'))
                print(f'{name}: NOT-INJECTED (no byte changed)')
                verdict = 'FAIL'
                continue
            observed, err = run_suite()
            if err:
                results.append((name, desc, {}, 'HARNESS', err))
                print(f'{name}: HARNESS ({err[:400]})')
                verdict = 'FAIL'
                snap.restore()
                continue
            ok = classify(observed, expected)
            if name in ('M5', 'M6'):
                bucket = 'NEG-CONTROL PASS' if ok == 'MATCH' else 'NEG-CONTROL FAIL'
                if bucket != 'NEG-CONTROL PASS':
                    verdict = 'FAIL'
            elif name == 'M7':
                moved = observed != DEFECTIVE_CONTROL
                bucket = ('SURVIVED (scoped: neighbour plane, not this subject)'
                          if not moved
                          else 'KILLED (arms differ from the expectation)')
                if moved:
                    verdict = 'FAIL'
            else:
                moved = observed != DEFECTIVE_CONTROL
                exact = ok == 'MATCH'
                if not moved:
                    bucket = 'SURVIVED'
                    verdict = 'FAIL'
                elif exact:
                    bucket = 'KILLED'
                else:
                    bucket = 'KILLED (arms differ from the expectation)'
                    verdict = 'FAIL'
            print(f'{name}: {bucket}  observed={observed}')
            print(f'      expected={expected}  ({desc})')
            results.append((name, desc, observed, bucket,
                            'state moved' if observed != DEFECTIVE_CONTROL else 'state unchanged'))
            snap.restore()
    finally:
        snap.restore()
        for rel in OWNED:
            now = md5(os.path.join(REPO, rel))
            if now != baseline_md5[rel]:
                print(f'!! RESTORE FAILED for {rel}: {now} != {baseline_md5[rel]}')
                verdict = 'FAIL'
            now_sig = stat_sig(os.path.join(REPO, rel))
            if now_sig[0] != baseline_mtime[rel][0]:
                print(f'!! MTIME NOT RESTORED for {rel} '
                      f'({now_sig[0]} != {baseline_mtime[rel][0]})')
                verdict = 'FAIL'
        snap.cleanup()

    print('\n=== R551 MATRIX ===')
    for row in results:
        print('  ', row)
    print('VERDICT:', verdict)
    print('timestamp:', datetime.now().isoformat())
    return 0 if verdict == 'PASS' else 1


if __name__ == '__main__':
    sys.exit(main())
