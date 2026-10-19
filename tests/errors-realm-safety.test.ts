// tests/errors-realm-safety.test.ts
//
// WHY THIS FILE EXISTS (2026-10-20 05:03 cron, llm-benchmark rotation).
//
// The CI workflow was RED on the current HEAD (4b500e4) while the same suite
// was GREEN locally. The failure was NOT flaky and NOT environment-only:
//
//   FAIL tests/web/r475-cross-tenant-config-ids.test.ts
//     › (4) F4: an unknown config id is a raw 400, and the FK is what blocks the stall
//     Expected: "FOREIGN KEY constraint failed"
//     Received: "{\"code\":\"SQLITE_CONSTRAINT_FOREIGNKEY\"}"
//
// ROOT CAUSE (measured, not inferred):
//
//   `src/errors.ts` narrowed caught values with `e instanceof Error`.
//   `instanceof` is REALM-SENSITIVE: it compares against the `Error`
//   constructor of the realm the check RUNS IN, walking the value's own
//   prototype chain. `better-sqlite3` is a NATIVE addon; it calls
//   `addon.setErrorConstructor(SqliteError)` at module load, and
//   `SqliteError.prototype` is chained to whichever `Error.prototype` was
//   live in the realm that loaded it LAST.
//
//   Jest gives every test FILE its own module registry, so the prototype the
//   native addon captured depends on FILE ORDER. Measured on this tree:
//
//     - r475 run alone ................ instanceof Error = true
//     - full suite (local, Node 22) . instanceof Error = true
//     - full suite (CI, Node 20) ..... instanceof Error = FALSE
//
//   When the check fails, `errorMessage()` fell through to
//   `JSON.stringify(e)`. `SqliteError.prototype`'s `message` is defined with
//   `enumerable: false` (node_modules/better-sqlite3/lib/sqlite-error.js), so
//   JSON.stringify DROPS IT ENTIRELY and only `code` survives. The user-facing
//   consequence is that the API's 400 body degrades from a human-readable
//   message to a JSON blob -- and WHICH body you get depends on test file
//   order, i.e. the same defect is invisible in one ordering and visible in
//   another.
//
//   The defect is in PRODUCTION code (`src/errors.ts`), not in the test: the
//   helper is used at 20+ catch sites across `src/`, so any cross-realm error
//   reaching any of them loses its message.
//
// WHAT THIS FILE PINS
//
//   The realm-agnostic narrowing: an error is recognised by the NAME of its
//   prototype chain's constructor (`*Error`), not by identity against the
//   ambient `Error`.
//
//   Every arm below is DETERMINISTIC and does not depend on file ordering or
//   on a native addon. The cross-realm values are constructed on purpose:
//
//   - `vm.runInNewContext('new Error(...)')` gives a genuine error from a
//     different realm: `instanceof Error` is false, but it IS an error.
//   - an error class whose `prototype` was re-rooted onto a FOREIGN
//     `Error.prototype` is the same shape the native addon produces.
//
//   Both are the shape `better-sqlite3` produces; a suite that only ever
//   constructs errors with the ambient `new Error(...)` cannot see the defect
//   at all -- which is exactly why the existing suite was green locally.

import { errorMessage, errorToString } from '../src/errors';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const vm = require('vm') as typeof import('vm');

/**
 * Build an error whose prototype chain is rooted at a FOREIGN realm's
 * `Error.prototype` -- the exact shape `better-sqlite3` produces when its
 * native addon captured the error constructor from another module registry.
 *
 * The foreign `Error.prototype` is taken from a `vm` context, so it is NOT
 * linked to this realm's `Error.prototype` and the ambient `instanceof`
 * check genuinely fails on the result.
 */
function foreignRealmError(message: string): Error {
  const foreignErrorProto = vm.runInNewContext('Error.prototype') as object;
  class ForeignError extends Error {}
  Object.setPrototypeOf(ForeignError.prototype, foreignErrorProto);
  return new (ForeignError as unknown as new (m: string) => Error)(message);
}

