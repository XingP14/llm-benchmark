// src/errors.ts
//
// Tiny helpers for `catch (e: unknown)` narrowing. Mirrors the woclaw hub
// pattern (see hub/src/errors.ts). Used to migrate the long tail of
// `catch (e: any)` sites in adapters/ and core/ to the modern TypeScript
// pattern (unknown + runtime narrowing).
//
// Why: llm-benchmark/tsconfig.json now has strict enabled, so bare
// `catch (e)` defaults to `unknown` automatically. By (a) annotating
// `: unknown` explicitly (per the woclaw hub pattern) and (b) routing
// `.message` reads through a typed helper, we get the same ergonomic
// string output while making the unknown-narrowing visible at every
// catch site (avoids future regressions if strict mode is ever
// locally disabled for a single file).

/** Safely extract a human-readable message from an unknown caught value. */
export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  if (e === undefined) return '';
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

/** Like errorMessage, but returns the full Error.toString() when available. */
export function errorToString(e: unknown): string {
  if (e instanceof Error) return e.toString();
  return errorMessage(e);
}

/**
 * Read a `name` property off an unknown caught value, returning the
 * fallback if the value is not an object or has no string `name`.
 * Useful for `err.name === 'AbortError'` style checks after
 * `catch (e: unknown)`.
 */
export function errorName(e: unknown): string | undefined {
  if (e && typeof e === 'object' && 'name' in e) {
    const n = (e as { name: unknown }).name;
    if (typeof n === 'string') return n;
  }
  return undefined;
}

/**
 * Detect fetch abort / timeout failures from an unknown caught value.
 *
 * Checks three signals (any-of wins) so it survives both thrown DOMException
 * AbortError objects (Node 18+ fetch) and legacy string-thrown libraries:
 *   1. `errorName(e) === 'AbortError'` — AbortController-triggered cancellation
 *      (DOMException with `.name === 'AbortError'` on modern Node)
 *   2. message contains "abort" / "timeout" (case-insensitive) — Node 16-era
 *      fetch + many third-party libraries throw plain Error with descriptive
 *      text containing these substrings (e.g. `request timeout`, `aborted`)
 *
 * Mirrors the byte-identical contract previously inlined 9 times across
 * `src/core/evaluator.ts` (L572/660/747/840/945/1051/1168/1280/1409):
 *   const isTimeout = msg.toLowerCase().includes('abort') ||
 *                     msg.toLowerCase().includes('timeout');
 *
 * Returns false for non-object, undefined, and other non-abort/timeout
 * errors (e.g. TypeError, fetch network failure), matching the inline
 * behavior in every case except `null`/numeric throws where the old
 * `msg.toLowerCase()` would itself throw — this helper short-circuits
 * safely for those.
 */
export function isAbortOrTimeout(e: unknown): boolean {
  if (e && typeof e === 'object') {
    if (errorName(e) === 'AbortError') return true;
    const msg = errorMessage(e);
    if (msg) {
      const lower = msg.toLowerCase();
      if (lower.includes('abort') || lower.includes('timeout')) return true;
    }
  }
  return false;
}
