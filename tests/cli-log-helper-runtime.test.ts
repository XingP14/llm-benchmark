// tests/cli-log-helper-runtime.test.ts
// R441 — the RUNTIME half of src/cli/cli_log.ts.
//
// WHY THIS FILE EXISTS (the gap it closes)
// ----------------------------------------
// scripts/sweep-no-runtime-import.py reports:
//
//     NO-RUNTIME-IMPORT  cliError   src/cli/cli_log.ts
//     NO-RUNTIME-IMPORT  cliLog     src/cli/cli_log.ts
//
// Both symbols ARE mentioned by a test -- tests/cli-log-helper.test.ts -- but
// that suite never imports them. It reads src/index.ts and src/cli/cli_log.ts as
// TEXT and asserts things like "0 inline console.log( sites" and ">=24 cliLog("
// call sites. So the entire coverage of the helpers is:
//
//   (a) that their names appear at call sites in another file, and
//   (b) that their two bodies read exactly `console.log(...args)` /
//       `console.error(...args)` -- by regex, not by execution.
//
// src/cli/cli_log.ts:24-29 states the contract the CLI depends on:
//     "cliLog('foo', x) writes byte-identical bytes to stdout as
//      console.log('foo', x) -- same for cliError vs console.error ... the
//      migration is therefore semantically transparent: every existing test
//      that captures stdout/stderr via spyOn continues to assert the same
//      payload."
//
// That is a forwarding guarantee about ARGUMENTS and STREAM ROUTING, and
// nothing drives it. A helper that did `console.log(String(args))`, dropped
// the args, wrote to the wrong stream, or swallowed them would leave
// tests/cli-log-helper.test.ts 100% green -- its regex only cares that the
// literal text `console.log(...args)` appears in the file.
//
// WHAT THIS FILE PINS
// ------------------
// 1. Both helpers call the real console method, with the caller's arguments
//    forwarded verbatim (same arity, same values, same order, same references).
// 2. Stream routing is not interchangeable: cliLog -> console.log,
//    cliError -> console.error, and neither touches the other stream.
// 3. Edge arities: zero arguments, non-string arguments (object, undefined,
//    Error), and a large argument list all survive unchanged.
// 4. The sweep's report closes: importing these two symbols at runtime removes
//    them from scripts/sweep-no-runtime-import.py's NO-RUNTIME-IMPORT list.
//    (4) is the falsifier for (1)-(3) from the outside: if the suite were the
//    source-text kind, the sweep would keep reporting them.
//
// This suite pins; it does not change src/cli/cli_log.ts.
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { cliError, cliLog } from '../src/cli/cli_log';

const REPO = path.resolve(__dirname, '..');
const SWEEP = path.join(REPO, 'scripts', 'sweep-no-runtime-import.py');

describe('src/cli/cli_log.ts forwarding contract at runtime (R441)', () => {
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('cliLog forwards every argument verbatim to console.log, once', () => {
    const a = { name: 'x' };
    const e = new Error('boom');
    cliLog('a', 1, a, undefined, e, false, 0, '');

    expect(logSpy).toHaveBeenCalledTimes(1);
    const forwarded = logSpy.mock.calls[0];
    expect(forwarded).toHaveLength(8);
    expect(forwarded[0]).toBe('a');
    expect(forwarded[1]).toBe(1);
    // Reference identity, not just equality: a helper that cloned or
    // stringified the argument would still pass a toEqual.
    expect(forwarded[2]).toBe(a);
    expect(forwarded[3]).toBeUndefined();
    expect(forwarded[4]).toBe(e);
    expect(forwarded[5]).toBe(false);
    expect(forwarded[6]).toBe(0);
    expect(forwarded[7]).toBe('');
  });

  it('cliError forwards every argument verbatim to console.error, once', () => {
    const e = new Error('boom');
    cliError('\n\nx:', e);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const forwarded = errorSpy.mock.calls[0];
    expect(forwarded).toHaveLength(2);
    expect(forwarded[0]).toBe('\n\nx:');
    expect(forwarded[1]).toBe(e);
  });

  it('cliLog writes ONLY to stdout -- no console.error, no extra console.log', () => {
    cliLog('banner');
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('cliError writes ONLY to stderr -- no console.log, no extra console.error', () => {
    cliError('fatal');
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('a zero-argument call still reaches the console (a swallowed call is not silent-free)', () => {
    cliLog();
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0]).toEqual([]);

    logSpy.mockClear();
    cliError();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0]).toEqual([]);
  });

  it('a large argument list survives intact (the showHelp block is one multi-line string)', () => {
    const args = Array.from({ length: 40 }, (_v, i) => `line-${i}`);
    cliLog(...args);
    expect(logSpy.mock.calls[0]).toHaveLength(40);
    expect(logSpy.mock.calls[0][39]).toBe('line-39');
  });

  it('the helper bodies are exactly one forwarding call each -- no second sink, no guard', () => {
    // The byte-format guarantee is what lets index.ts swap console.X for the
    // helper without touching a single existing spyOn assertion. A helper that
    // added its own prefix, or fell back to console.log on failure, would keep
    // every text gate green while changing the payload on stdout.
    const src = fs.readFileSync(path.join(REPO, 'src', 'cli', 'cli_log.ts'), 'utf-8');
    const bodies = src.match(/=> \{\s*console\.\w+\(\.\.\.args\);\s*\}/g) || [];
    expect(bodies).toHaveLength(2);
    expect(bodies.some((b) => /console\.log\(\.\.\.args\)/.test(b))).toBe(true);
    expect(bodies.some((b) => /console\.error\(\.\.\.args\)/.test(b))).toBe(true);
  });

  it('the sweep no longer reports cliLog / cliError as NO-RUNTIME-IMPORT (outside falsifier)', () => {
    // This suite is only worth anything if it changes what the sweep can see.
    // If the import above were removed -- or reduced to a source-text mention --
    // the sweep would list both symbols again and this fails.
    const stdout = execFileSync('python3', [SWEEP, 'src', 'tests'], {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
      cwd: REPO,
    });
    for (const name of ['cliLog', 'cliError']) {
      expect(new RegExp(`^NO-RUNTIME-IMPORT\\s+${name}\\b`, 'm').test(stdout)).toBe(false);
    }
  });
});
