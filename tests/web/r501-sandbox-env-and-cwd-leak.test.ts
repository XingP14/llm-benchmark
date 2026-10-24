// tests/web/r501-sandbox-env-and-cwd-leak.test.ts
//
// WHY THIS FILE EXISTS (2026-10-25 00:03 cron tick, llm-benchmark rotation).
//
// THE DEFECT.
//
// `src/sandbox/python-sandbox.ts` executes the MODEL-GENERATED answer of a
// coding benchmark. `spawn()` inherits the parent's environment by default and
// the parent's CWD by default. Both defaults leak the server's secrets into
// code that a model wrote, and that code's OUTPUT is persisted by the product
// into the `results` table's `model_output` column — which
// `GET /api/evaluations/:id/results` hands back to any authenticated caller.
//
// Measured over the REAL production class (`new PythonSandbox().execute(...)`,
// no mock, no re-implementation of the sandbox):
//
//   F1  ENVIRONMENT. With `JWT_SECRET` and `ADMIN_PASSWORD` set in the parent
//       (exactly as docker-compose.yml injects them), the child read BOTH back
//       out of `os.environ`:
//
//         output = "SUPER-SECRET-JWT-VALUE|SUPER-SECRET-ADMIN-PASSWORD"
//
//       These are the credentials the web server authenticates with
//       (src/web/config.ts). The model's own answer now carries them.
//
//   F2  WORKING DIRECTORY. The child inherited the server's CWD (the repo
//       root in dev, /app in Docker), where `data/llm-bench.db` lives. The
//       `configs` table of that database holds every model provider API key.
//       Measured: the child opened the live DB, READ the `configs` table, and
//       successfully INSERTed a row into it:
//
//         output = "WROTE_TO_DB"
//
//   F3  The two facts are INDEPENDENT. An env allow-list alone does not stop
//       the DB write (no secret needed — the path is relative to the CWD),
//       and a CWD change alone does not stop the env read. Both halves of the
//       fix are load-bearing, so this suite pins both.
//
// ---------------------------------------------------------------------------
// THE HARNESS TRAP THAT ALMOST SHIPPED A VACUOUS SUITE
// ---------------------------------------------------------------------------
//
// The FIRST version of this file set the canary with `process.env.JWT_SECRET =
// ...` inside the test and asserted the child could not see it. That version
// was VACUOUS, and the mutation matrix proved it: reverting the `env:`
// option in the source left the suite 9/9 GREEN.
//
// The reason: Jest runs each test file in a sandboxed module registry, and
// the `process.env` mutations a test makes are NOT visible to a CHILD
// PROCESS spawned from it — the sandboxed env proxy does not pass them
// through. So the canary never reached the child, the child never had the
// secret to leak, and the arm asserted nothing about the fix.
//
// The lesson (it is the R485 "a drafted probe never ran" shape, and the R487
// "the driver read the wrong stream" shape): a GREEN arm is not evidence
// until you have seen it go RED for the right reason.
//
// So the canary is injected where it ACTUALLY reaches the child: the parent
// environment is handed to the spawn explicitly, through the production
// helper `buildSandboxEnv(parentEnv)` — and the suite drives a REAL,
// UNMODIFIED `spawn` by passing the parent env in.
//
// The seam: `buildSandboxEnv` takes the parent environment as an ARGUMENT.
// The suite calls the production helper with a synthetic parent env, and the
// production `execute()` calls it with the real `process.env`. Both go through
// the same function, so the ALLOW-LIST LOGIC is what is under test — and the
// leak is proven end-to-end by `childEnvRoundTrip`, which runs a real
// `python3` child with an explicitly constructed environment and reads back
// what the child saw.
//
// It does not assert a NEW product policy — the allow-list contents are a
// product decision (a caller may legitimately want PYTHONPATH or a proxy
// variable passed in). It asserts the SECURITY PROPERTY, which is not a
// policy question:
//
//   - the child's environment contains NO value the parent had, except the
//     explicitly allow-listed names;
//   - the child's CWD is not the server's working directory;
//   - the server's own credentials are not reachable from the child.
//
// Those hold for any reasonable allow-list, so the suite does not need to be
// rewritten when the list changes.
//
// HARNESS NOTES
//
// 1. The suite drives the REAL `PythonSandbox` and spawns REAL `python3`
//    children. A fake `req`/`res` or a mocked `spawn` would certify the
//    test's own model of the sandbox rather than the sandbox. (The sibling
//    `tests/sandbox-spawn-error-event.test.ts` deliberately mocks spawn —
//    that is legitimate THERE because the subject is the missing-binary
//    event arm, which cannot be provoked with a real python3 present.)
// 2. NO SECRET VALUE IS EVER PRINTED OR ASSERTED. The probes use a canary
//    value; the assertions are on PRESENCE and ABSENCE ("the canary does not
//    appear in the output"), never on the secret's content. This is the same
//    discipline the r475 cross-tenant suite uses for API keys.
// 3. The child's CWD is asserted by reading `os.getcwd()` from inside the
//    child, and by asking whether the live DB path still resolves from it.
//    The CWD assertion is about the CHILD's view, which is the only view that
//    matters: a CWD that does not contain the DB is what protects it.
//
// WHY NOT A TEXT SUITE
//
// A grep over the source would pass against a `spawn()` that sets `env` to
// `{}` but leaves the CWD alone, and against one that sets `cwd` but leaves
// the env alone. The two defects are independent (F3), so a text assertion
// cannot distinguish a complete fix from a half fix.

