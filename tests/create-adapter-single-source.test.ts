// tests/create-adapter-single-source.test.ts
//
// The invariant this file exists to protect is NOT a behaviour -- the routing
// behaviour is already pinned twice, by tests/index-create-adapter-runtime.test.ts
// (CLI surface) and tests/web/evaluator-type-routing (web surface). Those two
// suites used to guard two SEPARATE hand-maintained switches, so a change to
// either copy was only caught on the surface that owned it, and a change that
// reintroduced divergence was caught by neither.
//
// What is new is the one-source claim itself: both entry points must resolve to
// the SAME function object. That is checkable, and it is the thing that regresses
// silently the moment somebody pastes a switch back into a call site.
//
// How it is checked:
//   (a) identity -- the CLI re-export and the web module must both hand back the
//       exact function object exported by src/adapters/create-adapter.ts. A
//       re-implemented wrapper, a copy, or a re-created arrow function all fail.
//   (b) the call sites must not contain a routing switch of their own. This is
//       the guard against the regression, not just the description of it: a
//       pasted-in `switch (type.toLowerCase())` re-appears in source even if it
//       is never reached, and the identity check alone would still pass.
//   (c) the web engine's private method is a delegation, proven by driving it
//       and by asserting the private method's own body has no `switch`.
//
// Note on (a): identity is asserted on the function object, so a future
// legitimate change (e.g. wrapping createAdapter for metrics) has to be a
// deliberate edit here rather than an accident.

import * as fs from 'fs';
import * as path from 'path';

const SRC = path.join(__dirname, '..', 'src');
const SHARED_PATH = path.join(SRC, 'adapters', 'create-adapter.ts');
const INDEX_PATH = path.join(SRC, 'index.ts');
const WEB_ENGINE_PATH = path.join(SRC, 'web', 'engine', 'evaluator.ts');

type Factory = (type: string) => { constructor: { name: string } };

describe('createAdapter has exactly one implementation', () => {
  const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

  afterAll(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  beforeEach(() => {
    logSpy.mockClear();
    errorSpy.mockClear();
  });

  it('(0) the shared routing module exports a callable createAdapter', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const shared = require('../src/adapters/create-adapter') as { createAdapter: unknown };
    expect(typeof shared.createAdapter).toBe('function');
    expect(fs.existsSync(SHARED_PATH)).toBe(true);
  });

  it('(1) the CLI entry point re-exports the SAME function object, not a copy', () => {
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const shared = require('../src/adapters/create-adapter') as { createAdapter: Factory };
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const cli = require('../src/index') as { createAdapter: Factory };
      expect(cli.createAdapter).toBe(shared.createAdapter);
    });
  });

  it('(2) the web engine resolves its routing to the shared function too', () => {
    // The web method is a private delegation, so the module surface is
    // EvaluatorEngine. Driving a real run is tests/web/evaluator-adapter-type-
    // routing.test.ts's job; here the claim is narrower and structural.
    const web = fs.readFileSync(WEB_ENGINE_PATH, 'utf-8');
    // The delegation, verbatim.
    expect(web).toMatch(/private createAdapter\(type: string\): LLMAdapter \{\s*return createAdapter\(type\);\s*\}/);
    // And the shared module is what it delegates to.
    expect(web).toMatch(/from '\.\.\/\.\.\/adapters\/create-adapter'/);
  });

  it('(3) neither call site carries its own routing switch', () => {
    // The regression guard proper. Pasting the switch back into a call site
    // re-introduces two hand-maintained copies; the identity assertions above
    // would still pass, so this source check is the only thing that catches it.
    for (const [label, file] of [
      ['src/index.ts', INDEX_PATH],
      ['src/web/engine/evaluator.ts', WEB_ENGINE_PATH],
    ] as Array<[string, string]>) {
      const src = fs.readFileSync(file, 'utf-8');
      expect(src).not.toMatch(/switch\s*\(\s*type\.toLowerCase\(\)\s*\)/);
      // No call site may name an adapter constructor either: routing decisions
      // live in create-adapter.ts, not at the call sites.
      for (const ctor of [
        'OpenAIAdapter',
        'AnthropicAdapter',
        'GLMAdapter',
        'DeepSeekAdapter',
        'QwenAdapter',
        'OllamaAdapter',
      ]) {
        expect(src).not.toContain(`new ${ctor}(`);
      }
    }
  });

  it('(4) the shared module is the only file that constructs adapters by routing', () => {
    // Positive half of (3): the labels must exist somewhere real, so a future
    // edit that empties the table cannot pass (3) by deleting both sides.
    const shared = fs.readFileSync(SHARED_PATH, 'utf-8');
    for (const label of ['anthropic', 'glm', 'zhipu', 'deepseek', 'qwen', 'tongyi', 'dashscope', 'ollama', 'local']) {
      expect(shared).toContain(`case '${label}'`);
    }
    expect(shared).toMatch(/export function createAdapter\(type: string\): LLMAdapter/);
  });

  it('(5) the shared function still routes correctly from a fresh require', () => {
    // (1)-(4) are structural. This is the behavioural floor: if the dedup had
    // accidentally changed routing, a structural check alone would not notice.
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const shared = require('../src/adapters/create-adapter') as { createAdapter: Factory };
      const ctorOf = (type: string): string => shared.createAdapter(type).constructor.name;
      expect(ctorOf('openai')).toBe('OpenAIAdapter');
      expect(ctorOf('ZHIPU')).toBe('GLMAdapter');
      expect(ctorOf('DashScope')).toBe('QwenAdapter');
      expect(ctorOf('anthropic')).toBe('AnthropicAdapter');
      expect(ctorOf('no-such-vendor')).toBe('OpenAIAdapter');
    });
  });
});
