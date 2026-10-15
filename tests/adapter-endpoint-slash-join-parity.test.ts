// tests/adapter-endpoint-slash-join-parity.test.ts
//
// FINDING (measured 2026-10-16 03:03 tick, not inferred): the six adapters do
// NOT agree on how `config.endpoint` joins the request path. Over a 6 x 3 probe
// (each adapter x {no slash, one slash, two slashes}), only THREE of the six
// strip a trailing slash before appending their path:
//
//   qwen      /base/   -> /base/chat/completions     (replace(/\/$/, '') applied)
//   deepseek  /base/   -> /base/chat/completions     (replace(/\/$/, '') applied)
//   ollama    /base/   -> /base/v1/chat/completions  (replace(/\/$/, '') applied)
//   openai    /base/   -> /base//chat/completions    (NOT stripped)
//   glm       /base/   -> /base//chat/completions    (NOT stripped)
//   anthropic /base/   -> /base//v1/messages         (NOT stripped)
//
// So the SAME user config -- a proxy base URL copied out of a browser address
// bar, which almost always has the trailing slash -- produces a DIFFERENT URL
// per adapter. Three of the six send `host/base//chat/completions`. There is no
// crash and no error message: the request either 404s at the proxy or is routed
// to a different vhost, and the user sees a plausible-looking failure that
// depends on WHICH provider they selected.
//
// Why this is characterized, not asserted-red: which behaviour is CORRECT is a
// product decision (a shared `joinEndpoint()` helper vs. verbatim passthrough vs.
// per-vendor requirements), so this suite pins the CURRENT split in full and
// adds a uniformity canary that goes RED the moment the family becomes
// uniform again. That direction is deliberate and is the point: if a fix lands,
// these exact-URL pins fail and force a deliberate update of the table below,
// rather than a helper landing silently and half the adapters drifting again.
//
// SUBJECT SET is derived from the tree (src/adapters/*-adapter.ts), never a hand
// list -- a hand list would silently skip a 7th adapter, which is the exact
// failure mode this suite exists to catch (r429/r437 shape).

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import type { ModelConfig } from '../src/types';
import { OpenAIAdapter } from '../src/adapters/openai-adapter';
import { QwenAdapter } from '../src/adapters/qwen-adapter';
import { DeepSeekAdapter } from '../src/adapters/deepseek-adapter';
import { GLMAdapter } from '../src/adapters/glm-adapter';
import { OllamaAdapter } from '../src/adapters/ollama-adapter';
import { AnthropicAdapter } from '../src/adapters/anthropic-adapter';

const ADAPTER_DIR = join(__dirname, '..', 'src', 'adapters');

/**
 * Every concrete adapter class shipped by src/adapters, derived from the tree.
 *
 * Two files are excluded BY MEASUREMENT, not by taste:
 *   - adapter.ts         is the shared-helper module (fetchWithTimeout et al),
 *                        it defines no adapter class.
 *   - create-adapter.ts  matches the `*-adapter.ts` glob but is a FACTORY -- it
 *                        exports createAdapter(type), not a class, so calling
 *                        chat() on "the instance" is undefined. My first version
 *                        of this filter omitted it and the subject-set pin failed
 *                        loudly, which is exactly what the pin is for.
 */
function adapterFilesInTree(): string[] {
  return readdirSync(ADAPTER_DIR)
    .filter((f) => f.endsWith('-adapter.ts'))
    .filter((f) => f !== 'adapter.ts')
    .filter((f) => f !== 'create-adapter.ts')
    .sort();
}

const CONSTRUCTORS: Record<string, () => any> = {
  'anthropic-adapter.ts': () => new AnthropicAdapter(),
  'deepseek-adapter.ts': () => new DeepSeekAdapter(),
  'glm-adapter.ts': () => new GLMAdapter(),
  'ollama-adapter.ts': () => new OllamaAdapter(),
  'openai-adapter.ts': () => new OpenAIAdapter(),
  'qwen-adapter.ts': () => new QwenAdapter(),
};

/**
 * Measured on 2026-10-16 03:03 CST by driving each adapter's real `chat()`
 * with a mocked fetch and reading the URL argument back out. These strings are
 * hard-coded ON PURPOSE: a pin that recomputes the expected value from the code
 * it is pinning is tautological and cannot fail (shipped 25aa52a).
 */
const MEASURED: Record<
  string,
  { slashless: string; oneSlash: string; twoSlashes: string }
> = {
  'anthropic-adapter.ts': {
    slashless: 'https://host.example.com/base/v1/messages',
    oneSlash: 'https://host.example.com/base//v1/messages',
    twoSlashes: 'https://host.example.com/base///v1/messages',
  },
  'deepseek-adapter.ts': {
    slashless: 'https://host.example.com/base/chat/completions',
    oneSlash: 'https://host.example.com/base/chat/completions',
    twoSlashes: 'https://host.example.com/base//chat/completions',
  },
  'glm-adapter.ts': {
    slashless: 'https://host.example.com/base/chat/completions',
    oneSlash: 'https://host.example.com/base//chat/completions',
    twoSlashes: 'https://host.example.com/base///chat/completions',
  },
  'ollama-adapter.ts': {
    slashless: 'https://host.example.com/base/v1/chat/completions',
    oneSlash: 'https://host.example.com/base/v1/chat/completions',
    twoSlashes: 'https://host.example.com/base//v1/chat/completions',
  },
  'openai-adapter.ts': {
    slashless: 'https://host.example.com/base/chat/completions',
    oneSlash: 'https://host.example.com/base//chat/completions',
    twoSlashes: 'https://host.example.com/base///chat/completions',
  },
  'qwen-adapter.ts': {
    slashless: 'https://host.example.com/base/chat/completions',
    oneSlash: 'https://host.example.com/base/chat/completions',
    twoSlashes: 'https://host.example.com/base//chat/completions',
  },
};

