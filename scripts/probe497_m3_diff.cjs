#!/usr/bin/env node
/**
 * R497 differential probe -- adjudicate the M3 SURVIVOR.
 *
 * M3 = "send by absolute path again" (drop the `{ root: PUBLIC_ROOT }` form).
 * The suite stayed green under M3. Per the discipline, a survivor is a
 * HYPOTHESIS, not a verdict: the question is whether M3 is an EQUIVALENT
 * mutant (behaviourally identical to the fix) or a REAL GAP (a behaviour the
 * suite cannot see).
 *
 * This probe boots the REAL server from source (transpile-only) and issues
 * raw-socket requests, so the observable is the shipped runtime.
 *
 * Usage: node probe_m3_diff.cjs <variant: fixed|m3>
 */
const { spawn } = require('child_process');
const net = require('net');
const fs = require('fs');
const os = require('os');
const path = require('path');

// The system-file marker is DERIVED from the host, never hardcoded: the
// original probe carried this author's own hostname (`/us-vps4/`), so on
// any other host it reported `sysfile=no` for a body that WAS a system
// file -- the probe measured nothing and said so in the wrong direction.
const HOSTNAME = (() => {
  try {
    return fs.readFileSync('/etc/hostname', 'utf8').trim();
  } catch {
    return '';
  }
})();
const SYSFILE_MARKERS = ['root:x:0:0', 'root:$1$', HOSTNAME].filter((m) => m.length > 0);
const isSystemFile = (body) => SYSFILE_MARKERS.some((m) => body.includes(m));

const REPO = '/root/.hermes/workspace/llm-benchmark';
const variant = process.argv[2] || 'fixed';

function allocatePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const p = probe.address().port;
      probe.close(() => resolve(p));
    });
  });
}

function rawGet(port, rawPath) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(port, '127.0.0.1', () => {
      sock.write(`GET ${rawPath} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n`);
    });
    const chunks = [];
    sock.on('data', (d) => chunks.push(d));
    sock.on('error', reject);
    sock.on('close', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      const i = text.indexOf('\r\n\r\n');
      const head = i >= 0 ? text.slice(0, i) : text;
      const body = i >= 0 ? text.slice(i + 4) : '';
      const m = head.match(/^HTTP\/1\.[01] (\d{3})/);
      resolve({ status: m ? parseInt(m[1], 10) : 0, body, head });
    });
  });
}

(async () => {
  const port = await allocatePort();
  const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'r497d-')), 'p.db');
  const tsNode = path.join(REPO, 'node_modules', '.bin', 'ts-node');
  const child = spawn(tsNode, ['src/web/server.ts'], {
    cwd: REPO,
    env: { ...process.env, PORT: String(port), DB_PATH: dbPath, TS_NODE_TRANSPILE_ONLY: 'true' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline && !/URL:/.test(log)) {
    await new Promise((r) => setTimeout(r, 200));
  }
  if (!/URL:/.test(log)) {
    console.log('BOOT FAILED');
    console.log(log.slice(-2000));
    child.kill('SIGTERM');
    return;
  }

  const PATHS = [
    '/',
    '/index.html',
    '/js/auth.js',
    '/js/../js/auth.js',
    '/css/../js/../js/auth.js',
    '/dashboard',
    '/api/definitely-not-a-route',
    '/../../../../../../etc/passwd',
    '/../../../../../../etc/shadow',
    '/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/etc/passwd',
  ];

  console.log('VARIANT=' + variant);
  for (const p of PATHS) {
    let r;
    try {
      r = await rawGet(port, p);
    } catch (e) {
      console.log(`  ${JSON.stringify(p).padEnd(48)} -> ERROR ${e.message}`);
      continue;
    }
    const sysfile = isSystemFile(r.body);
    const ctype = (r.head.match(/content-type:\s*([^\r\n]+)/i) || [, ''])[1];
    console.log(
      `  ${JSON.stringify(p).padEnd(48)} -> ${r.status}  sysfile=${sysfile ? 'YES' : 'no '}  len=${r.body.length}  ctype=${ctype}`,
    );
  }
  child.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 1500));
  child.kill('SIGKILL');
  process.exit(0);
})();
