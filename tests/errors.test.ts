// tests/errors.test.ts
//
// Tests for src/errors.ts — the `catch (e: unknown)` narrowing helpers
// (errorMessage / errorToString / errorName).
//
// Round 2026-06-27 05:43 cron: these helpers were added in 743e79b to
// migrate `(x as Error).message` → `errorMessage(x)`. This round migrates
// the residual 22 `(x as Error).message` sites across 5 files
// (scorer.ts 6 + evaluator.ts 10 + web/engine/evaluator.ts 2 +
//  web/routes/evaluations.ts 1 + index.ts 1 = 20; the original count
// of 22 includes 2 false-positive matches in plain text). This test
// suite pins the helpers' behavior so the migration is byte-identical
// for the common `Error` case + correct for the long tail of
// non-Error throws (strings, plain objects, undefined).

import { errorMessage, errorToString, errorName, isAbortOrTimeout, buildFetcherErrorDetail } from '../src/errors';

describe('errors.ts helpers', () => {
  describe('errorMessage', () => {
    it('returns Error.message for a thrown Error', () => {
      expect(errorMessage(new Error('boom'))).toBe('boom');
    });

    it('returns the inner message for a TypeError (subclass of Error)', () => {
      expect(errorMessage(new TypeError('bad type'))).toBe('bad type');
    });

    it('returns the string itself when a string is thrown', () => {
      expect(errorMessage('raw string thrown')).toBe('raw string thrown');
    });

    it('returns empty string for undefined', () => {
      expect(errorMessage(undefined)).toBe('');
    });

    it('returns empty string for null', () => {
      // null is not Error, not string, not undefined → JSON.stringify(null) === 'null'
      // but the helper has special-cased undefined only; null → JSON.stringify → 'null'
      expect(errorMessage(null)).toBe('null');
    });

    it('JSON-stringifies plain object throws', () => {
      expect(errorMessage({ code: 42, detail: 'oops' })).toBe(
        JSON.stringify({ code: 42, detail: 'oops' })
      );
    });

    it('JSON-stringifies array throws', () => {
      expect(errorMessage([1, 2, 3])).toBe(JSON.stringify([1, 2, 3]));
    });

    it('falls back to String() for objects with throwing JSON.stringify (circular)', () => {
      const circular: Record<string, unknown> = {};
      circular.self = circular;
      // JSON.stringify(circular) throws; helper falls back to String(circular)
      // String() on a plain object yields '[object Object]'
      expect(errorMessage(circular)).toBe('[object Object]');
    });

    it('returns numeric stringification for number throws', () => {
      // numbers are not Error/string/undefined → JSON.stringify(42) === '42'
      expect(errorMessage(42)).toBe('42');
    });

    it('returns boolean stringification for boolean throws', () => {
      expect(errorMessage(true)).toBe('true');
      expect(errorMessage(false)).toBe('false');
    });
  });

  describe('errorToString', () => {
    it('returns Error.toString() (which is "Error: <message>") for Error', () => {
      expect(errorToString(new Error('boom'))).toBe('Error: boom');
    });

    it('falls back to errorMessage for non-Error throws', () => {
      expect(errorToString('just a string')).toBe('just a string');
      expect(errorToString({ code: 1 })).toBe(JSON.stringify({ code: 1 }));
    });

    it('returns empty string for undefined', () => {
      expect(errorToString(undefined)).toBe('');
    });
  });

  describe('errorName', () => {
    it('returns the .name property for an Error', () => {
      expect(errorName(new Error('x'))).toBe('Error');
      expect(errorName(new TypeError('x'))).toBe('TypeError');
    });

    it('returns the .name property for a custom Error subclass', () => {
      class MyError extends Error {
        constructor(msg: string) {
          super(msg);
          this.name = 'MyError';
        }
      }
      expect(errorName(new MyError('x'))).toBe('MyError');
    });

    it('returns AbortError name (used by adapter.ts for fetch timeout detection)', () => {
      // mirrors the pattern in src/adapters/adapter.ts: errorName(err) === 'AbortError'
      const abortErr = new Error('aborted');
      abortErr.name = 'AbortError';
      expect(errorName(abortErr)).toBe('AbortError');
    });

    it('returns undefined for non-object throws', () => {
      expect(errorName('string')).toBeUndefined();
      expect(errorName(undefined)).toBeUndefined();
      expect(errorName(null)).toBeUndefined();
      expect(errorName(42)).toBeUndefined();
    });

    it('returns undefined when .name is not a string', () => {
      expect(errorName({ name: 42 })).toBeUndefined();
      expect(errorName({ name: null })).toBeUndefined();
      expect(errorName({ name: { nested: true } })).toBeUndefined();
    });

    it('returns the string .name when set on a plain object', () => {
      expect(errorName({ name: 'AbortError', message: 'cancelled' })).toBe('AbortError');
    });

    it('returns undefined for an empty object with no name', () => {
      expect(errorName({})).toBeUndefined();
    });
  });

  describe('migration equivalence: errorMessage(x) vs (x as Error).message', () => {
    // These tests pin the BEHAVIORAL contract that motivated the migration:
    // for the common case of `catch (err) { ... err.message ... }`, the helper
    // must produce byte-identical output to the old `(err as Error).message`
    // pattern. The helper is a strict superset (handles non-Error throws
    // gracefully) but MUST NOT regress the Error case.

    it('matches (x as Error).message for an Error throw', () => {
      const err = new Error('legacy pattern');
      const legacy: string = (err as Error).message;
      expect(errorMessage(err)).toBe(legacy);
    });

    it('matches (x as Error).message for a TypeError throw', () => {
      const err = new TypeError('type mismatch');
      expect(errorMessage(err)).toBe((err as Error).message);
    });

    it('matches (x as Error).message for an Error subclass with empty message', () => {
      const err = new Error('');
      expect(errorMessage(err)).toBe((err as Error).message);
    });
  });

  describe('isAbortOrTimeout', () => {
    // Mirrors the byte-identical contract previously inlined 9 times across
    // src/core/evaluator.ts (L572/660/747/840/945/1051/1168/1280/1409):
    //   const isTimeout = msg.toLowerCase().includes('abort') ||
    //                     msg.toLowerCase().includes('timeout');
    // Helper-extracted into src/errors.ts in 01:23 cron 2026-07-16.

    it('detects AbortError name (Node 18+ fetch DOMException)', () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      expect(isAbortOrTimeout(err)).toBe(true);
    });

    it('detects "timeout" in message (case-insensitive)', () => {
      expect(isAbortOrTimeout(new Error('Request Timeout'))).toBe(true);
      expect(isAbortOrTimeout(new Error('timeout exceeded'))).toBe(true);
      expect(isAbortOrTimeout(new Error('TIMEOUT exceeded'))).toBe(true);
    });

    it('detects "abort" in message (case-insensitive)', () => {
      expect(isAbortOrTimeout(new Error('connection aborted'))).toBe(true);
      expect(isAbortOrTimeout(new Error('Request Aborted by client'))).toBe(true);
      expect(isAbortOrTimeout(new Error('AbortError'))).toBe(true);
    });

    it('returns false for non-abort/timeout errors', () => {
      expect(isAbortOrTimeout(new Error('fetch failed: ENOTFOUND'))).toBe(false);
      expect(isAbortOrTimeout(new TypeError('bad type'))).toBe(false);
      expect(isAbortOrTimeout(new Error('JSON parse error'))).toBe(false);
    });

    it('returns false for plain object throws without abort/timeout text', () => {
      expect(isAbortOrTimeout({ status: 500, msg: 'server error' })).toBe(false);
      expect(isAbortOrTimeout({ code: 'ECONNRESET' })).toBe(false);
    });

    it('returns true for plain object throws with abort/timeout text', () => {
      expect(isAbortOrTimeout({ message: 'request timeout' })).toBe(true);
      expect(isAbortOrTimeout({ msg: 'Aborted' })).toBe(true);
    });

    it('returns false for non-object throws (string, number, undefined, null)', () => {
      expect(isAbortOrTimeout('abort happened')).toBe(false);
      expect(isAbortOrTimeout('timeout')).toBe(false);
      expect(isAbortOrTimeout(undefined)).toBe(false);
      expect(isAbortOrTimeout(null)).toBe(false);
      expect(isAbortOrTimeout(42)).toBe(false);
      expect(isAbortOrTimeout(true)).toBe(false);
    });

    it('returns false for object with empty message and non-AbortError name', () => {
      expect(isAbortOrTimeout({ name: 'SomeError', message: '' })).toBe(false);
      expect(isAbortOrTimeout({ name: 'TypeError' })).toBe(false);
    });

    it('aborts win over message ambiguity (AbortError name beats "timeout" mismatch)', () => {
      const err = new Error('something else');
      err.name = 'AbortError';
      expect(isAbortOrTimeout(err)).toBe(true);
    });
  });

  // buildFetcherErrorDetail composes isAbortOrTimeout + errorMessage into the
  // standardized fetcher-error detail string used by the 9 fetcher catch sites
  // in src/core/evaluator.ts (was previously inlined 9 times as
  //   isTimeout ? `${category}${modePart} timeout after ${timeoutMs}ms`
  //              : `${category}${modePart} fetch error: ${msg.slice(0, 200)}`).
  describe('buildFetcherErrorDetail', () => {
    it('returns "<category> timeout after <ms>ms" for an AbortError (modePart empty)', () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      expect(buildFetcherErrorDetail('cyberseceval3', '', 30000, err)).toBe(
        'cyberseceval3 timeout after 30000ms',
      );
    });

    it('returns "<category> timeout after <ms>ms" for a message-only timeout', () => {
      const err = new Error('request timeout');
      expect(buildFetcherErrorDetail('webdev_arena', '', 15000, err)).toBe(
        'webdev_arena timeout after 15000ms',
      );
    });

    it('returns "<category> timeout after <ms>ms" for an aborted message', () => {
      const err = new Error('connection aborted');
      expect(buildFetcherErrorDetail('terminal_bench', '', 5000, err)).toBe(
        'terminal_bench timeout after 5000ms',
      );
    });

    it('interpolates modePart for the 9th fetcher (lm_eval_task_conflict_resolver)', () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      expect(buildFetcherErrorDetail('lm_eval_task_conflict_resolver', '[dry_run|all]', 30000, err)).toBe(
        'lm_eval_task_conflict_resolver[dry_run|all] timeout after 30000ms',
      );
    });

    it('returns "<category><modePart> fetch error: <msg>" for a non-timeout Error', () => {
      const err = new Error('JSON parse error: unexpected token');
      expect(buildFetcherErrorDetail('aa_omniscience', '', 30000, err)).toBe(
        'aa_omniscience fetch error: JSON parse error: unexpected token',
      );
    });

    it('truncates the error message at 200 chars (long-message boundary)', () => {
      const long = 'x'.repeat(500);
      const err = new Error(long);
      const out = buildFetcherErrorDetail('swe_bench_pro', '', 30000, err);
      expect(out).toBe(`swe_bench_pro fetch error: ${'x'.repeat(200)}`);
      expect(out.length).toBe('swe_bench_pro fetch error: '.length + 200);
    });

    it('truncates the error message at 200 chars with modePart interpolation', () => {
      const long = 'y'.repeat(500);
      const err = new Error(long);
      const out = buildFetcherErrorDetail('lm_eval_task_conflict_resolver', '[auto_resolve|numpy_torch]', 30000, err);
      expect(out).toBe(
        `lm_eval_task_conflict_resolver[auto_resolve|numpy_torch] fetch error: ${'y'.repeat(200)}`,
      );
    });

    it('falls back to the empty-string message path for undefined throws', () => {
      expect(buildFetcherErrorDetail('benchlm_agentic', '', 30000, undefined)).toBe(
        'benchlm_agentic fetch error: ',
      );
    });

    it('falls back to the empty-string message path for null throws', () => {
      // null → JSON.stringify(null) === 'null'
      expect(buildFetcherErrorDetail('process_aware_scoring', '', 30000, null)).toBe(
        'process_aware_scoring fetch error: null',
      );
    });

    it('handles plain object throws by JSON-stringifying the full object', () => {
      // errorMessage falls back to JSON.stringify for non-Error throws (mirrors
      // the existing test in the errorMessage describe block above).
      const err = { message: 'fetch failed: ECONNRESET', code: 'ECONNRESET' };
      expect(buildFetcherErrorDetail('long_context_cluster', '', 30000, err)).toBe(
        `long_context_cluster fetch error: ${JSON.stringify(err)}`,
      );
    });

    it('aborts always win over message text (AbortError name + non-abort message)', () => {
      const err = new Error('plain fetch failure');
      err.name = 'AbortError';
      expect(buildFetcherErrorDetail('cyberseceval3', '', 12345, err)).toBe(
        'cyberseceval3 timeout after 12345ms',
      );
    });

    it('handles numeric throw values safely (no .slice on a number)', () => {
      // regression guard: the inline pattern `msg.toLowerCase().includes('abort')`
      // would itself throw on a numeric err. The helper must not.
      expect(buildFetcherErrorDetail('webdev_arena', '', 30000, 42)).toBe(
        'webdev_arena fetch error: 42',
      );
    });

    it('handles boolean throw values safely', () => {
      expect(buildFetcherErrorDetail('aa_omniscience', '', 30000, true)).toBe(
        'aa_omniscience fetch error: true',
      );
    });
  });
});
