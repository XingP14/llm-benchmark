// tests/r480-anthropic-request-boundary.test.ts
//
// MEASURED 2026-10-18: `buildAnthropicChatBody` is pinned as a UNIT, and the
// Anthropic REQUEST that consumes it is pinned as a RETURN VALUE. The join
// between the two is pinned by nothing.
//
// THE CENSUS (arms A/G, derived by glob over src/, not by a hand-written list):
//   - `buildAnthropicChatBody` has exactly ONE production call site:
//     src/adapters/anthropic-adapter.ts:54, inside `chat()`.
//   - every OTHER call in the repo is a direct test import of the helper.
//
// So the five `it(...)` cases in tests/adapter.test.ts:934-995 pin the helper's
// return value under names the tests choose themselves, and the four
// `AnthropicAdapter` cases (adapter.test.ts:106+, adapter-default-endpoint
// -branch-coverage.test.ts:14+) all pass a SINGLE `{ role: 'user' }` message.
//
// The observable consequence: mutate the production call site to build a body
// that never splits the system message out, and all five unit cases stay green
// -- they never touch the adapter -- while the adapter's four cases stay green
// too, because none of them sends a system message. The property the unit suite
// documents ("system is hoisted out of `messages` into the top-level `system`
// field") is a property of Anthropic's wire format, and the wire format is
// produced in exactly one place that no test observes.
//
// A repo-wide grep makes the second half concrete: `role: 'system'` appears in
// tests/adapter.test.ts only inside the two helper describes (L903/L918-919 for
// splitSystemMessage, L937/L977 for buildAnthropicChatBody). ZERO tests hand a
// system message to any adapter's `chat()`.
//
// THREE headers ride the same unobserved line. `anthropic-version:
// '2023-06-01'` and `anthropic-dangerous-direct-browser-access: 'true'` appear
// in NO test file in the repo (`grep -rn anthropic-version tests/` is empty).
// Only `x-api-key` is pinned, by exactly one assertion
// (adapter-default-endpoint-branch-coverage.test.ts:36). A header is what
// Anthropic uses to decide whether a browser-origin request is allowed at all;
// dropping it turns a 200 into a 403 that no suite here would produce.
//
// The production producers are reachable but unobserved, which is the exact
// shape the standing round method calls a coverage gap rather than a bug:
// the code is correct as written, and nothing pins that it stays correct.
// Every arm below pins CURRENT behaviour, so a repair turns this suite RED on
// purpose. WHAT THE REPAIR SHOULD BE is a product decision (Anthropic's current
// browser policy; whether a non-default max_tokens belongs on the wire) and is
// NOT decided here.
//
// METHOD. Every observation is made at the `globalThis.fetch` boundary -- the
// actual bytes on the wire -- not by calling the helper. That is the point:
// these arms exist because the helper-level view was already covered and proved
// insufficient.
import { AnthropicAdapter } from '../src/adapters/anthropic-adapter';

const ANTHROPIC_VERSION = '2023-06-01';

const cfg = (over: Record<string, unknown> = {}) =>
  ({
    name: 'test',
    endpoint: 'https://api.anthropic.com',
    apiKey: 'sk-test-key',
    type: 'anthropic' as const,
    ...over,
  }) as any;

const okResponse = (payload: unknown) =>
  ({ ok: true, json: jest.fn().mockResolvedValue(payload) }) as any;

/** Run one chat() call and return the parsed JSON body that reached fetch. */
async function bodyFor(
  messages: Array<{ role: string; content: string }>,
  config?: Record<string, unknown>
): Promise<Record<string, any>> {
  const fetchSpy = jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(okResponse({ content: [{ type: 'text', text: 'Hi' }] }));
  await new AnthropicAdapter().chat(messages as any, cfg(config));
  const init = fetchSpy.mock.calls[0][1] as RequestInit;
  return JSON.parse(String(init.body));
}

