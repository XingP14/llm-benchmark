// tests/web/server-log-helper.test.ts
//
// Round 2026-07-07 03:03 cron: migrate the 2 inline `console.log` sites in
// src/web/server.ts (L63 server.listen banner + L73 SIGINT shutdown) to use a
// new `webServerLog` per-prefix helper (parallels src/core/scorer.ts:14
// logError + src/web/engine/evaluator.ts:30 logEvalError + src/core/reporter.ts:7
// + src/web/websocket.ts:9 漏更续集, chain #15 closure).
//
// Why this matters:
//   - server.ts is the Express server entry point (port 3033 by default). The
//     2 inline `console.log` sites control startup banner + shutdown notice,
//     both lifecycle events that should route through a single per-prefix
//     helper rather than direct console.log calls scattered in the entry.
//   - Routing both sites through `webServerLog` keeps the helper body as the
//     single source of truth for the server-lifecycle log shape (template
//     literal + leading newline for banner, raw string for shutdown). If we
//     ever want to add a shouldLog gate (parallels scorer.ts / evaluator.ts
//     / websocket.ts), we change 1 helper body, not 2 call sites.
//   - This commit does NOT add a shouldLog gate (lifecycle logs must appear
//     even under jest); the helper stays as a thin wrapper so behavior is
//     byte-identical to the prior inline shape. We assert the call sites are
//     routed through the helper, and the helper body itself is `console.log(...args)`.
//
// This file pins:
//   1. Source-level gate: 0 inline `console.log(...)` call sites remain in
//      src/web/server.ts outside the helper body and outside doc-comments
//      (the migration moves both L63 + L73 sites to webServerLog).
//   2. webServerLog helper is defined and uses `console.log(...args)` as
//      its body (byte-identical gate semantics — no shouldLog gate added).
//   3. Both call sites preserved: L63 server.listen banner + L73 SIGINT
//      shutdown now call `webServerLog(...)` with their original payloads
//      (template literal banner + raw '\nShutting down...' string).

import * as fs from 'fs';
import * as path from 'path';

describe('web/server.ts webServerLog per-prefix helper (chain #15 closure)', () => {
  const serverPath = path.resolve(__dirname, '..', '..', 'src', 'web', 'server.ts');
  const src = fs.readFileSync(serverPath, 'utf-8');
  // Strip /* */ block comments and // line comments so gate scans do not
  // trip on doc-comments that mention the migrated pattern.
  const stripped = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('(1) has 0 inline `console.log` call sites in server.ts (2 migrated to webServerLog)', () => {
    // After the chain #15 migration, the only `console.log` left in server.ts
    // is inside the webServerLog helper body itself. We allow 0 such
    // call sites after stripping comments and helper body.
    // We extract the helper body first, then scan the rest.
    const helperMatch = stripped.match(/const webServerLog = [\s\S]*?\};/);
    expect(helperMatch).not.toBeNull();
    const withoutHelper = stripped.replace(helperMatch![0], '');
    const matches = withoutHelper.match(/console\.log\s*\(/g) ?? [];
    expect(matches).toEqual([]);
  });

  it('(2) webServerLog helper body routes through console.log (chain #15 closure)', () => {
    // The helper is `const webServerLog = (...args: unknown[]): void => { console.log(...args); };`
    // Assert both the signature shape and that the body forwards to
    // console.log(...args) — byte-identical to the previous inline shape.
    const idx = stripped.indexOf('const webServerLog');
    expect(idx).toBeGreaterThan(-1);
    const slice = stripped.slice(idx, idx + 220);
    expect(slice).toMatch(/const webServerLog\s*=\s*\(\.\.\.args:\s*unknown\[\]\)\s*:\s*void\s*=>\s*\{/);
    expect(slice).toMatch(/console\.log\s*\(\s*\.\.\.args\s*\)\s*;/);
  });

  it('(3) 2 call sites preserved: server.listen banner + SIGINT shutdown routed through webServerLog', () => {
    // After migration:
    //   - server.listen callback now calls webServerLog(`\n🎯 LLM Benchmark ...`) (banner)
    //   - SIGINT handler now calls webServerLog('\nShutting down...') (shutdown)
    // We check substring presence on the original (un-stripped) source so
    // that the literal template-literal newline in the banner is preserved
    // (the .stripped variable above uses string-level regex that removes the
    // // comment lines from the banner literal too if we search inside it).
    // The original server.ts has the banner split across multiple lines:
    //   server.listen(PORT, () => {
    //     webServerLog(`
    //   🎯 LLM Benchmark Web Server
    //   ...
    // We just look for the helper call name on the listen callback line.
    expect(src).toMatch(/server\.listen\(PORT, \(\) => \{[\s\S]{0,40}webServerLog/);
    expect(src).toMatch(/process\.on\('SIGINT', \(\) => \{[\s\S]{0,40}webServerLog/);
    // The shutdown string payload is preserved.
    expect(src).toContain("webServerLog('\\nShutting down...')");
    // The banner template literal payload is preserved.
    expect(src).toContain('🎯 LLM Benchmark Web Server');
    expect(src).toContain('URL: http://localhost:${PORT}');
    expect(src).toContain('Admin user: admin (password source: ${adminPasswordSource()})');
  });
});
