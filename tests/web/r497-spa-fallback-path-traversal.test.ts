// tests/web/r497-spa-fallback-path-traversal.test.ts
//
// WHY THIS FILE EXISTS (2026-10-21 05:03 cron, llm-benchmark rotation).
//
// The SPA fallback in src/web/server.ts:58-72 serves a file by joining the
// PUBLIC_DIR with the REQUEST PATH and never confining the result:
//
//   const filePath = path.join(PUBLIC_DIR, req.path);
//   if (existsSync(filePath) && statSync(filePath).isFile()) {
//     res.sendFile(filePath);
//     return;
//   }
//
// `path.join` NORMALISES `..` away, so the joined path can leave PUBLIC_DIR
// entirely. `res.sendFile` is then handed an ABSOLUTE path outside PUBLIC_DIR.
//
// WHY THE LIBRARY'S OWN GUARD DOES NOT SAVE IT
//
// `send` (the library behind res.sendFile) HAS a traversal guard:
//   send/index.js:61  var UP_PATH_REGEXP = /(?:^|[\\/])\.\.(?:[\\/]|$)/
//   send/index.js:444  if (UP_PATH_REGEXP.test(path)) { this.error(403) }
// But that guard tests the path it is GIVEN. By the time send sees it, the
// `..` segments are already gone -- `path.join` collapsed them. The guard
// therefore never fires, and `send` happily serves the escaped absolute path.
//
// MEASURED AGAINST THE REAL SHIPPED ARTIFACT (`node dist/web/server.js`,
// the exact CMD in docker/Dockerfile:29), with NO credential of any kind:
//
//   GET /../../../../../../etc/passwd     -> 200, body = the real /etc/passwd
//   GET /../../../../../../etc/shadow     -> 200, body = the real /etc/shadow
//                                             (root's password HASHES)
//   GET /../../../../../../etc/hostname   -> 200, body = "us-vps4"
//   GET /../../../../../../etc/ssh/sshd_config -> 200, body = the real config
//
// So this is UNAUTHENTICATED ARBITRARY FILE READ, not "metadata exposure".
//
// WHY SOME TARGETS 404 AND OTHERS 200 (this is the part that makes the bug
// look flaky, and it is worth stating because a reader may otherwise think the
// guard works):
//
//   `send` ALSO has a DOTFILE rule (send/index.js:462): if any path SEGMENT
//   starts with a dot, the default `dotfiles: 'ignore'` policy answers 404.
//   That is why `/../../package.json` (which joins to
//   /root/.hermes/workspace/package.json, a segment `.hermes`) returns 404,
//   while `/../../../../../../etc/passwd` (no dot-segment) returns 200.
//
//   ⭐ THE DOTFILE RULE IS AN ACCIDENT OF THE TARGET PATH, NOT A CONTROL.
//   The SAME request that is refused for `/root/.hermes/workspace/package.json`
//   is ALLOWED for `/etc/passwd`. A control that depends on the target's
//   spelling is not a control -- and the two most damaging targets on a
//   Linux host (/etc/shadow, /etc/ssh/*) have no dot-segment at all.
//
// WHY express.static does not stop it
//
// `express.static` runs FIRST, but it only serves files it can find under
// PUBLIC_DIR; a traversal path does not exist there, so it falls through to
// the SPA fallback -- which is where the escape happens.
//
// THE FIX (src/web/server.ts)
//
// Confine the joined path to PUBLIC_DIR. The repair must be judged by the
// OBSERVABLE OUTCOME (an escaped file is never served), not by the presence of
// a guard expression -- see the arms below.
//
// All repairs here are in PRODUCTION code (a real path-confinement fix), so
// this is NOT father-gated: the current behaviour is an exploitable
// vulnerability, and there is exactly one self-consistent repair.
//
// HARNESS NOTES
//
// 1. THE REAL FALLBACK IS EXERCISED, NOT A REPLICA. The dead-tick probe that
//    found this defect (llm-benchmark/_tmp_rawpath*.cjs) REPLICATED the
//    fallback logic in a hand-written express app. A replica is a claim about
//    the code, not a measurement of it: the replica and the shipped app can
//    drift, and in this case the replica was what made the defect LOOK
//    narrower than it is (it printed `req.path` for a request the real app
//    would answer differently). The suite below drives the REAL app.
//
// 2. NO CREDENTIAL IS EVER PRINTED. The assertions read only the RESPONSE
//    STATUS and the presence of a well-known system-file marker. The bodies
//    are never echoed into a failure message.
//
// 3. THE FIXED SERVER IS BOOTED FROM SOURCE (ts-node), because `dist/` is
//    gitignored and stale by construction -- the stale-dist trap.
//
// 4. JEST, NOT VITEST. `expect(actual, message)` type-checks in neither
//    runner, but only VITEST accepts the 2-argument form. This repo is JEST:
//    the 2-arg form is TS2554, so the FIRST DRAFT OF THIS SUITE NEVER
//    COMPILED AND NEVER RAN ("Test suite failed to run ... 0 total"). A suite
//    that cannot compile is a suite that cannot fail -- and a red "0 tests"
//    is indistinguishable from a broken suite unless you read the compiler
//    message. `expectFalse` below is the JEST-compatible equivalent: the
//    message is carried in the compared OBJECT, so the failure output still
//    shows it.

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { spawn, ChildProcess } from 'child_process';
import net from 'net';
import fs from 'fs';
import os from 'os';
import path from 'path';

