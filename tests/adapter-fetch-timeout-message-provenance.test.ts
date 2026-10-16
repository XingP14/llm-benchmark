// tests/adapter-fetch-timeout-message-provenance.test.ts
//
// MEASURED 2026-10-16, `fetchWithTimeout`'s third parameter has ZERO production
// reach and its timeout MESSAGE is a literal that ignores it.
//
// Two independent measurements on src/adapters/adapter.ts:
//
//   A. ARITY CENSUS. `fetchWithTimeout(url, init, timeoutMs = DEFAULT_API_TIMEOUT_MS)`
//      has exactly SIX production call sites (anthropic / deepseek / glm / ollama /
//      openai / qwen). All six pass TWO arguments. Zero pass a third. The parameter
//      is reachable only from tests.
//
//   B. MESSAGE PROVENANCE. The AbortError branch reads
//         throw new Error('API 请求超时 (300s)');
//      -- a literal. `timeoutMs` does not appear in it. So the message is a
//      byte-identical string for EVERY timeout value the function accepts, and
//      the number it names (300) coincides with DEFAULT_API_TIMEOUT_MS / 1000.
//
// The consequence, stated as a class rather than a single case: a caller who
// passes `timeoutMs = 20000` gets aborted after 20 seconds and is told they
// waited 300. The test suite ASSERTS that. tests/adapter-fetch-timeout-abort-callback
// .test.ts:36-37 calls `fetchWithTimeout(url, init, 20)` and asserts the message
// is 'API 请求超时 (300s)'. So the defect is not merely unguarded -- it is pinned,
// and a test that reads as coverage is actually a lock on the behaviour.
//
// WHAT IS PINNED vs WHAT IS FATHER-GATED. This suite pins the CURRENT behaviour
// exactly, so any repair turns it RED (which is the point: a behaviour change must
// be a deliberate, visible diff, not an accident). It does NOT decide the repair.
// Whether the message should name the caller's timeout, whether it should name the
// default and say so, or whether the parameter should be dropped entirely is a
// BEHAVIOUR decision, because the string is user-facing text in six adapters.
// Recorded father-gated; see docs/R470-TIMEOUT-MESSAGE-PROVENANCE.md.
//
// METHOD. The arity census (arm A) derives its subject set from the TREE by glob,
// not from a hand-written list of six adapters -- a hand-written list would have
// recorded the six that exist today and never noticed a seventh. Per the
// lesson shipped in 7bcba1d, the definition site and the factory
// (create-adapter.ts) are excluded BY MEASUREMENT and the exclusion is asserted
// (arm F) so it cannot silently rot into a hole that censuses nothing.
import * as fs from 'fs';
import * as path from 'path';
import { fetchWithTimeout, DEFAULT_API_TIMEOUT_MS } from '../src/adapters/adapter';

const SRC = path.join(__dirname, '..', 'src');

/** Every TypeScript file under src/ that mentions fetchWithTimeout at all. */
function filesMentioningFetchWithTimeout(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ts')) {
        if (fs.readFileSync(full, 'utf8').includes('fetchWithTimeout(')) {
          out.push(path.relative(path.join(__dirname, '..'), full));
        }
      }
    }
  };
  walk(SRC);
  return out.sort();
}

/**
 * Count top-level arguments of a call whose opening paren is at `openIdx`
 * (the index OF the '('). Brace/paren/bracket-aware so a comma inside an object
 * literal or a template expression is not mistaken for an argument separator.
 */
function countCallArgs(text: string, openIdx: number): number {
  let depth = 0;
  let args = 1; // an empty argument list is one (empty) argument
  let sawContent = false;
  for (let i = openIdx; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') {
      depth--;
      if (depth === 0) return args;
    } else if (ch === ',' && depth === 1) {
      args++;
    } else if (depth >= 1 && !/\s/.test(ch)) {
      sawContent = true;
    }
  }
  throw new Error(`unbalanced call starting at ${openIdx}`);
}

interface CallSite {
  file: string;
  argc: number;
  isDefinition: boolean;
}

function callSites(): CallSite[] {
  const sites: CallSite[] = [];
  for (const file of filesMentioningFetchWithTimeout()) {
    const text = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    const re = /fetchWithTimeout\(/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const before = text.slice(Math.max(0, m.index - 12), m.index);
      // A definition is preceded by `function ` / the signature is a declaration.
      const isDefinition = /function\s*$/.test(before);
      sites.push({
        file,
        argc: countCallArgs(text, m.index + 'fetchWithTimeout'.length),
        isDefinition,
      });
    }
  }
  return sites;
}

describe('R470 arm A — arity census: the timeout parameter has no production reach', () => {
  const sites = callSites();

  it('finds six production call sites plus the definition', () => {
    const calls = sites.filter(s => !s.isDefinition);
    const defs = sites.filter(s => s.isDefinition);
    expect(defs).toHaveLength(1);
    expect(defs[0].file).toBe(path.join('src', 'adapters', 'adapter.ts'));
    expect(calls).toHaveLength(6);
  });

  it('every production call site passes exactly TWO arguments', () => {
    const offenders = sites
      .filter(s => !s.isDefinition && s.argc !== 2)
      .map(s => `${s.file}(argc=${s.argc})`);
    expect(offenders).toEqual([]);
  });

  it('no production call site supplies a timeout at all', () => {
    const withTimeout = sites
      .filter(s => !s.isDefinition && s.argc >= 3)
      .map(s => s.file);
    expect(withTimeout).toEqual([]);
  });

  it('the definition itself declares a defaulted third parameter', () => {
    const def = sites.find(s => s.isDefinition)!;
    expect(def.argc).toBe(3);
    const text = fs.readFileSync(path.join(__dirname, '..', def.file), 'utf8');
    expect(text).toContain('timeoutMs: number = DEFAULT_API_TIMEOUT_MS');
  });
});

