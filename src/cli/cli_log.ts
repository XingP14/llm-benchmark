// src/cli/cli_log.ts
//
// chain #17 closure: per-prefix CLI log helpers — `cliLog` (banner / info)
// + `cliError` (fatal-error / loadConfig failure / compareModels usage
// error / main().catch fatal). Replaces 32 inline `console.log`/`console.error`
// sites in src/index.ts that previously leaked raw `console.X` calls into
// the CLI entry point.
//
// parallels src/web/server.ts:21 webServerLog (chain #15), src/web/routes/auth.ts:18
// webAdminLog (chain #16), src/core/scorer.ts:14 logError (chain #4),
// src/web/engine/evaluator.ts:30 logEvalError (chain #5), src/core/reporter.ts:7
// (chain #6), src/web/websocket.ts:9 (chain #9) — 7 prior per-prefix helpers
// all in `web/` + `core/` directories; this is the first `cli/` helper.
//
// Why cliLog / cliError do not carry a `shouldLog` gate:
//   - CLI lifecycle banners (run start / complete / compare / list / init
//     / showHelp / --version) and CLI fatal errors must ALWAYS appear —
//     they are user-facing, not per-evaluation debug noise.
//   - parallels webServerLog + webAdminLog (both noted as lifecycle / bootstrap
//     events that should never be silenced, even under jest).
//   - If a future gate is needed (e.g. --quiet flag), change the helper body
//     once; no call-site rewrite required.
//
// Wire-format guarantee:
//   `cliLog('foo', x)` writes byte-identical bytes to stdout as
//   `console.log('foo', x)` — same for cliError vs console.error. The
//   migration is therefore semantically transparent: every existing test
//   that captures stdout/stderr via spyOn continues to assert the same
//   payload, because no transformation is applied at the helper level.

/**
 * CLI banner / informational log (parallels webServerLog / webAdminLog).
 * Forwards verbatim to `console.log` so output byte-format is preserved.
 */
export const cliLog = (...args: unknown[]): void => {
  console.log(...args);
};

/**
 * CLI fatal / recoverable error log (parallels logError / logEvalError in
 * core + web harness). Forwards verbatim to `console.error` so error
 * byte-format is preserved (stderr stream routing unchanged).
 */
export const cliError = (...args: unknown[]): void => {
  console.error(...args);
};