import { PythonSandbox, buildSandboxEnv, SANDBOX_ENV_ALLOWLIST } from '../../src/sandbox/python-sandbox';
import { spawn } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const CANARY_SECRET = 'R501_CANARY_SECRET_DO_NOT_LEAK';

/**
 * Run a real python3 child with an EXPLICIT environment and report what the
 * child saw.
 *
 * This is the end-to-end leak probe. It mirrors exactly what the production
 * `execute()` does (spawn python3 with a constructed env and a cwd) but lets
 * the test supply the parent environment explicitly, so the canary actually
 * REACHES the child — which is the thing the Jest-sandboxed `process.env`
 * cannot do.
 */
function childEnvRoundTrip(
  parentEnv: Record<string, string>,
  cwd: string,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn('python3', ['-c', 'import os; print(os.environ.get("JWT_SECRET", "<absent>"))'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: parentEnv,
      cwd,
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('close', () => resolve({ stdout: stdout.trim(), stderr }));
  });
}

describe('r501 — the sandbox child must not inherit the server environment or CWD', () => {
  // ---- F1: environment -----------------------------------------------------

  it('F1 the child does not see the server credentials (JWT_SECRET / ADMIN_PASSWORD)', async () => {
    // The parent environment the server would have: both credentials present.
    const parentEnv = {
      PATH: process.env.PATH ?? '/usr/bin:/bin',
      JWT_SECRET: CANARY_SECRET,
      ADMIN_PASSWORD: CANARY_SECRET,
    };

    // 1. The production helper must DROP both credentials.
    const built = buildSandboxEnv(parentEnv as NodeJS.ProcessEnv);
    expect(built.JWT_SECRET).toBeUndefined();
    expect(built.ADMIN_PASSWORD).toBeUndefined();

    // 2. And a real child spawned with that env must not see them.
    const workDir = mkdtempSync(join(tmpdir(), 'r501-env-'));
    try {
      const { stdout } = await childEnvRoundTrip(built, workDir);
      expect(stdout).not.toContain(CANARY_SECRET);
      expect(stdout).toBe('<absent>');
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  });

  it('F1 CONTROL: the same child DOES see the credential when the env is not sanitised', async () => {
    // Without this arm, "the child did not see the secret" could mean the
    // probe never put the secret anywhere near it. This arm proves the
    // probe has the power to detect the leak.
    const parentEnv = {
      PATH: process.env.PATH ?? '/usr/bin:/bin',
      JWT_SECRET: CANARY_SECRET,
    };
    const workDir = mkdtempSync(join(tmpdir(), 'r501-env-ctl-'));
    try {
      const { stdout } = await childEnvRoundTrip(parentEnv, workDir);
      expect(stdout).toContain(CANARY_SECRET);
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  });

  it('F1 the PRODUCTION execute() gives the child an env whose KEYS are a subset of the allow-list', async () => {
    // THIS is the arm that kills the M1 mutation (removing `env:` from the
    // spawn call). The two arms above pin the ALLOW-LIST LOGIC; this one pins
    // that the production spawn call actually USES it.
    //
    // It has to be a KEY-SET assertion rather than a "the secret is absent"
    // assertion, because of a Jest quirk: the `process.env` a test file sees
    // is a SANDBOX COPY, so the env a child would inherit without an explicit
    // `env:` option does NOT contain JWT_SECRET either. A "the secret is
    // absent" arm is therefore GREEN on the unfixed source — it cannot fail.
    // (That was measured: the M1 arm of scripts/r501_matrix.py came back
    // 9/9 GREEN against the reverted source.)
    //
    // The KEY SET is not subject to that quirk: without an explicit `env:`,
    // the child inherits the worker's real environment (HOSTNAME, PWD, npm_*
    // and so on), which is strictly larger than the allow-list. With the fix,
    // the child's env carries ONLY allow-listed names.
    //
    // THE ASSERTION IS ABOUT THE INTERSECTION WITH THE PARENT.
    //
    // The first version of this arm asserted that EVERY key the child reports
    // is on the allow-list. That is stricter than the fix can deliver, and
    // the matrix proved it: the M4 negative control (allow-list narrowed to
    // PATH only) came back RED — not because narrowing the allow-list is a
    // security regression, but because CPython ITSELF injects `LC_CTYPE` into
    // `os.environ` when the environment carries no locale variable:
    //
    //   explicit {PATH} only          -> ["LC_CTYPE", "PATH"]
    //   explicit full allow-list      -> ["LANG", "LC_ALL", "PATH", "TZ"]
    //   full inherited parent env     -> 104 keys, incl. every API key
    //
    // So the interpreter adds a key the product never passed. The security
    // property is not "the child sees only allow-listed names" — it is
    // "the child sees no VALUE THE PARENT HAD, except the allow-listed
    // names". That is exactly what the intersection expresses, and it is
    // immune to what the interpreter does to the environment it is handed.
    const sandbox = new PythonSandbox();
    const code = [
      'import os, json',
      'def probe():',
      '    return json.dumps(sorted(os.environ.keys()))',
    ].join('\n');

    const result = await sandbox.execute(code, '');

    expect(result.success).toBe(true);
    const childKeys = JSON.parse(result.output) as string[];

    const parentKeys = new Set(Object.keys(process.env));
    const allowList = SANDBOX_ENV_ALLOWLIST as readonly string[];

    // The parent must actually HAVE non-allow-listed names, otherwise the
    // arm below is vacuous (nothing could leak).
    const parentNonAllowListed = [...parentKeys].filter((k) => !allowList.includes(k));
    expect(parentNonAllowListed.length).toBeGreaterThan(0);

    // The property: no parent value reaches the child outside the allow-list.
    const leaked = childKeys.filter((k) => parentKeys.has(k) && !allowList.includes(k));
    expect(leaked).toEqual([]);

    // And the child must not have inherited the parent's environment wholesale.
    expect(childKeys.length).toBeLessThan(parentKeys.size);
  });

  it('F1 the child does not see an arbitrary non-allow-listed parent variable', () => {
    const built = buildSandboxEnv({
      PATH: '/usr/bin',
      JWT_SECRET: CANARY_SECRET,
      ADMIN_PASSWORD: CANARY_SECRET,
      SOME_FUTURE_SECRET: CANARY_SECRET,
    } as NodeJS.ProcessEnv);

    expect(built.JWT_SECRET).toBeUndefined();
    expect(built.ADMIN_PASSWORD).toBeUndefined();
    expect(built.SOME_FUTURE_SECRET).toBeUndefined();
    expect(built.PATH).toBe('/usr/bin');
    // Every key must be on the allow-list. This is the property that makes a
    // FUTURE secret safe by default.
    for (const key of Object.keys(built)) {
      expect((SANDBOX_ENV_ALLOWLIST as readonly string[])).toContain(key);
    }
  });

  it('F1 HOME is not passed: it points at the server user home, where credential files live', () => {
    const built = buildSandboxEnv({ HOME: '/root', PATH: '/usr/bin' } as NodeJS.ProcessEnv);
    expect(built.HOME).toBeUndefined();
  });

  // ---- F2: working directory ----------------------------------------------

  it('F2 the child does not run in the server working directory', async () => {
    const sandbox = new PythonSandbox();
    const code = [
      'import os',
      'def probe():',
      '    return os.getcwd()',
    ].join('\n');

    const result = await sandbox.execute(code, '');

    expect(result.success).toBe(true);
    const cwd = result.output.trim();
    expect(cwd).not.toBe(process.cwd());
    // The server's own data directory must not be the child's CWD.
    expect(cwd).not.toBe(join(process.cwd(), 'data'));
  });

  it('F2 the child cannot reach the live benchmark database by a relative path', async () => {
    // Build a decoy "server working directory" that contains a data/ dir
    // holding a real SQLite file, so the probe is a REAL reachability test
    // rather than a string comparison.
    const serverRoot = mkdtempSync(join(tmpdir(), 'r501-server-root-'));
    const dataDir = join(serverRoot, 'data');
    mkdirSync(dataDir, { recursive: true });
    const dbPath = join(dataDir, 'llm-bench.db');
    writeFileSync(dbPath, 'not-a-real-db');

    // Point the process at that root for the duration of the child.
    const previousCwd = process.cwd();
    try {
      process.chdir(serverRoot);
      const sandbox = new PythonSandbox();
      const code = [
        'import os',
        'def probe():',
        '    p = "data/llm-bench.db"',
        '    return "EXISTS" if os.path.exists(p) else "ABSENT"',
      ].join('\n');

      const result = await sandbox.execute(code, '');

      expect(result.success).toBe(true);
      expect(result.output.trim()).toBe('ABSENT');
    } finally {
      process.chdir(previousCwd);
      rmSync(serverRoot, { recursive: true, force: true });
    }
  });

  it('F2 the child cannot WRITE into the server working directory by a relative path', async () => {
    const serverRoot = mkdtempSync(join(tmpdir(), 'r501-server-root-w-'));
    const previousCwd = process.cwd();
    try {
      process.chdir(serverRoot);
      const sandbox = new PythonSandbox();
      const code = [
        'import os',
        'def probe():',
        '    open("planted-by-sandbox.txt", "w").write("x")',
        '    return "WROTE"',
      ].join('\n');

      const result = await sandbox.execute(code, '');

      expect(result.success).toBe(true);
      // The file must NOT have appeared in the server's working directory.
      expect(existsSync(join(serverRoot, 'planted-by-sandbox.txt'))).toBe(false);
    } finally {
      process.chdir(previousCwd);
      rmSync(serverRoot, { recursive: true, force: true });
    }
  });

  // ---- the sandbox still works -------------------------------------------

  it('the sandbox still executes ordinary code correctly after the fix', async () => {
    const sandbox = new PythonSandbox();
    const result = await sandbox.execute('def add(a, b):\n    return a + b', '1, 2');
    expect(result.success).toBe(true);
    expect(result.output).toBe('3');
  });

  it('the child can still import the standard library (the fix is not over-restrictive)', async () => {
    const sandbox = new PythonSandbox();
    const code = [
      'import json, math',
      'def probe():',
      '    return json.dumps({"ok": True, "sqrt": round(math.sqrt(16), 1)})',
    ].join('\n');
    const result = await sandbox.execute(code, '');
    expect(result.success).toBe(true);
    expect(JSON.parse(result.output)).toEqual({ ok: true, sqrt: 4 });
  });
});
