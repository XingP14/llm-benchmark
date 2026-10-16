# R470 — fetchWithTimeout's timeout parameter has no production reach, and its message ignores it

**Date:** 2026-10-16 23:03 CST tick (llm-benchmark)
**Status:** measured, pinned, **zero production changes**
**Verdict:** FATHER-GATED behaviour decision (see §4)

## 1. Two independent measurements

### A. Arity census — the parameter is test-only

`fetchWithTimeout(url, init, timeoutMs = DEFAULT_API_TIMEOUT_MS)` in
`src/adapters/adapter.ts:57` has exactly **six** production call sites:

| file | argc |
|---|---|
| `src/adapters/anthropic-adapter.ts:46` | 2 |
| `src/adapters/deepseek-adapter.ts:46` | 2 |
| `src/adapters/glm-adapter.ts:45` | 2 |
| `src/adapters/ollama-adapter.ts:53` | 2 |
| `src/adapters/openai-adapter.ts:45` | 2 |
| `src/adapters/qwen-adapter.ts:47` | 2 |

All six pass **two** arguments. **Zero** pass a third. `timeoutMs` is reachable
only from the test suite.

### B. Message provenance — the number is a literal

The AbortError branch reads:

```ts
if (errorName(err) === 'AbortError') {
  throw new Error('API 请求超时 (300s)');   // adapter.ts:73
}
```

`timeoutMs` does not appear in the expression. The message is a byte-identical
string for **every** timeout the function accepts. The number it names (300)
coincides with `DEFAULT_API_TIMEOUT_MS / 1000` — and *only* because no production
caller overrides the default.

## 2. The defect, stated as a class

A caller who passes `timeoutMs = 20000` is aborted after 20 seconds and is told
they waited 300. This is not an unguarded defect: **the suite pins it.**
`tests/adapter-fetch-timeout-abort-callback.test.ts:36-37` calls
`fetchWithTimeout(url, init, 20)` and asserts the message is
`'API 请求超时 (300s)'`. A test that reads as coverage of the timeout path is
actually a lock on the misleading message.

So in production the literal is *correct by coincidence*: every real caller runs
at the default, and the default is what the literal names. The defect lives
entirely in the exported parameter's contract, which nothing exercises.

## 3. What is pinned vs what is father-gated

`tests/adapter-fetch-timeout-message-provenance.test.ts` (11 tests) pins the
**current** behaviour exactly. Consequence: any repair turns it RED, which is
the intent — a behaviour change must be a visible, deliberate diff.

The suite does **not** choose the repair. That is a behaviour decision (§4).

## 4. Father-gated — what should the message say?

The string is user-facing text in six adapters. Three defensible repairs:

1. **Derive it** — `` `API 请求超时 (${Math.round(timeoutMs/1000)}s)` ``. Makes
   the parameter truthful; changes the string for every production caller only
   if the default ever changes.
2. **Name the default explicitly** — keep the literal but mark it as the
   default, so a caller who overrode the timeout is not misled.
3. **Drop the parameter** — if no caller overrides it, delete the third
   parameter and keep the constant. Removes the contradiction at the source and
   is honest about the fact that the timeout is not configurable today.

Option 3 also answers "should the timeout be configurable at all?" — a
`--timeout` CLI flag would make option 1 correct and the parameter reachable,
which may be the real product question.

## 5. Mutation matrix — control first, 5 killed / 1 intended survivor

Control run **first** (R456/r469 lesson: a tree change mid-matrix is charged to
whichever mutant was in flight). Every needle built inside the python program
and asserted unique before use (d8c6d64 lesson). `adapter.ts` md5
`439fecd20489e2e080abfcc817a811d2` before and after; `git diff -- src/` empty.

| id | mutation | verdict |
|---|---|---|
| M1 | **the fix** — interpolate `timeoutMs/1000` into the message | KILLED |
| M2 | drop the number entirely | KILLED |
| M3 | default stops pointing at the exported constant | KILLED |
| M4 | same class as M1, unit `ms` instead of `s` | KILLED |
| M5 | **negative control** — `setTimeout` ignores `timeoutMs`, uses the default | **SURVIVED (intended)** |
| M6 | string concat instead of template literal | KILLED |

**M5's survival is the finding, not a harness gap.** It makes the timing
completely unresponsive to the parameter, and the suite is green — because
nothing in production passes the parameter. The suite measures the *message*'s
provenance (arms B/C) and the *call-site arity* (arm A); it deliberately does
not claim to pin the timing, because the parameter has no production path to
pin. A suite that claimed to pin timing here would be claiming reach it does
not have.

## 6. Two defects that were mine

1. **A wrong premise in my own arm F.** It asserted `create-adapter.ts` was in
   the subject set and had to be excluded. The subject-set pin caught it: that
   file never mentions `fetchWithTimeout`. There was nothing to exclude. The arm
   was restated as what the measurement actually shows — glob reaches
   `adapter.ts` + exactly the six adapters, nothing else. (Same shape as the
   R469 arm-C false premise.)
2. **A JSDoc comment containing `src/**/*.ts`** terminated the comment block
   early — the same class as llm-benchmark's own R457 regex-literal finding, now
   observed from the other direction. Caught by `tsc` before any test ran.

Also: arm C1 initially ran its first call with no mock installed and compared a
real network message against a mocked one (`"{}"` vs the timeout string). The
strict `toBe` on the exact string caught it; a `toContain('300')` would have
passed on a false premise.
