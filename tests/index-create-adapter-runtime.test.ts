// tests/index-create-adapter-runtime.test.ts
//
// Coverage target: the `createAdapter(type)` switch in src/index.ts (CLI path,
// lines 26-46). Proven gap, not assumed: no suite in this repo calls it at
// runtime, and the only thing that ever named it was source text.
//
// Why this function is worth pinning at runtime rather than by grep:
//   * It is the ONLY thing standing between a user's `type:` field in
//     config.json and the adapter that actually speaks that provider's wire
//     protocol. A mis-route is a silent wrong-vendor request (an OpenAI-shaped
//     POST to Anthropic), not a crash.
//   * The two behaviours that carry the routing logic are invisible to a text
//     gate: the `type.toLowerCase()` normalisation, and the alias table
//     (glm|zhipu, qwen|tongyi|dashscope, ollama|local).
//   * This exact function already drifted ONCE between the two copies of it:
//     the web engine (src/web/engine/evaluator.ts) was case-sensitive with no
//     'zhipu' alias while the CLI was not. tests/web/evaluator-adapter-type-
//     routing.test.ts covers the WEB copy. The CLI copy -- the one every
//     `llm-bench run` goes through -- was left uncovered.
//
// Shape: same technique as index-load-config-runtime.test.ts and
// index-print-summary-runtime.test.ts. Requiring src/index under jest is safe:
// the module's top-level `main().catch(...)` takes the 'help' branch (no
// network, no process.exit), and console.log is spied for the require.
//
// Assertions are on the CONSTRUCTOR NAME, not on a source regex: that is what
// makes a dropped `toLowerCase()` or a deleted alias fail here.

import * as fs from 'fs';
import * as path from 'path';

type AdapterFactory = (type: string) => { constructor: { name: string } };

const INDEX_PATH = path.join(__dirname, '..', 'src', 'index.ts');

describe('src/index.ts createAdapter (runtime)', () => {
  const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

  let createAdapter: AdapterFactory;

  beforeAll(() => {
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require('../src/index') as { createAdapter: unknown };
      createAdapter = mod.createAdapter as AdapterFactory;
    });
  });

  afterAll(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  beforeEach(() => {
    logSpy.mockClear();
    errorSpy.mockClear();
  });

  const ctorOf = (type: string): string => createAdapter(type).constructor.name;

  it('(0) the module actually exports a callable createAdapter (harness sanity)', () => {
    // A deleted export or a renamed helper must fail HERE, not make every
    // routing assertion below pass for the wrong reason.
    expect(typeof createAdapter).toBe('function');
    expect(fs.existsSync(INDEX_PATH)).toBe(true);
  });

  it('(1) each canonical provider type routes to its own adapter', () => {
    expect(ctorOf('openai')).toBe('OpenAIAdapter');
    expect(ctorOf('anthropic')).toBe('AnthropicAdapter');
    expect(ctorOf('glm')).toBe('GLMAdapter');
    expect(ctorOf('deepseek')).toBe('DeepSeekAdapter');
    expect(ctorOf('qwen')).toBe('QwenAdapter');
    expect(ctorOf('ollama')).toBe('OllamaAdapter');
  });

  it('(2) routing is case-insensitive: a mixed-case type still reaches the right vendor', () => {
    // Dropping `.toLowerCase()` sends 'Qwen' to the default OpenAIAdapter --
    // a silent wrong-vendor request, and the exact defect the web copy had.
    expect(ctorOf('OpenAI')).toBe('OpenAIAdapter');
    expect(ctorOf('Qwen')).toBe('QwenAdapter');
    expect(ctorOf('QWEN')).toBe('QwenAdapter');
    expect(ctorOf('ANTHROPIC')).toBe('AnthropicAdapter');
    expect(ctorOf('DeepSeek')).toBe('DeepSeekAdapter');
    expect(ctorOf('OLLAMA')).toBe('OllamaAdapter');
  });

  it('(3) the alias table is honoured, not just the canonical names', () => {
    // v0.2.0-era configs use these spellings; dropping an alias silently
    // downgrades the run to OpenAI instead of erroring.
    expect(ctorOf('zhipu')).toBe('GLMAdapter');
    expect(ctorOf('tongyi')).toBe('QwenAdapter');
    expect(ctorOf('dashscope')).toBe('QwenAdapter');
    expect(ctorOf('local')).toBe('OllamaAdapter');
  });

  it('(4) aliases are case-insensitive too, not just the canonical names', () => {
    expect(ctorOf('ZHIPU')).toBe('GLMAdapter');
    expect(ctorOf('DashScope')).toBe('QwenAdapter');
    expect(ctorOf('LOCAL')).toBe('OllamaAdapter');
  });

  it('(5) an unknown type falls through to OpenAIAdapter rather than throwing', () => {
    // This is the pre-existing fallback (`case 'openai': default:`). It is
    // pinned as behaviour, not blessed: a user who typos `type` gets a
    // wrong-vendor request instead of a config error. Changing this to throw
    // would be a behaviour change, so this test documents it.
    expect(ctorOf('llama-fictional')).toBe('OpenAIAdapter');
    expect(ctorOf('')).toBe('OpenAIAdapter');
  });

  it('(6) the case labels are still present in the source (routing-table drift guard)', () => {
    // The assertions above already cover every reachable branch, so this is
    // the ONE textual check in the file and it is deliberately narrow: it does
    // not re-implement the switch, it only asserts that a future edit which
    // rewrites the table as a lookup object has not silently dropped a label
    // that no test reaches because it is unreachable-by-design.
    const src = fs.readFileSync(INDEX_PATH, 'utf-8');
    for (const label of ['anthropic', 'glm', 'zhipu', 'deepseek', 'qwen', 'tongyi', 'dashscope', 'ollama', 'local']) {
      expect(src).toContain(`case '${label}'`);
    }
  });

  it('(7) every routed adapter exposes the LLMAdapter call surface', () => {
    // A mis-import (e.g. exporting the right NAME from the wrong module)
    // would still pass (1)-(4) if the constructor name matched, so assert the
    // contract the evaluator actually calls.
    const expected: Record<string, string> = {
      openai: 'OpenAI Compatible',
      anthropic: 'Anthropic Claude',
      glm: 'Zhipu GLM',
      deepseek: 'DeepSeek',
      qwen: 'Qwen (DashScope)',
      ollama: 'Ollama (Local)',
    };
    for (const [type, name] of Object.entries(expected)) {
      const adapter = createAdapter(type) as unknown as Record<string, unknown>;
      expect(typeof adapter.chat).toBe('function');
      expect(typeof adapter.ping).toBe('function');
      expect(typeof adapter.getName).toBe('function');
      // A re-export of the right CLASS NAME from the wrong module would still
      // pass (1)-(6); the display name the reporter prints is the tiebreaker.
      const getName = adapter.getName as () => string;
      expect(getName.call(adapter)).toBe(name);
    }
  });
});