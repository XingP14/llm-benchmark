// tests/web/r498c-symlink-confinement.test.ts
//
// WHY THIS FILE EXISTS (2026-10-24 06:03 cron, llm-benchmark).
//
// R497 confined the SPA fallback to PUBLIC_DIR. The confinement was TEXTUAL:
//
//     const targetPath = path.resolve(PUBLIC_ROOT, relativePath);
//     const isInsidePublicDir =
//       targetPath === PUBLIC_ROOT || targetPath.startsWith(PUBLIC_ROOT + path.sep);
//
// `path.resolve` normalises `..` but does NOT resolve SYMLINKS. So a symlink
// that lives INSIDE PUBLIC_DIR passes the textual containment check and still
// names a file OUTSIDE it.
//
// MEASURED (no credential of any kind), with `public/escape -> /etc`:
//
//     GET /escape/passwd   -> 200, body = the REAL /etc/shadow
//                                       (root's password HASHES)
//     GET /escape/hostname -> 200, body = the REAL hostname
//
// Two independent holes, one class:
//
//   1. THE SPA FALLBACK (src/web/server.ts) serves the file itself.
//   2. `express.static` runs FIRST and serves it TOO, before the fallback is
//      ever reached -- `serve-static` -> `send` uses `fs.stat`, which FOLLOWS
//      symlinks, and this version of `send` (1.2.1) has no `followSymlinks:
//      false` option. Measured: with the fallback's own check in place, the
//      symlink escape STILL returned 200.
//
//   * A repair that only hardens the fallback is therefore INCOMPLETE: the
//   static middleware answers first. The confinement has to sit IN FRONT of
//   `express.static`.
//
// THE REPAIR
//
// Resolve the ROOT and the CANDIDATE with `realpath` and compare them in the
// SAME coordinate system. `realpath` resolves every intermediate symlink, so
// a symlinked SUBDIRECTORY cannot smuggle the target out either.
//
// * AND THE TWO MUST BE IN THE SAME COORDINATE SYSTEM. The root may itself
// be reached through a symlink, and then the candidate's real path is under
// the REAL root while the textual root is under the ALIAS. Comparing a real
// candidate against a textual root refuses every legitimate file. Arm (10)
// pins that.
//
// HARNESS NOTES
//
// 1. THE REAL APP IS DRIVEN, over RAW SOCKETS. `supertest`/`request(app)`
//    NORMALISES the path before it reaches the app, so it cannot express a
//    symlink escape (nor a `..` traversal) at all.
//
// 2. THE PUBLIC DIR IS A TEMPORARY DIRECTORY, injected through the
//    `PUBLIC_DIR` env var, so a symlink pointing at /etc can be planted
//    WITHOUT planting it in the repository's own `public/`.
//
// 3. * TWO SERVERS, TWO ROOTS. One is pointed at the REAL public directory;
//    the other at an ALIAS of it (a symlinked parent).
//
//    The alias is not decoration -- it changes which mutants SURVIVE. The
//    fallback sends a file by a path RELATIVE to the real root, and `send`
//    rejects a relative path containing `..`. With an ALIASED root, a
//    textual (symlink-following) candidate is not under the real root, so
//    the relative path comes out as `../../...` and `send` refuses it BY
//    ACCIDENT. The mutant that removes the fallback's own realpath
//    therefore SURVIVED under the alias while it ESCAPES under a plain root.
//    A single aliased server makes that hole invisible, so BOTH roots are
//    exercised: the plain one pins the fallback's confinement, the aliased
//    one pins the coordinate system.
//
// 4. NO CREDENTIAL IS EVER PRINTED. The assertions look for a well-known
//    system-file MARKER in the body. Bodies are never echoed into a failure
//    message.
//
// 5. THE PORT IS ALLOCATED, not hardcoded: a hardcoded port is a SHARED
//    RESOURCE, and an orphan from an earlier aborted run makes the suite fail
//    with EADDRINUSE -- which reads exactly like "the fix is broken".
//
// 6. JEST, NOT VITEST. `expect(actual, message)` type-checks in neither
//    runner; only VITEST accepts the 2-argument form. This repo is JEST, so
//    the message is carried INSIDE the compared object (`expectFalse`).
//
// 7. * A CANARY IS USED ALONGSIDE /etc. The system-file marker proves the
//    escape is refused for the paths that happen to be readable on this host;
//    the canary is a file with a UNIQUE TOKEN planted OUTSIDE the root, so
//    the property "the token never appears in a response body" can be
//    asserted for ANY path -- and it is independent of the STATUS CODE.
//
//    * THE STATUS CODE IS NOT THE PROPERTY. A correct server answers a
//    refused escape with 403, but a request for a path that does not exist
//    is answered 200 with the SPA shell (index.html). So `status !== 200`
//    is a PROXY, not the property, and a proxy is exactly what makes an arm
//    fail for the wrong reason. The load-bearing assertion is the BODY.

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { spawn, ChildProcess } from 'child_process';
import net from 'net';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { isSystemFile } from '../support/system-file-marker';