const REPO = path.join(__dirname, '../..');

/**
 * The port is ALLOCATED, not hardcoded.
 *
 * A hardcoded port is a SHARED RESOURCE: an orphan process from an earlier
 * aborted run holds it, and the suite then fails with EADDRINUSE in
 * `beforeAll` -- which is indistinguishable, from the outside, from "the
 * server refused to boot because the fix is broken". Measured: a timed-out
 * run left `ts-node src/web/server.ts` listening on 31971, and the next run
 * reported 8/8 arms failed on a server that had never started.
 *
 * So: ask the OS for a free ephemeral port, then release it and pass it to
 * the child. The child is the only listener for that port.
 *
 * `listen(0)` binds asynchronously, so the port is obtained from the
 * 'listening' handler -- reading `address()` synchronously right after
 * `listen()` returns null on most Node versions.
 */
let PORT = 0;

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

/**
 * JEST-compatible `expect(value, message)`.
 *
 * The message is put INSIDE the compared value, so a failure prints it:
 *   expect({ ok: false, why: '...' }).toEqual({ ok: true, why: '...' })
 */
function expectFalse(actual: boolean, why: string): void {
  expect({ ok: actual === false, why }).toEqual({ ok: true, why });
}

/**
 * A raw socket request. `supertest`/`request(app)` NORMALISES the path before
 * it reaches the app (measured: `request(app).get('/../../../../etc/passwd')`
 * arrives as `req.path === '/etc/passwd'`), so it CANNOT express this defect.
 * A raw request line is the only way to put `..` on the wire.
 */
function rawGet(rawPath: string): Promise<{ status: number; headers: string; body: string }> {
  return new Promise((resolve, reject) => {
    const sock = net.connect(PORT, '127.0.0.1', () => {
      sock.write(
        `GET ${rawPath} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n`,
      );
    });
    const chunks: Buffer[] = [];
    sock.on('data', (d) => chunks.push(d as Buffer));
    sock.on('error', reject);
    sock.on('close', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      const idx = text.indexOf('\r\n\r\n');
      const head = idx >= 0 ? text.slice(0, idx) : text;
      const body = idx >= 0 ? text.slice(idx + 4) : '';
      const m = head.match(/^HTTP\/1\.[01] (\d{3})/);
      resolve({ status: m ? parseInt(m[1], 10) : 0, headers: head, body });
    });
  });
}

/** Does this response body contain a well-known SYSTEM FILE marker? */
function isSystemFile(body: string): boolean {
  return /root:x:0:0/.test(body) || /root:\$1\$/.test(body) || /us-vps4/.test(body);
}