describe('R470 arms B/C — the message is a literal, so it names a number nobody asked for', () => {
  afterEach(() => jest.restoreAllMocks());

  /** fetch that never settles until the signal aborts — real timeout shape. */
  function hangUntilAbort(): { aborted: () => boolean } {
    let signal: AbortSignal | undefined;
    let wasAborted = false;
    jest.spyOn(globalThis, 'fetch').mockImplementation((_u: any, init: any) => {
      signal = init?.signal;
      return new Promise((_res, rej) => {
        init?.signal?.addEventListener('abort', () => {
          wasAborted = true;
          const err: any = new Error('The operation was aborted');
          err.name = 'AbortError';
          rej(err);
        });
      });
    });
    return { aborted: () => wasAborted && signal?.aborted === true };
  }

  it('times out at 20ms when the caller asks for 20ms', async () => {
    const probe = hangUntilAbort();
    await expect(
      fetchWithTimeout('https://api.example.com/short', { method: 'POST' }, 20)
    ).rejects.toThrow();
    expect(probe.aborted()).toBe(true);
  });

  it('C1: a 20ms timeout and a 40ms timeout produce the BYTE-IDENTICAL message', async () => {
    hangUntilAbort();
    const short = await fetchWithTimeout('https://x/1', { method: 'POST' }, 20).catch(
      (e: Error) => e.message
    );
    jest.restoreAllMocks();
    hangUntilAbort();
    const long = await fetchWithTimeout('https://x/2', { method: 'POST' }, 40).catch(
      (e: Error) => e.message
    );

    expect(short).toBe(long);
    // ...and the shared string names 300, which is neither 20 nor 40.
    expect(short).toBe('API 请求超时 (300s)');
    expect(short).not.toContain('20s');
    expect(short).not.toContain('40s');
  });

  it('C2: the seconds in the literal coincide with the DEFAULT, not with the argument', () => {
    expect(DEFAULT_API_TIMEOUT_MS / 1000).toBe(300);
    const text = fs.readFileSync(
      path.join(SRC, 'adapters', 'adapter.ts'),
      'utf8'
    );
    const branch = text.slice(text.indexOf("errorName(err) === 'AbortError'"));
    const literal = branch.match(/'API 请求超时 \((\d+)s\)'/);
    expect(literal).not.toBeNull();
    expect(Number(literal![1])).toBe(DEFAULT_API_TIMEOUT_MS / 1000);
    // The parameter is never interpolated into the message.
    const throwLine = branch.slice(0, branch.indexOf('\n', branch.indexOf('throw new Error')));
    expect(throwLine).not.toContain('timeoutMs');
  });

  it('C3: a 1ms timeout still reports 300 seconds', async () => {
    hangUntilAbort();
    const msg = await fetchWithTimeout('https://x/3', { method: 'POST' }, 1).catch(
      (e: Error) => e.message
    );
    expect(msg).toBe('API 请求超时 (300s)');
  });
});

describe('R470 arm D — the reachable surface is the default path only', () => {
  it('all six production callers necessarily take the default branch', () => {
    const calls = callSites().filter(s => !s.isDefinition);
    expect(calls.every(s => s.argc === 2)).toBe(true);
    // Therefore in production the literal is CORRECT BY COINCIDENCE: every real
    // caller runs at DEFAULT_API_TIMEOUT_MS, and the literal names that default.
    // The defect is only reachable through the exported parameter's contract.
    expect(DEFAULT_API_TIMEOUT_MS).toBe(300000);
  });
});

describe('R470 arm F — subject-set exclusions are justified, not assumed', () => {
  it('create-adapter.ts does NOT appear in the subject set -- measured, not assumed', () => {
    // CORRECTED 2026-10-16: the subject-set pin caught a wrong premise in this
    // very arm. create-adapter.ts does NOT mention fetchWithTimeout, so it was
    // never a member of the glob and there was nothing to exclude. The arm is
    // kept, restated as what the measurement actually shows: the glob reaches
    // adapter.ts (definition) + exactly the six adapters, and nothing else.
    const files = filesMentioningFetchWithTimeout();
    expect(files).not.toContain(path.join('src', 'adapters', 'create-adapter.ts'));
    expect(files).toHaveLength(7); // 1 definition + 6 production callers
  });

  it('the six production callers are the six adapter files, and no seventh appears', () => {
    const files = filesMentioningFetchWithTimeout();
    const adapters = files.filter(
      f => f.includes(`${path.sep}adapters${path.sep}`) && f !== path.join('src', 'adapters', 'adapter.ts')
    );
    for (const name of ['openai', 'qwen', 'deepseek', 'glm', 'anthropic', 'ollama']) {
      expect(adapters.some(f => f.includes(`${name}-adapter.ts`))).toBe(true);
    }
    // If a seventh adapter ever starts calling it, the count moves and this
    // arm reds -- which is the point of a census rather than a hand list.
    expect(adapters).toHaveLength(6);
  });
});
