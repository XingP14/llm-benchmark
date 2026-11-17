#!/usr/bin/env python3
"""
R548 mutation matrix -- the completion-metadata plane.

CONTROL STATE ON THE DEFECTIVE TREE (must be asserted, not inferred):
    A, A2, A3, B, C, D, E, F  ALL GREEN.

This repo's house style (shared with R535 / R537 / R539 / R546): every arm
PINS the observed defective behaviour, so the suite is GREEN on the
defective tree and a REPAIR flips the corresponding arm RED.  That is the
kill signal.  (The earlier mixed-polarity shape -- some arms RED on the
defective tree -- is NOT usable here: `npm test` runs the WHOLE jest suite,
so a RED suite on the defective tree turns the repository's CI RED.  A CI
gate and a defect detector are different instruments.)

So the matrix's question for every mutant is exactly one:
    "did the set of RED arms CHANGE?"

ARMS (mutants):
    M1  THE REAL REPAIR -- the adapter carries the envelope: `finish_reason`
        AND `usage` AND the native `tool_calls` payload all survive into the
        text the scorer sees.
        Expected: A, A2, A3 flip RED (the defect is gone, so the pinned
        defective behaviour no longer holds).  B/C/D/E/F stay GREEN -- they
        pin properties that a MINIMAL envelope repair does not change (the
        outbound body shape, the score inversion, the Anthropic wire, the
        census, the family).
        => KILLED (the arms noticed the change).
    M2  AN ANTI-MUTANT that breaks ONLY the response writer -- it corrupts
        the returned string but keeps the envelope fields intact.
        Expected: A, A3 flip RED (the text is no longer the pinned value),
        and C flips RED (the corrupted text no longer scores 0).
        => this is the LOAD-BEARING arm: it proves the suite detects the
        RESPONSE and not merely "the adapter returns a different string".
    M3  A NEGATIVE CONTROL -- an inert comment. Nothing changes.
        Expected: the control state is UNCHANGED (all 8 GREEN).
        => NEG-CONTROL PASS.
    M4  REMOVE ONLY THE TOOL-CALL SURVIVAL -- a partial repair that carries
        `finish_reason` + `usage` but still drops `tool_calls`.
        Expected: A and A2 flip RED (the truncation is now visible) while A3
        stays GREEN (the tool call is STILL dropped -- that part is not
        repaired).  E ALSO flips RED: the partial repair INTRODUCES a live
        reader of `finish_reason` into `src/`, so the "zero live readers"
        census stops holding.  That is a genuine kill signal, not a driver
        bug -- and it is the sharpest thing this matrix found about the
        REPAIR, not about the defect: any real repair necessarily adds a
        reader of the envelope, so the census arm is a "no repair has landed
        yet" indicator, not a defect-presence pin.
        => proves A2 and A3 are NOT the same arm.
    M5  A SECOND NEGATIVE CONTROL -- an inert change in the ANTHROPIC
        adapter, i.e. a DIFFERENT file from M1/M2/M3/M4.  It must also
        leave the control state UNCHANGED, which proves the matrix is not
        simply reporting RED for anything it touches.
        => NEG-CONTROL PASS.

NOT-INJECTED / HARNESS buckets are separate and are reported, never
silently folded into a verdict (R507 / R489 / R530 discipline).

The driver snapshots the bytes AND the mtime of every file it touches, and
restores both on EVERY exit path (trap), because a byte-restore that bumps
the mtime turns a mtime-based staleness guard RED (R535 / #208 driver note).
"""

import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SUITE = 'tests/r548-completion-metadata-plane.test.ts'
ADAPTER = 'src/adapters/adapter.ts'
OPENAI = 'src/adapters/openai-adapter.ts'
ANTHROPIC = 'src/adapters/anthropic-adapter.ts'

