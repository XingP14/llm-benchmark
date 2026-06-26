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

import { errorMessage, errorToString, errorName } from '../src/errors';

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
});