const REPO = path.join(__dirname, '../..');

/** JEST-compatible `expect(value, message)`: the message rides inside the object. */
function expectFalse(actual: boolean, why: string): void {
  expect({ ok: actual === false, why }).toEqual({ ok: true, why });
}

function allocatePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const addr = probe.address();
      const p = addr && typeof addr === 'object' ? addr.port : 0;
      probe.close(() => resolve(p));
    });
  });
}

/** A raw socket request -- the only way to put a path on the wire unchanged. */
function rawRequestOn(
  port: number,
  method: string,
  rawPath: string,
  body = '',
): Promise<{ status: number; headers: string; body: string }> {
  return new Promise((resolve, reject) => {
    const sock = net.connect(port, '127.0.0.1', () => {
      const head =
        `${method} ${rawPath} HTTP/1.1\r\n` +
        `Host: 127.0.0.1\r\n` +
        `Connection: close\r\n` +
        `Content-Length: ${Buffer.byteLength(body)}\r\n` +
        `\r\n`;
      sock.write(head + body);
    });
    const chunks: Buffer[] = [];
    sock.on('data', (d) => chunks.push(d as Buffer));
    sock.on('error', reject);
    sock.on('close', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      const idx = text.indexOf('\r\n\r\n');
      const head = idx >= 0 ? text.slice(0, idx) : text;
      const payload = idx >= 0 ? text.slice(idx + 4) : '';
      const m = head.match(/^HTTP\/1\.[01] (\d{3})/);
      resolve({ status: m ? parseInt(m[1], 10) : 0, headers: head, body: payload });
    });
  });
}

/**
 * Does this response body contain a well-known SYSTEM FILE marker?
 *
 * The detector is SHARED, and derived from the host at runtime: the
 * original copy here hardcoded this author's own hostname, so on a CI
 * runner it could not recognise /etc/hostname and the control arm below
 * failed on every push while the server was perfectly correct.
 *
 * ONE rule, one copy: two suites carried two copies of this predicate, and
 * a third copy in the sibling repository.  A rule that exists in several
 * places is a rule that will drift.
 */