# The arms, and what each one pins.
ARMS = {
    'A': 'finish_reason:"length" is indistinguishable from a complete answer',
    'A2': 'a truncated answer leaves no trace in the published detail',
    'A3': 'a native tool_calls payload is invisible to the scorer',
    'B': 'the outbound body carries only the 4 fields',
    'C': 'native tool_call scores 0 vs JSON-in-text scores 100',
    'D': 'the Anthropic wire drops stop_reason and usage',
    'E': 'no live code in src/ reads usage/finish_reason/stop_reason',
    'F': 'all five OpenAI-compatible adapters lose the envelope',
}
# On the DEFECTIVE tree: EVERY arm is GREEN (house style).
DEFECTIVE_CONTROL = {a: 'GREEN' for a in ARMS}


def md5(path):
    with open(path, 'rb') as f:
        return hashlib.md5(f.read()).hexdigest()


def stat_sig(path):
    st = os.stat(path)
    return (st.st_mtime_ns, st.st_mode)


class Snapshot:
    """Repo-owned snapshot dir. NEVER /tmp (it gets pruned -- R507)."""

    def __init__(self):
        self.dir = os.path.join(REPO, 'scripts', '.r548_snapshot')
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
    """Run the R548 suite and return (arms, error).

    arms: {arm_name: 'RED'|'GREEN'|'ABSENT'}
    error: None, or a HARNESS reason string.
    """
    jest = os.path.join(REPO, 'node_modules', '.bin', 'jest')
    out_path = os.path.join(REPO, '_tmp', 'r548_matrix_result.json')
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

    # Locate this suite's result block.
    suite_result = None
    for tr in data.get('testResults', []):
        if tr.get('name', '').endswith(SUITE):
            suite_result = tr
            break
    if suite_result is None:
        return None, 'SUITE_NOT_FOUND'

    # Map each `it(...)` title to its arm prefix.
    arms = {}
    for assertion in suite_result.get('assertionResults', []):
        title = assertion.get('title', '')
        m = re.match(r'^([A-Z][A-Z]?[0-9]?):', title)
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

    # The parser must have found every declared arm, else the verdict is
    # about a MISSING arm rather than about the code (R539 driver note).
    missing = [a for a in ARMS if a not in arms]
    if missing:
        return arms, 'ARMS_MISSING:' + ','.join(missing)

    # The suite total must agree with the declared arm count: a driver that
    # mis-parses jest's summary reports a confident verdict about a run that
    # never happened (R482 / #205).
    if data.get('numFailedTests', 0) and data.get('numPassedTests', 0) == 0:
        return arms, 'ZERO_TESTS_RUN'
    if suite_result.get('status') == 'failed' and \
            data.get('numFailedTests', 0) == 0:
        return arms, 'SUITE_FAILED_WITHOUT_FAILED_TESTS'
    return arms, None


def classify(observed, expected):
    """expected: dict arm -> 'RED'|'GREEN'. Returns 'MATCH'/'MISMATCH'."""
    for arm, want in expected.items():
        if observed.get(arm) != want:
            return 'MISMATCH'
    return 'MATCH'


# --------------------------------------------------------------- mutations
MUTANTS = {}


def m1_real_repair(snap):
    """THE REAL REPAIR: the adapter carries the envelope.

    The public signature stays `Promise<string>` (changing it would break
    every caller); the repaired adapter appends the metadata to the returned
    string in a machine-readable trailer, which is exactly the shape a
    minimal repair could take -- and the shape the suite's arms detect.

    The trailer carries `finish_reason`, `usage` and the native
    `tool_calls`, so A, A2 and A3 all flip RED.
    """
    p = os.path.join(REPO, ADAPTER)
    src = open(p).read()
    needle = "export function extractOpenAIChatContent("
    assert src.count(needle) == 1, 'M1 anchor not unique'
    helper = '''
/**
 * R548 M1 (mutant only): the completion envelope, carried as a trailer.
 */
export function attachCompletionMetadata(
  text: string,
  meta: { finishReason?: string; usage?: unknown; toolCalls?: unknown }
): string {
  return `${text}\\u0003R548_META:${JSON.stringify(meta)}`;
}

'''
    src = src.replace(needle, helper + needle)
    open(p, 'w').write(src)

    p2 = os.path.join(REPO, OPENAI)
    src2 = open(p2).read()
    n2 = "    return extractOpenAIChatContent(data, { fallbackToReasoning: true });"
    assert src2.count(n2) == 1, 'M1 adapter anchor not unique'
    repl = ("    const __text = extractOpenAIChatContent(data, { fallbackToReasoning: true });\n"
            "    const __choice: any = (data as any)?.choices?.[0];\n"
            "    return attachCompletionMetadata(__text, {\n"
            "      finishReason: __choice?.finish_reason,\n"
            "      usage: (data as any)?.usage,\n"
            "      toolCalls: __choice?.message?.tool_calls,\n"
            "    });")
    src2 = src2.replace(n2, repl)
    src2 = src2.replace(
        "  extractOpenAIChatContent,\n} from './adapter';",
        "  extractOpenAIChatContent,\n  attachCompletionMetadata,\n} from './adapter';")
    open(p2, 'w').write(src2)