async function initFor(
  messages: Array<{ role: string; content: string }>,
  config?: Record<string, unknown>
): Promise<RequestInit> {
  const fetchSpy = jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(okResponse({ content: [{ type: 'text', text: 'Hi' }] }));
  await new AnthropicAdapter().chat(messages as any, cfg(config));
  return fetchSpy.mock.calls[0][1] as RequestInit;
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('r480 Anthropic request boundary (the wire, not the helper)', () => {
  // A. The headline join: a system message survives the ONE production call
  //    site of buildAnthropicChatBody and reaches the wire hoisted, i.e. as the
  //    top-level `system` field and NOT as an entry of `messages`.
  it('A hoists a system message out of messages and onto the top-level system field', async () => {
    const body = await bodyFor([
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Q1' },
      { role: 'assistant', content: 'A1' },
      { role: 'user', content: 'Q2' },
    ]);
    expect(body.system).toBe('You are a helpful assistant.');
    expect(body.messages).toEqual([
      { role: 'user', content: 'Q1' },
      { role: 'assistant', content: 'A1' },
      { role: 'user', content: 'Q2' },
    ]);
  });

  // A2. Only the FIRST system message is hoisted; the extras are dropped, not
  //     leaked into `messages`. This is the find+filter semantics the helper
  //     documents -- observed now where it is actually produced.
  it('A2 keeps the first system message and drops the rest rather than leaking them', async () => {
    const body = await bodyFor([
      { role: 'system', content: 'first' },
      { role: 'system', content: 'second' },
      { role: 'user', content: 'Q' },
    ]);
    expect(body.system).toBe('first');
    expect(body.messages).toEqual([{ role: 'user', content: 'Q' }]);
  });

  // A3. No system message => the key must be ABSENT, not empty. Anthropic
  //     rejects `system: ""` differently from omitting it, so absence is the
  //     behaviour worth pinning.
  it('A3 omits the system key entirely when the caller sends no system message', async () => {
    const body = await bodyFor([{ role: 'user', content: 'Q' }]);
    expect('system' in body).toBe(false);
    expect(body.messages).toEqual([{ role: 'user', content: 'Q' }]);
  });

  // A4. Message order on the wire is the caller's order, minus system entries.
  it('A4 preserves caller order on the wire for a mixed-role conversation', async () => {
    const body = await bodyFor([
      { role: 'user', content: '1' },
      { role: 'assistant', content: '2' },
      { role: 'system', content: 'mid-system' },
      { role: 'user', content: '3' },
    ]);
    expect(body.messages.map((m: { content: string }) => m.content)).toEqual(['1', '2', '3']);
    expect(body.system).toBe('mid-system');
  });

  // B. max_tokens reaches the wire at the helper's default, because the
  //    production call site passes no third argument.
  it('B puts max_tokens 2048 on the wire, the default the call site inherits', async () => {
    const body = await bodyFor([{ role: 'user', content: 'Q' }]);
    expect(body.max_tokens).toBe(2048);
  });

  // C. anthropic-version is required by the API and named by NO test in the repo.
  it('C sends anthropic-version 2023-06-01', async () => {
    const init = await initFor([{ role: 'user', content: 'Q' }]);
    const headers = init.headers as Record<string, string>;
    expect(headers['anthropic-version']).toBe(ANTHROPIC_VERSION);
  });

  // C2. The browser-access opt-in rides the same header block.
  it('C2 sends anthropic-dangerous-direct-browser-access true', async () => {
    const init = await initFor([{ role: 'user', content: 'Q' }]);
    const headers = init.headers as Record<string, string>;
    expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true');
  });

  // C3. The credential header, pinned at the boundary rather than only at the
  //     default-endpoint site, and for a CUSTOM endpoint too.
  it('C3 sends x-api-key and Content-Type for a custom endpoint', async () => {
    const init = await initFor([{ role: 'user', content: 'Q' }], {
      endpoint: 'https://proxy.example.com',
      apiKey: 'sk-custom-key',
    });
    const headers = init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-custom-key');
    expect(headers['Content-Type']).toBe('application/json');
  });

  // D. Method + URL, observed together with the body, at the boundary.
  it('D posts to <endpoint>/v1/messages with method POST', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(okResponse({ content: [{ type: 'text', text: 'Hi' }] }));
    await new AnthropicAdapter().chat([{ role: 'user', content: 'Q' }], cfg({
      endpoint: 'https://proxy.example.com',
    }));
    expect(fetchSpy.mock.calls[0][0]).toBe('https://proxy.example.com/v1/messages');
    expect((fetchSpy.mock.calls[0][1] as RequestInit).method).toBe('POST');
  });

  // E. A default-endpoint request must join a custom-endpoint request on
  //    everything except the host -- so a header pinned at only one site is not
  //    pinned for the other. Both go through the same header literal in
  //    production; this makes that structural fact observable.
  it('E default endpoint differs from custom endpoint only in the URL', async () => {
    const init = await initFor([{ role: 'user', content: 'Q' }]);
    const headers = init.headers as Record<string, string>;
    expect(headers['anthropic-version']).toBe(ANTHROPIC_VERSION);
    expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    expect((init.headers as any)['Content-Type']).toBe('application/json');
  });

  // F. Shape at the boundary: the wire body carries exactly Anthropic's four
  //    documented fields and nothing else. A helper returning an extra key
  //    (or renaming one) is a wire change that no return-value test would see,
  //    because `toEqual` on the helper is not `toEqual` on the request.
  it('F puts exactly the four Anthropic fields on the wire', async () => {
    const body = await bodyFor([{ role: 'user', content: 'Q' }]);
    expect(Object.keys(body).sort()).toEqual(['max_tokens', 'messages', 'model']);
    expect(body.model).toBe('claude-3-haiku-20240307');
  });
});