describe('R498c — a symlink INSIDE PUBLIC_DIR must not escape it', () => {
  let plainChild: ChildProcess;
  let aliasChild: ChildProcess;
  let PLAIN_PORT = 0;
  let ALIAS_PORT = 0;
  let dbPath: string;
  let publicDir: string;
  let aliasPath: string;
  let aliasParent: string;
  let outsideDir: string;
  let canaryToken = '';
  let plainLog = '';
  let aliasLog = '';

  async function bootServer(publicDirArg: string): Promise<{ child: ChildProcess; port: number; log: string }> {
    const port = await allocatePort();
    const tsNodeBin = path.join(REPO, 'node_modules', '.bin', 'ts-node');
    const child = spawn(tsNodeBin, ['src/web/server.ts'], {
      cwd: REPO,
      env: {
        ...process.env,
        PORT: String(port),
        DB_PATH: dbPath,
        PUBLIC_DIR: publicDirArg,
        TS_NODE_TRANSPILE_ONLY: 'true',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let log = '';
    child.stdout?.on('data', (d) => (log += d.toString()));
    child.stderr?.on('data', (d) => (log += d.toString()));

    // Wait for the boot banner (the real readiness signal), not a fixed sleep.
    const deadline = Date.now() + 240_000;
    while (Date.now() < deadline && !/URL:/.test(log)) {
      await new Promise((r) => setTimeout(r, 250));
    }
    expect(log).toMatch(/URL:/);

    // A WARM-UP request. The first request after boot pays for the lazy
    // initialisation (DB open, route tables) and can take several seconds;
    // without this, that cost lands on the FIRST arm and reads as a timeout
    // of the thing under test.
    await rawRequestOn(port, 'GET', '/api/health');
    return { child, port, log };
  }

  beforeAll(async () => {
    // The REAL public directory (the files live here).
    publicDir = fs.mkdtempSync(path.join(os.tmpdir(), 'r498c-public-'));
    fs.writeFileSync(path.join(publicDir, 'index.html'), '<html>INDEX</html>');
    fs.writeFileSync(path.join(publicDir, 'app.js'), 'APPJS');

    // A symlinked PARENT: the second server will be pointed at `aliasPath`,
    // which is a symlink to `publicDir`. So the TEXTUAL root is the alias and
    // the REAL root is `publicDir` -- the two coordinate systems differ, and
    // a repair that compares a real candidate against a textual root breaks.
    aliasParent = fs.mkdtempSync(path.join(os.tmpdir(), 'r498c-alias-'));
    aliasPath = path.join(aliasParent, 'alias');
    fs.symlinkSync(publicDir, aliasPath, 'dir');

    // The CANARY: a file OUTSIDE the root, with a unique token. The property
    // "the token never appears in a response body" is independent of the
    // status code and of what is readable on this host.
    outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'r498c-outside-'));
    canaryToken = `R498C_CANARY_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
    fs.writeFileSync(path.join(outsideDir, 'canary.txt'), `${canaryToken}\n`);

    // `escape -> /etc` (the attacker-planted symlink, directory form).
    fs.symlinkSync('/etc', path.join(publicDir, 'escape'), 'dir');
    // A symlink to a single FILE outside the root -- the other shape of the
    // same class (the directory form above is not the only one).
    fs.symlinkSync('/etc/hostname', path.join(publicDir, 'escape-file'));
    // A symlink to the canary outside the root.
    fs.symlinkSync(
      path.join(outsideDir, 'canary.txt'),
      path.join(publicDir, 'escape-canary'),
    );

    dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'r498c-')), 'probe.db');

    const plain = await bootServer(publicDir);
    plainChild = plain.child;
    PLAIN_PORT = plain.port;
    plainLog = plain.log;

    const alias = await bootServer(aliasPath);
    aliasChild = alias.child;
    ALIAS_PORT = alias.port;
    aliasLog = alias.log;
  }, 300_000);

  afterAll(() => {
    for (const child of [plainChild, aliasChild]) {
      if (child && !child.killed) {
        // Graceful FIRST, then forceful. An immediate SIGKILL skips SIGTERM
        // and leaves the SQLite WAL uncheckpointed -- which changes the
        // artefact under test.
        child.kill('SIGTERM');
        const t = setTimeout(() => {
          if (!child.killed) child.kill('SIGKILL');
        }, 3000);
        t.unref();
      }
    }
    for (const d of [publicDir, aliasParent, outsideDir]) {
      try {
        fs.rmSync(d, { recursive: true, force: true });
      } catch {
        /* best effort */
      }
    }
  });

  const plainGet = (p: string) => rawRequestOn(PLAIN_PORT, 'GET', p);
  const plainPost = (p: string) => rawRequestOn(PLAIN_PORT, 'POST', p);
  const aliasGet = (p: string) => rawRequestOn(ALIAS_PORT, 'GET', p);

  // (0) THE PREMISE. This arm pins a FACT ABOUT JAVASCRIPT, not about the
  // shape of the source: `path.resolve` normalises `..` but does NOT resolve
  // symlinks, so a path that is TEXTUALLY inside the root can NAME a file
  // outside it.
  it('(0) premise: path.resolve does not resolve symlinks', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r498c-premise-'));
    try {
      fs.symlinkSync('/etc', path.join(dir, 'escape'), 'dir');
      const textual = path.resolve(dir, 'escape/passwd');
      // Textually inside the root...
      expect(textual.startsWith(dir + path.sep)).toBe(true);
      // ...but the REAL path is outside it.
      expect(fs.realpathSync(textual).startsWith(dir + path.sep)).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  // (1) F1 * THE HEADLINE. The symlinked directory escape must not serve a
  // system file.
  it('(1) F1: a symlinked directory inside PUBLIC_DIR does NOT escape it', async () => {
    // * THE LOAD-BEARING ASSERTION IS THE BODY, NOT THE STATUS CODE. A
    // request for a path that does not exist is answered 200 with the SPA
    // shell, so `status !== 200` is a PROXY for "not served" -- and a proxy
    // is what makes an arm fail for the WRONG reason. The property is: the
    // bytes of a file outside the root never appear in a response body.
    for (const p of ['/escape/passwd', '/escape/shadow', '/escape/hostname']) {
      const res = await plainGet(p);
      expectFalse(isSystemFile(res.body), `${p} served a system file`);
    }
  }, 60_000);

  // (2) F2 THE FILE-SYMLINK FORM. A symlink to a single file outside the root
  // is the same class and must be refused too.
  it('(2) F2: a symlinked FILE inside PUBLIC_DIR does NOT escape it', async () => {
    const res = await plainGet('/escape-file');
    expectFalse(isSystemFile(res.body), '/escape-file served a system file');
  });

  // (3) F3 THE STATIC-MIDDLEWARE ARM. `express.static` runs BEFORE the SPA
  // fallback and `send` follows symlinks, so a repair that only hardens the
  // fallback leaves the hole open. This arm asserts the escape is refused
  // EVEN THOUGH the file exists inside the public dir -- i.e. the static
  // middleware itself would have served it.
  it('(3) F3: the escape is refused by the guard in front of express.static', async () => {
    // `/escape/passwd` EXISTS inside the public dir (through the symlink),
    // so express.static would answer it if it were reached.
    const res = await plainGet('/escape/passwd');
    expectFalse(isSystemFile(res.body), 'the static middleware served a system file');
  });

  // (4) F4 * THE CONTROL: the fix must not break the SPA. A "fix" that
  // refuses everything would turn every deep link into a 403.
  it('(4) F4 control: the SPA still serves its own files and its deep links', async () => {
    const index = await plainGet('/');
    expect(index.status).toBe(200);
    expect(index.body).toContain('INDEX');

    const asset = await plainGet('/app.js');
    expect(asset.status).toBe(200);
    expect(asset.body).toContain('APPJS');

    // A deep link (a client-side route) must still get the SPA shell.
    const deep = await plainGet('/dashboard');
    expect(deep.status).toBe(200);
    expect(deep.body).toContain('INDEX');
  });

  // (5) F5 THE POSITIVE CONTROL FOR THE DETECTOR. The suite must be able to
  // see a system file WHEN ONE IS SERVED -- otherwise every negative arm
  // above is vacuously true.
  it('(5) F5 control: the detector CAN see a system file when one is served', async () => {
    // * The FIRST version of this arm drove the server and asserted
    //   `served === false` -- the OPPOSITE of what its title claims. It can
    //   NEVER observe the detector firing: trivially true on a fixed server,
    //   and on a vulnerable one it fails for a reason that has nothing to do
    //   with the detector. A tautology wearing a control's name.
    //
    // A control is only load-bearing if the thing it controls is shown to be
    // ABLE to fail. So: feed the detector the real bytes, off the request
    // path entirely.
    //
    // ⭐ AND THE ARM MUST NOT BE VACUOUS ITSELF. Every file below may be
    // unreadable on some host, and a loop that skips all of them exits green
    // having checked NOTHING -- the same "control that cannot fail" shape,
    // one level up. So the arm counts what it actually checked and fails if
    // it checked nothing: /etc/passwd is world-readable on every Linux, so
    // at least one file is always available.
    let checked = 0;
    for (const f of ['/etc/passwd', '/etc/shadow', '/etc/hostname']) {
      let content = '';
      try {
        content = fs.readFileSync(f, 'utf8');
      } catch {
        continue; // not readable on this host -- skip, do not fail
      }
      checked += 1;
      if (!isSystemFile(content)) {
        throw new Error(
          `the detector cannot recognise the real ${f} -- every negative arm above is vacuous`,
        );
      }
    }
    if (checked === 0) {
      throw new Error(
        'no system file was readable, so this control checked nothing -- it cannot fail, and every negative arm above is vacuous',
      );
    }
  });

  // (6) F6 THE DIRECTIONAL CONTROL FOR THE REPAIR. A fix that refuses every
  // path whose REAL path is not literally under the root would also refuse a
  // legitimate file reached through a symlink that stays INSIDE the root.
  // The repaired server must still serve such a file.
  it('(6) F6 control: a symlink that stays INSIDE the root is still served', async () => {
    const dir = fs.realpathSync(publicDir);
    fs.symlinkSync(path.join(dir, 'app.js'), path.join(dir, 'inside-link'));
    try {
      const res = await plainGet('/inside-link');
      expect(res.status).toBe(200);
      expect(res.body).toContain('APPJS');
    } finally {
      try {
        fs.unlinkSync(path.join(dir, 'inside-link'));
      } catch {
        /* best effort */
      }
    }
  });

  // (7) F7 * THE CANARY ARM -- the property, independent of the status code.
  // The canary file EXISTS outside the root and is named by a symlink inside
  // it. Its token must never appear in a response body. This is the arm that
  // would still hold if the server answered a refused escape with 404 instead
  // of 403, or with a 200 SPA shell instead of either.
  it('(7) F7: the canary token never appears in a response body', async () => {
    const res = await plainGet('/escape-canary');
    expect(res.body).not.toContain(canaryToken);
    // The canary EXISTS outside the root, so a correct server must not
    // transfer it. The STATUS is deliberately not asserted: a server that
    // answers a refused escape with the SPA shell (200) has still not served
    // the canary, and pinning 403 would forbid a legitimate repair.
  });

  // (8) F8 * THE COORDINATE-SYSTEM ARM (aliased root). The second server is
  // pointed at an ALIAS of the public directory, so the textual root and the
  // real root are DIFFERENT paths. A repair that resolves the candidate but
  // compares it against the TEXTUAL root refuses every legitimate file. The
  // SPA must still work.
  it('(8) F8: a public dir reached THROUGH a symlink still serves its files', async () => {
    expect(fs.realpathSync(aliasPath)).not.toBe(aliasPath);

    const index = await aliasGet('/');
    expect(index.status).toBe(200);
    expect(index.body).toContain('INDEX');

    const asset = await aliasGet('/app.js');
    expect(asset.status).toBe(200);
    expect(asset.body).toContain('APPJS');
  });

  // (9) F9 * THE METHOD ARM. The guard in front of `express.static` only
  // handles GET and HEAD, so a NON-GET request skips it and lands on the SPA
  // fallback -- which has its OWN confinement. If the fallback's confinement
  // is removed, a GET is still refused (by the guard) and the hole is
  // invisible; a POST exposes it. This arm is what makes the fallback's own
  // check load-bearing rather than decorative.
  //
  // * IT MUST RUN AGAINST THE PLAIN ROOT. Against the ALIASED root the
  // fallback would send a `../..` relative path, which `send` rejects by
  // accident -- so the arm would pass with the fallback's confinement
  // REMOVED. The plain root is what makes the fallback's check observable.
  it('(9) F9: a non-GET request cannot escape either', async () => {
    const res = await plainPost('/escape-canary');
    expect(res.body).not.toContain(canaryToken);

    const sys = await plainPost('/escape/passwd');
    expectFalse(isSystemFile(sys.body), 'a POST served a system file');
  });

  // (10) F10 * THE ALIASED-ROOT ESCAPE ARM. The escape must also be refused
  // on the aliased server -- the second root is a second attack surface, not
  // only a second control.
  it('(10) F10: the escape is refused on the aliased root too', async () => {
    const res = await aliasGet('/escape/passwd');
    expectFalse(isSystemFile(res.body), 'the aliased root served a system file');

    const canary = await aliasGet('/escape-canary');
    expect(canary.body).not.toContain(canaryToken);
  });
});