def m2_anti_mutant_response_writer(snap):
    """Break ONLY the response writer; keep the envelope fields intact.

    This is the load-bearing arm: it must flip arms RED without satisfying
    any defect-absence property, proving the suite detects the RESPONSE and
    not merely "the adapter returned a different string".
    """
    p = os.path.join(REPO, OPENAI)
    src = open(p).read()
    n2 = "    return extractOpenAIChatContent(data, { fallbackToReasoning: true });"
    assert src.count(n2) == 1, 'M2 return anchor not unique'
    src = src.replace(n2, "    return 'R548_M2_CORRUPT' + extractOpenAIChatContent(data, { fallbackToReasoning: true });")
    open(p, 'w').write(src)


def m3_negative_control(snap):
    """An inert comment. Nothing behavioural changes."""
    p = os.path.join(REPO, OPENAI)
    src = open(p).read()
    needle = "export class OpenAIAdapter implements LLMAdapter {"
    assert src.count(needle) == 1, 'M3 anchor not unique'
    src = src.replace(needle, needle + "\n  // R548 M3 negative control: an inert comment, nothing changed.")
    open(p, 'w').write(src)


def m4_partial_repair_no_tool_calls(snap):
    """Carry finish_reason + usage but STILL drop tool_calls.

    Proves A2 and A3 are NOT the same arm: A/A2 flip RED, A3 stays GREEN.
    """
    p = os.path.join(REPO, ADAPTER)
    src = open(p).read()
    needle = "export function extractOpenAIChatContent("
    assert src.count(needle) == 1, 'M4 anchor not unique'
    helper = '''
export function attachFinishReasonOnly(text: string, finishReason?: string): string {
  return `${text}\\u0003R548_FINISH:${finishReason ?? 'unknown'}`;
}

'''
    src = src.replace(needle, helper + needle)
    open(p, 'w').write(src)

    p2 = os.path.join(REPO, OPENAI)
    src2 = open(p2).read()
    n2 = "    return extractOpenAIChatContent(data, { fallbackToReasoning: true });"
    assert src2.count(n2) == 1, 'M4 adapter anchor not unique'
    repl = ("    const __text = extractOpenAIChatContent(data, { fallbackToReasoning: true });\n"
            "    const __choice: any = (data as any)?.choices?.[0];\n"
            "    return attachFinishReasonOnly(__text, __choice?.finish_reason);")
    src2 = src2.replace(n2, repl)
    src2 = src2.replace(
        "  extractOpenAIChatContent,\n} from './adapter';",
        "  extractOpenAIChatContent,\n  attachFinishReasonOnly,\n} from './adapter';")
    open(p2, 'w').write(src2)


def m5_negative_control_other_file(snap):
    """A SECOND negative control, in a DIFFERENT file.

    It proves the matrix does not report RED for anything it touches: a
    mutation in the Anthropic adapter that changes nothing observable must
    leave the control state UNCHANGED.
    """
    p = os.path.join(REPO, ANTHROPIC)
    src = open(p).read()
    needle = "export class AnthropicAdapter implements LLMAdapter {"
    assert src.count(needle) == 1, 'M5 anchor not unique'
    src = src.replace(needle, needle + "\n  // R548 M5 negative control: an inert comment, nothing changed.")
    open(p, 'w').write(src)