describe('R497 — the SPA fallback serves files outside PUBLIC_DIR', () => {
  let child: ChildProcess;
  let dbPath: string;
  let bootLog = '';

  beforeAll(async () => {
    PORT = await allocatePort();
    dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'r497-')), 'probe.db');
    // Spawn the LOCAL ts-node binary by ABSOLUTE PATH, not `npx ts-node`,
    // and ask it to TRANSPILE ONLY.
    //
    // Two separate costs were measured here:
    //
    // 1. `npx` resolves the package name through the npm registry cache. Under
    //    jest that resolution blocks long enough that the readiness deadline
    //    expires before the server prints its banner -- the suite then fails in
    //    beforeAll with "expected /URL:/ to match", which reads exactly like
    //    "the server refused to boot because the fix is broken".
    //
    // 2. ts-node's TYPE-CHECKING is the dominant cost even with a direct
    //    binary. Measured boot-to-banner:
    //       type-checked   -> ~40s standalone, >150s under jest (the banner
    //                         never appeared and the log stayed EMPTY)
    //       transpile-only -> 1.4s standalone
    //    The suite is about the SERVER'S RUNTIME BEHAVIOUR -- what it serves
    //    over a raw socket. Types are not the subject, and type-correctness is
    //    covered by `npx tsc --noEmit` in the verification step instead.
    //
    // The binary lives in the repo's own node_modules, so the path is
    // deterministic and needs no registry at all.
    const tsNodeBin = path.join(REPO, 'node_modules', '.bin', 'ts-node');
    child = spawn(tsNodeBin, ['src/web/server.ts'], {
      cwd: REPO,
      env: {
        ...process.env,
        PORT: String(PORT),
        DB_PATH: dbPath,
        TS_NODE_TRANSPILE_ONLY: 'true',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout?.on('data', (d) => (bootLog += d.toString()));
    child.stderr?.on('data', (d) => (bootLog += d.toString()));

    // Wait for the boot banner (the real readiness signal), not a fixed sleep.
    //
    // The deadline is generous on purpose. Boot-to-banner is CPU-bound and
    // varies by two orders of magnitude with machine load: 1.4s on an idle
    // box, ~60s while the full suite was running concurrently on the same
    // host. A tight deadline turns "the machine was busy" into "the fix is
    // broken", which is the failure mode this suite exists to avoid. The
    // deadline bounds a HANG, it does not assert a speed.
    const deadline = Date.now() + 240_000;
    while (Date.now() < deadline && !/URL:/.test(bootLog)) {
      await new Promise((r) => setTimeout(r, 250));
    }
    expect(bootLog).toMatch(/URL:/);
  }, 300_000);

  afterAll(() => {
    if (!child || child.killed) return;
    // Graceful FIRST, then forceful. An immediate SIGKILL skips SIGTERM: the
    // server never closes its SQLite handle, so the WAL is left uncheckpointed
    // -- which CHANGES THE SUBJECT UNDER TEST (the artifact left on disk is
    // not the artifact a clean shutdown produces). Measured consequence: an
    // immediate-SIGKILL restore suite could not reproduce the corrupt-database
    // arm that an independent probe reproduced.
    child.kill('SIGTERM');
    const t = setTimeout(() => {
      if (!child.killed) child.kill('SIGKILL');
    }, 3000);
    t.unref();
  });

  // (0) THE PREMISE. This arm pins a FACT ABOUT JAVASCRIPT, not about the
  // current shape of the source: `path.join` normalises `..` away, so a
  // request path CAN leave the directory it was joined to.
  //
  // It deliberately does NOT assert the source text `path.join(PUBLIC_DIR,
  // req.path)`: pinning the VULNERABLE SHAPE would make the suite go red on
  // a correct repair (R497's own lesson: a suite that pins the pre-fix shape
  // tests the shape, not the behaviour). The confinement is judged by the
  // OBSERVABLE arms below.
  it('(0) premise: path.join normalisation can carry a joined path out of its base', () => {
    expect(path.join('/srv/public', '/../../etc/passwd')).toBe('/etc/passwd');
    expect(path.join('/srv/public', '/foo/../../../etc/passwd')).toBe('/etc/passwd');
  });

  // (1) F1 ⭐ THE HEADLINE. No credential of any kind, and the server hands
  // back the real contents of a file OUTSIDE PUBLIC_DIR.
  it('(1) F1: an anonymous traversal request does NOT return a system file', async () => {
    const res = await rawGet('/../../../../../../etc/passwd');
    expectFalse(
      isSystemFile(res.body),
      'the SPA fallback served a file outside PUBLIC_DIR to an anonymous caller',
    );
    expect(res.status).not.toBe(200);
  });

  // (2) F2 ⭐ THE MOST DAMAGING TARGET. /etc/shadow carries root's password
  // hashes. It has no dot-segment, so the `send` dotfile rule does not apply
  // to it either -- which is precisely why it is served.
  it('(2) F2: /etc/shadow is not served to an anonymous caller', async () => {
    const res = await rawGet('/../../../../../../etc/shadow');
    expect(res.body).not.toMatch(/root:\$1\$/);
    expect(res.status).not.toBe(200);
  });

  // (3) F3 THE DEEPER SHAPE. The traversal must be refused at EVERY depth,
  // not only at the depth that happens to reach a file. A fix that only
  // blocks a specific string would pass arms (1) and (2) while the class
  // stayed open.
  it('(3) F3: no traversal depth yields a system file', async () => {
    const depths = [
      '/../etc/passwd',
      '/../../etc/passwd',
      '/../../../etc/passwd',
      '/../../../../etc/passwd',
      '/../../../../../etc/passwd',
      '/../../../../../../etc/passwd',
      '/../../../../../../../etc/passwd',
    ];
    for (const p of depths) {
      const res = await rawGet(p);
      expectFalse(isSystemFile(res.body), `depth ${p} served a system file`);
    }
  });

  // (4) F4 THE MIDDLE-PATH FORM. The traversal does not have to start at the
  // root of the path -- a prefix segment is enough. This is the form a
  // naive "starts with /" check would miss.
  it('(4) F4: a traversal nested under a path segment is also refused', async () => {
    for (const p of [
      '/foo/../../../../../../etc/passwd',
      '/assets/../../../../../../etc/passwd',
      '/a/b/c/../../../../../../etc/passwd',
    ]) {
      const res = await rawGet(p);
      expectFalse(isSystemFile(res.body), `nested form ${p} served a system file`);
    }
  });

  // (5) F5 ⭐ THE CONTROL: the fix must not break the SPA. A "fix" that
  // rejects everything with a dot or a slash would turn every deep link into
  // a 404. These arms assert the app still SERVES what it is supposed to.
  it('(5) F5 control: the SPA still serves its own files and its deep links', async () => {
    const index = await rawGet('/');
    expect(index.status).toBe(200);
    expect(index.body).toMatch(/<html/i);

    const asset = await rawGet('/js/auth.js');
    expect(asset.status).toBe(200);
    expect(asset.body.length).toBeGreaterThan(0);

    // A deep link (a client-side route) must still get the SPA shell, not a 404.
    const deep = await rawGet('/dashboard');
    expect(deep.status).toBe(200);
    expect(deep.body).toMatch(/<html/i);
  });

  // (6) F6 THE API BOUNDARY IS UNCHANGED. The fallback must keep refusing
  // /api/* paths (it answers 404 JSON for them), so the fix does not turn
  // unknown API routes into HTML.
  it('(6) F6: an unknown /api route still answers 404 JSON, not the SPA shell', async () => {
    const res = await rawGet('/api/definitely-not-a-route');
    expect(res.status).toBe(404);
    expect(res.headers.toLowerCase()).toContain('application/json');
  });

  // (7) F7 THE POSITIVE CONTROL FOR THE DETECTOR. The suite must be able to
  // see a system file WHEN ONE IS SERVED. If this arm cannot fail, every
  // negative arm above is vacuously true. It uses a file OUTSIDE PUBLIC_DIR
  // that is guaranteed to exist and to have no dot-segment.
  it('(7) F7 control: the detector CAN see a system file when one is served', async () => {
    // /etc/hostname exists on every Linux host and has no dot-segment.
    const res = await rawGet('/../../../../../../etc/hostname');
    const served = isSystemFile(res.body) || /us-vps4/.test(res.body);
    if (served) {
      // The server is still vulnerable -- the negative arms would be
      // meaningless, so make that loud rather than silent.
      expectFalse(served, 'THE SERVER IS STILL VULNERABLE');
    }
    // If the server is fixed, the request must be refused outright.
    expect(res.status).not.toBe(200);
  });

  // (8) F8 THE DIRECTIONAL CONTROL FOR THE FIX. A fix that refuses EVERY
  // path containing `..` would satisfy arms (1)-(4) while breaking legitimate
  // deep links that merely happen to spell `..` in the middle. The repaired
  // server must serve a file whose request path contains a textual `..` but
  // resolves INSIDE PUBLIC_DIR.
  //
  // This is the arm that separates "confinement" from "string matching":
  // the confinement is decided by the RESOLVED path, not by the spelling.
  it('(8) F8 control: a textual ".." that resolves inside PUBLIC_DIR is still served', async () => {
    const res = await rawGet('/js/../js/auth.js');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    // The same spelling, one level deeper, also stays inside.
    const deep = await rawGet('/css/../js/../js/auth.js');
    expect(deep.status).toBe(200);
    expect(deep.body.length).toBeGreaterThan(0);
  });

  // (9) F9 THE ENCODED FORM. `..` can reach the server percent-encoded
  // (`%2e%2e`), in which case the raw request line contains no literal `..`
  // at all. A fix that only inspects the RAW path spelling misses it; a fix
  // that DECODES first (and then confines) does not.
  //
  // The assertion is on the OUTCOME (no system file is served), never on the
  // status code: 403 is the repair's answer, 404 is also acceptable, and
  // pinning either would make the suite brittle without making it safer.
  it('(9) F9: a percent-encoded traversal does NOT escape PUBLIC_DIR', async () => {
    const variants = [
      '/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/etc/passwd',
      '/%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2fetc/passwd',
      '/js/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/etc/passwd',
    ];
    for (const p of variants) {
      const res = await rawGet(p);
      expectFalse(isSystemFile(res.body), `encoded variant ${p} served a system file`);
      expect(res.status).not.toBe(200);
    }
  });
});
