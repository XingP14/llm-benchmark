// R498c probe (llm-benchmark side): does express.static ITSELF escape through
// a symlink inside PUBLIC_DIR, BEFORE the SPA fallback is even reached?
//
// R497's repair confined the SPA FALLBACK. But `app.use(express.static(PUBLIC_DIR))`
// runs FIRST, and `send` follows symlinks by default (followSymlinks: true).
// If express.static escapes through a symlink, then fixing only the fallback
// leaves the hole wide open.
//
// This probe measures the real express + the real `send` version in this repo.

import express from 'express';
import { mkdtempSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import http from 'http';

const root = mkdtempSync(join(tmpdir(), 'r498c_lb_static_'));
writeFileSync(join(root, 'index.html'), '<html>index</html>');
writeFileSync(join(root, 'ok.js'), 'console.log(1)');
symlinkSync('/etc', join(root, 'escape'), 'dir');

const app = express();
app.use(express.static(root));
app.use((_req, res) => { res.status(404).send('fallback'); });

const server = app.listen(0, '127.0.0.1', () => {
  const addr = server.address();
  const port = addr && typeof addr === 'object' ? addr.port : 0;
  const paths = ['/', '/ok.js', '/escape/passwd', '/escape/hostname'];
  let i = 0;
  const next = () => {
    if (i >= paths.length) { server.close(); return; }
    const p = paths[i++];
    http.get({ host: '127.0.0.1', port, path: p }, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        const sysfile = /root:x:0:0/.test(body) || /us-vps4/.test(body);
        console.log(`GET ${p.padEnd(20)} -> ${res.statusCode}  sysfile=${sysfile}  body[0..70]=${body.slice(0, 70).replace(/\n/g, '\\n')}`);
        next();
      });
    }).on('error', (e) => { console.log('ERR', e.message); next(); });
  };
  next();
});