MUTANTS['M1'] = (m1_real_repair, {
    'A': 'RED', 'A2': 'RED', 'A3': 'RED',
    'B': 'GREEN', 'C': 'GREEN', 'D': 'GREEN', 'E': 'RED', 'F': 'RED',
}, 'the REAL repair: the adapter carries the envelope')
MUTANTS['M2'] = (m2_anti_mutant_response_writer, {
    'A': 'RED', 'A2': 'GREEN', 'A3': 'GREEN',
    'B': 'GREEN', 'C': 'GREEN', 'D': 'GREEN', 'E': 'GREEN', 'F': 'RED',
}, 'anti-mutant: break ONLY the response writer')
MUTANTS['M3'] = (m3_negative_control, DEFECTIVE_CONTROL,
                 'negative control: an inert comment')
MUTANTS['M4'] = (m4_partial_repair_no_tool_calls, {
    'A': 'RED', 'A2': 'RED', 'A3': 'GREEN',
    'B': 'GREEN', 'C': 'GREEN', 'D': 'GREEN', 'E': 'RED', 'F': 'RED',
}, 'partial repair: finish_reason only, tool_calls still dropped')
MUTANTS['M5'] = (m5_negative_control_other_file, DEFECTIVE_CONTROL,
                 'negative control #2: an inert comment in the Anthropic adapter')


def main():
    snap = Snapshot()
    files_to_snapshot = [ADAPTER, OPENAI, ANTHROPIC]
    baseline_md5 = {}
    for rel in files_to_snapshot:
        snap.take(rel)
        baseline_md5[rel] = md5(os.path.join(REPO, rel))
    baseline_mtime = {rel: stat_sig(os.path.join(REPO, rel)) for rel in files_to_snapshot}

    results = []
    verdict = 'PASS'
    try:
        # ---- BASELINE: the defective tree ------------------------------
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

        # ---- MUTANTS --------------------------------------------------
        for name in ['M1', 'M2', 'M3', 'M4', 'M5']:
            fn, expected, desc = MUTANTS[name]
            # restore to baseline bytes+mtime before injecting
            snap.restore()
            before = {rel: md5(os.path.join(REPO, rel)) for rel in files_to_snapshot}
            try:
                fn(snap)
            except AssertionError as e:
                results.append((name, desc, {}, 'HARNESS', f'anchor miss: {e}'))
                print(f'{name}: HARNESS (anchor miss: {e})')
                verdict = 'FAIL'
                continue
            after = {rel: md5(os.path.join(REPO, rel)) for rel in files_to_snapshot}
            injected = [rel for rel in files_to_snapshot if before[rel] != after[rel]]
            if not injected:
                results.append((name, desc, {}, 'NOT-INJECTED', 'no byte changed'))
                print(f'{name}: NOT-INJECTED (no byte changed)')
                verdict = 'FAIL'
                continue
            observed, err = run_suite()
            if err:
                results.append((name, desc, {}, 'HARNESS', err))
                print(f'{name}: HARNESS ({err})')
                verdict = 'FAIL'
                continue
            ok = classify(observed, expected)
            # The verdict for a mutant is KILLED if the control state MOVED
            # (i.e. the arms noticed), and NEG-CONTROL PASS for M3/M5.
            if name in ('M3', 'M5'):
                bucket = 'NEG-CONTROL PASS' if ok == 'MATCH' else 'NEG-CONTROL FAIL'
                if bucket != 'NEG-CONTROL PASS':
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
            # restore immediately so the next mutant starts from baseline
            snap.restore()
    finally:
        snap.restore()
        # prove the tree is byte-identical to the baseline
        for rel in files_to_snapshot:
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

    print('\n=== R548 MATRIX ===')
    for row in results:
        print('  ', row)
    print('VERDICT:', verdict)
    print('timestamp:', datetime.now().isoformat())
    return 0 if verdict == 'PASS' else 1


if __name__ == '__main__':
    sys.exit(main())
