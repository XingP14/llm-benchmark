// tests/index-load-config-runtime.test.ts
//
// Companion to tests/stale-bak-cleanup.test.ts cases (4) and (5), which are
// source-text gates on `loadConfig`'s CATCH body:
//   (4) the catch block contains an `errorMessage(error)` call
//   (5) the catch block keeps the configPath line, the recovery hint, and
//       `process.exit(1)`
//
// Both are satisfied by text that need never run. Proven, not asserted: with
// src/index.ts restored to HEAD so the baseline is genuinely green, mutating
// the real body to
//     const content = fs.readFileSync(configPath, 'utf-8');
//     void content;
//     return {} as BenchmarkConfig;
// left all 6 index.ts-scanning suites at 0r/67p. A loadConfig that reads the
// file, throws the parsed value away and hands every caller an empty config
// passes every gate that mentions the function. (The three catch-block mutants
// WERE killed -- 2p / 2p / 1p -- so the gap is exactly the success path, and
// exactly that: the catch is pinned as text, the return value as nothing.)
//
// This file pins the success path at runtime. It imports the real loadConfig
// from src/index.ts, which is safe to require under jest: the module's
// top-level `main().catch(...)` runs the 'help' branch (no network, no
// process.exit), and console.log is spied on for the duration of the require
// so the help text does not pollute the reporter.
//
// No file-local copy of loadConfig and no source-text grep. The failure path
// is asserted too, but with process.exit stubbed to throw so the real exit is
// observed rather than the test runner's exit.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { BenchmarkConfig } from '../src/types';

type LoadConfig = (configPath: string) => BenchmarkConfig;

describe('src/index.ts loadConfig (runtime)', () => {
  const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

  let loadConfig: LoadConfig;
  let tmpDir: string;

  beforeAll(() => {
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require('../src/index') as { loadConfig: unknown };
      loadConfig = mod.loadConfig as LoadConfig;
    });
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lb-loadconfig-'));
  });

  afterAll(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    logSpy.mockClear();
    errorSpy.mockClear();
  });

  const writeConfig = (name: string, value: unknown): string => {
    const p = path.join(tmpDir, name);
    fs.writeFileSync(p, JSON.stringify(value), 'utf-8');
    return p;
  };

  it('(0) the module actually exports a callable loadConfig (harness sanity)', () => {
    // A deleted export or a renamed helper must fail here rather than make
    // every assertion below pass for the wrong reason.
    expect(typeof loadConfig).toBe('function');
  });

  it('(1) returns the parsed config, not a placeholder', () => {
    const p = writeConfig('ok.json', {
      models: [{ name: 'm1', type: 'openai', endpoint: 'https://e', apiKey: 'k', model: 'gpt-4' }],
      benchmarks: { dialogue: true, coding: true },
      output: './results',
    });
    const cfg = loadConfig(p);
    // The M1 mutant (return {} as BenchmarkConfig) fails on every line here.
    expect(cfg).toEqual({
      models: [{ name: 'm1', type: 'openai', endpoint: 'https://e', apiKey: 'k', model: 'gpt-4' }],
      benchmarks: { dialogue: true, coding: true },
      output: './results',
    });
  });

  it('(2) the returned object is a deep copy, not the file buffer', () => {
    const p = writeConfig('copy.json', { models: [], benchmarks: {}, output: './r' });
    const cfg = loadConfig(p);
    expect(cfg).not.toBeUndefined();
    expect(typeof cfg).toBe('object');
    cfg.output = './mutated';
    // Re-reading the same path must be unaffected by the mutation above:
    // proves loadConfig parses per call rather than caching a shared object.
    expect(loadConfig(p).output).toBe('./r');
  });

  it('(3) every top-level key of the file survives, none is dropped or defaulted', () => {
    const p = writeConfig('keys.json', {
      models: [],
      benchmarks: { dialogue: false, coding: false },
      output: './deep/nested/out',
      apiKey: 'file-level-key',
    });
    const cfg = loadConfig(p) as unknown as Record<string, unknown>;
    expect(Object.keys(cfg).sort()).toEqual(['apiKey', 'benchmarks', 'models', 'output']);
    expect(cfg.apiKey).toBe('file-level-key');
    expect(cfg.output).toBe('./deep/nested/out');
  });

  it('(4) UTF-8 content round-trips without mangling', () => {
    const p = path.join(tmpDir, 'utf8.json');
    fs.writeFileSync(p, JSON.stringify({ models: [], output: './结果/中文' }), 'utf-8');
    expect(loadConfig(p).output).toBe('./结果/中文');
  });

  it('(5) failure path: missing file logs 3 lines and exits 1', () => {
    const realExit = process.exit;
    let exitCode: number | undefined;
    process.exit = ((code?: number) => {
      exitCode = code;
      throw new Error('__PROCESS_EXIT_STUB__');
    }) as unknown as typeof process.exit;
    try {
      expect(() => loadConfig(path.join(tmpDir, 'does-not-exist.json'))).toThrow(
        '__PROCESS_EXIT_STUB__'
      );
    } finally {
      process.exit = realExit;
    }
    expect(exitCode).toBe(1);
    const lines = errorSpy.mock.calls.map((c) => String(c[0]));
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('无法加载配置文件');
    expect(lines[0]).toContain('does-not-exist.json');
    // The `原因:` line must carry the underlying error text (errorMessage),
    // not just restate the path -- this is case (4) of stale-bak-cleanup
    // asserted as an observable string instead of as a regex over the source.
    expect(lines[1]).toMatch(/^原因: /);
    expect(lines[1]).not.toBe('原因: undefined');
    expect(lines[1].length).toBeGreaterThan('原因: '.length + 1);
    expect(lines[2]).toBe('请先运行: llm-bench init');
  });

  it('(6) failure path: malformed JSON is reported the same way as a missing file', () => {
    const p = path.join(tmpDir, 'broken.json');
    fs.writeFileSync(p, '{ not json', 'utf-8');
    const realExit = process.exit;
    let exitCode: number | undefined;
    process.exit = ((code?: number) => {
      exitCode = code;
      throw new Error('__PROCESS_EXIT_STUB__');
    }) as unknown as typeof process.exit;
    try {
      expect(() => loadConfig(p)).toThrow('__PROCESS_EXIT_STUB__');
    } finally {
      process.exit = realExit;
    }
    expect(exitCode).toBe(1);
    const lines = errorSpy.mock.calls.map((c) => String(c[0]));
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('broken.json');
    expect(lines[1]).toMatch(/^原因: /);
  });

  it('(7) loadConfig never falls through the catch on the success path', () => {
    // Guards the shape the other cases assume: a config that parses cleanly
    // must not have produced ANY stderr line, which is what a mutant that
    // unconditionally logs (or that routes success through the catch) does.
    const p = writeConfig('quiet.json', { models: [], output: './r' });
    loadConfig(p);
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
