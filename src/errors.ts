// src/errors.ts
//
// Tiny helpers for `catch (e: unknown)` narrowing. Mirrors the woclaw hub
// pattern (see hub/src/errors.ts). Used to migrate the long tail of
// `catch (e: any)` sites in adapters/ and core/ to the modern TypeScript
// pattern (unknown + runtime narrowing).
//
// Why: llm-benchmark/tsconfig.json has strict disabled, so bare
// `catch (e)` would silently default to `any`. By (a) annotating
// `: unknown` explicitly and (b) routing `.message` reads through a
// typed helper, we get the same ergonomic string output while
// future-proofing the codebase for a strict-mode upgrade.

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