describe('errorMessage / errorToString realm safety', () => {
  describe('a genuine error from another realm', () => {
    it('a cross-realm Error is NOT `instanceof Error` but IS error-like', () => {
      const foreign = vm.runInNewContext('new Error("cross realm boom")') as Error;

      // Precondition: this is exactly the condition the old check missed.
      expect(foreign instanceof Error).toBe(false);
      // The property the old code silently dropped.
      expect(foreign.message).toBe('cross realm boom');
    });

    it('errorMessage() returns the cross-realm error message, not a JSON blob', () => {
      const foreign = vm.runInNewContext('new Error("cross realm boom")') as Error;
      expect(errorMessage(foreign)).toBe('cross realm boom');
    });

    it('errorMessage() does not degrade to JSON.stringify for a cross-realm Error', () => {
      // The old fallback produced '{}' for a cross-realm Error: `message` and
      // `stack` are non-enumerable, so JSON.stringify kept nothing.
      const foreign = vm.runInNewContext('new Error("cross realm boom")') as Error;
      expect(errorMessage(foreign)).not.toBe('{}');
    });

    it('errorToString() returns the cross-realm error toString', () => {
      const foreign = vm.runInNewContext('new Error("cross realm boom")') as Error;
      expect(errorToString(foreign)).toBe('Error: cross realm boom');
    });

    it('recognises a cross-realm error SUBCLASS too', () => {
      // A subclass declared in another realm: its name ends in 'Error' but the
      // ambient `instanceof` check fails for the same reason.
      const foreign = vm.runInNewContext(
        'class RangeError extends Error {}; new RangeError("subclass boom")',
      ) as Error;
      expect(foreign instanceof Error).toBe(false);
      expect(errorMessage(foreign)).toBe('subclass boom');
    });
  });

  describe('an error rooted at a foreign Error.prototype (the native-addon shape)', () => {
    it('is not `instanceof Error` in this realm', () => {
      const err = foreignRealmError('captured boom');
      expect(err instanceof Error).toBe(false);
      expect(err.message).toBe('captured boom');
    });

    it('errorMessage() still reads the message', () => {
      expect(errorMessage(foreignRealmError('captured boom'))).toBe('captured boom');
    });

    it('errorToString() still reads the toString', () => {
      expect(errorToString(foreignRealmError('captured boom'))).toBe(
        'Error: captured boom',
      );
    });
  });

  describe('the published contract for NON-error values is unchanged', () => {
    // The realm fix must not swallow the helper's documented fallbacks. A
    // plain object is NOT an error, even when it carries a `message` key --
    // this is the case that a naive duck-typed fix would break.
    it('still JSON-stringifies a plain object throw', () => {
      expect(errorMessage({ code: 42, detail: 'oops' })).toBe(
        JSON.stringify({ code: 42, detail: 'oops' }),
      );
    });

    it('still JSON-stringifies a plain object that carries a message key', () => {
      const plain = { message: 'not an error', code: 'X' };
      expect(errorMessage(plain)).toBe(JSON.stringify(plain));
      expect(errorMessage(plain)).not.toBe('not an error');
    });

    it('still returns the string itself for a thrown string', () => {
      expect(errorMessage('raw string thrown')).toBe('raw string thrown');
    });

    it('still returns empty string for undefined', () => {
      expect(errorMessage(undefined)).toBe('');
    });

    it('still returns "null" for null', () => {
      expect(errorMessage(null)).toBe('null');
    });

    it('still returns Error.message for an ambient Error', () => {
      expect(errorMessage(new Error('boom'))).toBe('boom');
    });

    it('still returns Error.toString() for an ambient Error', () => {
      expect(errorToString(new Error('boom'))).toBe('Error: boom');
    });

    it('still falls back to String() for a circular object', () => {
      const circular: Record<string, unknown> = {};
      circular.self = circular;
      expect(errorMessage(circular)).toBe('[object Object]');
    });
  });
});
