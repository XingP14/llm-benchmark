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

/**
 * Realm-safe "is this an error object" test.
 *
 * `instanceof Error` is realm-sensitive. A value whose prototype chain was
 * built against a DIFFERENT realm's `Error` -- or against an error subclass
 * whose base was captured in another realm -- fails the check even though it
 * is an error in every practical sense. Two production-relevant cases:
 *
 *  1. `better-sqlite3` is a NATIVE addon. It calls `addon.setErrorConstructor(
 *     SqliteError)` at module load, and `SqliteError.prototype` chains to
 *     whichever `Error.prototype` was live in the realm that loaded it LAST.
 *     Jest gives every test FILE its own module registry, so the prototype
 *     the addon captured depends on FILE ORDER: the same FOREIGN KEY error
 *     is `instanceof Error` in one ordering and not in another. CI (Node 20,
 *     with coverage) hits the foreign-realm ordering; a local run may not.
 *
 *  2. A value crossing a `vm` context boundary (worker threads, embedded
 *     runtimes) has the same property.
 *
 * The walk below is realm-agnostic: it looks for a prototype whose
 * constructor is named `*Error`. It deliberately does NOT duck-type on the
 * presence of a `message` property, because a plain object like
 * `{ message: 'x', code: 'Y' }` is not an error and the JSON fallback for
 * plain objects is part of the helper's published contract.
 */
function isErrorLike(e: unknown): boolean {
  if (e instanceof Error) return true;
  if (e === null || typeof e !== 'object') return false;
  let proto: object | null = Object.getPrototypeOf(e as object);
  while (proto !== null) {
    const ctor = (proto as { constructor?: unknown }).constructor;
    if (typeof ctor === 'function') {
      const name = (ctor as { name?: unknown }).name;
      if (typeof name === 'string' && name.endsWith('Error')) return true;
    }
    proto = Object.getPrototypeOf(proto);
  }
  return false;
}

/** Safely extract a human-readable message from an unknown caught value. */
export function errorMessage(e: unknown): string {
  if (isErrorLike(e)) {
    const msg = (e as { message?: unknown }).message;
    if (typeof msg === 'string') return msg;
  }
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
  if (isErrorLike(e)) {
    const str = (e as { toString?: unknown }).toString;
    if (typeof str === 'function') {
      const out = (e as { toString(): unknown }).toString();
      if (typeof out === 'string') return out;
    }
  }
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

/**
 * Build the standardized fetcher-error `detail` string used by the 9 fetcher
 * `catch (err: unknown)` branches in `src/core/evaluator.ts`.
 *
 * Composes the two helpers above (`isAbortOrTimeout` + `errorMessage`) into the
 * single per-fetcher shape:
 *   - timeout / abort → `${category}${modePart} timeout after ${timeoutMs}ms`
 *   - any other caught error → `${category}${modePart} fetch error: ${msg}`
 *
 * `modePart` is the per-fetcher bracketed segment (e.g. `[dry_run|all]` for
 * `lm_eval_task_conflict_resolver`) or the empty string for the 8 plain fetchers
 * (cyberseceval3 / webdev_arena / aa_omniscience / terminal_bench /
 * benchlm_agentic / swe_bench_pro / process_aware_scoring / long_context_cluster).
 *
 * The 200-char truncation matches the inline behavior of the 9 catch sites it
 * replaces (was previously `msg.slice(0, 200)` directly).
 *
 * Byte-identical to the inlined `isTimeout ? '...timeout after Xms' : '...fetch error: ...'`
 * pattern previously duplicated at L580/669/756/849/954/1060/1177/1287/1417 of
 * `src/core/evaluator.ts`.
 */
export function buildFetcherErrorDetail(
  category: string,
  modePart: string,
  timeoutMs: number,
  err: unknown,
): string {
  if (isAbortOrTimeout(err)) {
    return `${category}${modePart} timeout after ${timeoutMs}ms`;
  }
  const msg = errorMessage(err);
  return `${category}${modePart} fetch error: ${msg.slice(0, 200)}`;
}