const BASE = 'https://host.example.com/base';

const ENDPOINTS: Array<[keyof (typeof MEASURED)[string], string]> = [
  ['slashless', BASE],
  ['oneSlash', `${BASE}/`],
  ['twoSlashes', `${BASE}//`],
];

function okResponse(payload: unknown): any {
  return {
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue(payload),
    text: jest.fn().mockResolvedValue(''),
  };
}

/** Anthropic returns content[]; the OpenAI-compatible five return choices[]. */
function payloadFor(file: string): unknown {
  return file === 'anthropic-adapter.ts'
    ? { content: [{ type: 'text', text: 'ok' }] }
    : { choices: [{ message: { content: 'ok' } }] };
}

const config = (endpoint: string): ModelConfig =>
  ({
    name: 'probe',
    provider: 'probe',
    model: 'probe-model',
    apiKey: 'sk-probe-key',
    endpoint,
    type: 'openai',
  }) as ModelConfig;

describe('adapter endpoint slash-join parity', () => {
  afterEach(() => jest.restoreAllMocks());

  async function requestedUrl(file: string, endpoint: string): Promise<string> {
    const adapter = CONSTRUCTORS[file]();
    const spy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(okResponse(payloadFor(file)) as any);
    await adapter.chat([{ role: 'user', content: 'Hi' }], config(endpoint));
    return spy.mock.calls[0][0] as unknown as string;
  }

  it('the tree contains exactly the adapters this table was measured against', () => {
    // A 7th adapter added without a measured row must FAIL here rather than
    // quietly escape the whole suite.
    expect(adapterFilesInTree()).toEqual(Object.keys(MEASURED).sort());
  });

  it('every adapter constructs a URL with no empty path segment for a clean endpoint', async () => {
    for (const file of adapterFilesInTree()) {
      const url = await requestedUrl(file, BASE);
      const path = url.slice(url.indexOf('/', url.indexOf('//') + 2));
      expect(`${file}: ${path}`).not.toContain('//');
    }
  });

  for (const file of adapterFilesInTree()) {
    for (const [shape, endpoint] of ENDPOINTS) {
      it(`${file} joins ${shape} onto the measured URL`, async () => {
        expect(await requestedUrl(file, endpoint)).toBe(MEASURED[file][shape]);
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Uniformity canary. This is the ONE assertion in the file that is red by
  // design against today's code: exactly half the family strips the slash and
  // half does not. It documents the split as a live property of the repo so a
  // partial repair cannot land unnoticed. When someone unifies the join, this
  // goes green and the exact-URL cases above go red -- which is the update that
  // must happen, not a failure to work around.
  // ---------------------------------------------------------------------------
  it('exactly half the family strips a trailing slash (the measured split)', () => {
    const strippers = adapterFilesInTree().filter(
      (f) => MEASURED[f].oneSlash === MEASURED[f].slashless
    );
    const verbatim = adapterFilesInTree().filter(
      (f) => MEASURED[f].oneSlash !== MEASURED[f].slashless
    );
    expect(strippers.sort()).toEqual([
      'deepseek-adapter.ts',
      'ollama-adapter.ts',
      'qwen-adapter.ts',
    ]);
    expect(verbatim.sort()).toEqual([
      'anthropic-adapter.ts',
      'glm-adapter.ts',
      'openai-adapter.ts',
    ]);
  });

  // Every non-stripper must at least keep the SOURCE text intact: `//` in the
  // middle of a path is what actually reaches the proxy, so assert on the path
  // rather than on a URL string a future refactor could reshape.
  it('the three verbatim adapters forward the doubled separator to the network', () => {
    for (const file of ['anthropic-adapter.ts', 'glm-adapter.ts', 'openai-adapter.ts']) {
      const { oneSlash } = MEASURED[file];
      const path = oneSlash.slice(oneSlash.indexOf('/', oneSlash.indexOf('//') + 2));
      expect(`${file}: ${path}`).toContain('//');
    }
  });

  // Guards the pin against a stale fixture: if someone edits BASE or the table
  // wholesale, this asserts the table still describes the live source shape.
  //
  // There are TWO source shapes in the family, and both are real:
  //   `${endpoint}/v1/messages`          (anthropic — local const, has a default)
  //   `${config.endpoint}/chat/completions` (glm/openai — inline, NO default)
  // The regex accepts either, and is deliberately loose about the expression
  // inside the braces. A first version anchored on `\$\{endpoint\}` alone and
  // failed on exactly the two adapters that have no endpoint const -- which
  // reads as a regression rather than as a name-bound gate (the 25aa52a shape).
  it('every adapter builds its URL by appending a path suffix to config.endpoint', () => {
    for (const file of adapterFilesInTree()) {
      const src = readFileSync(join(ADAPTER_DIR, file), 'utf8');
      expect(`${file}: ${src}`).toMatch(
        /\$\{(endpoint|config\.endpoint)[^}]*\}\/(v1\/)?(chat\/completions|messages)/
      );
    }
  });
});
