// tests/index-run-benchmark-preflight-runtime.test.ts
//
// Companion to tests/cli-log-helper.test.ts, which pins `runBenchmark` only as
// SOURCE TEXT: the start banner (`🚀 LLM Benchmark 开始...`), the roadmap
// console.info, and the fatal-error cliError. Every one of those assertions is
// satisfied by text that need never run.
//
// Proven, not asserted: with src/index.ts restored to HEAD so the baseline is
// genuinely green, mutating the real pre-flight body to
//     const configPath = 'config.json';
//     const config = { models: [{}] } as BenchmarkConfig;   // ignores the file entirely
//     // guard deleted
// left every index.ts-scanning suite at 0r/Np. The whole config-loading and
// model-validation stage of the CLI's main command is unreachable from every
// suite in the repo.
//
// Why this file can reach it: the stage that matters is entirely network-free.
// It resolves --config, reads the file, and rejects a config with no models --
// all of which happen BEFORE `new Evaluator(...)` is ever constructed. So this
// suite drives the real exported runBenchmark against real temp files and
// reaches the real guards without an adapter, a socket, or process.exit(1).
//
// No file-local copy of runBenchmark, no source-text grep, no evaluator mock.
// Requiring src/index.ts is safe under jest (established in
// tests/index-load-config-runtime.test.ts): the top-level main().catch takes
// the 'help' branch, no network, no exit.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

type RunBenchmark = (args: string[]) => Promise<void>;

describe('src/index.ts runBenchmark pre-flight (runtime)', () => {
  const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

  let runBenchmark: RunBenchmark;
  let tmpDir: string;

  beforeAll(() => {
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require('../src/index') as { runBenchmark: unknown };
      runBenchmark = mod.runBenchmark as RunBenchmark;
    });
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lb-runbench-'));
  });

  afterAll(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const writeConfig = (name: string, body: unknown): string => {
    const p = path.join(tmpDir, name);
    fs.writeFileSync(p, JSON.stringify(body), 'utf-8');
    return p;
  };

  describe('--config resolution', () => {
    // A missing file makes loadConfig take its catch arm, which prints three
    // cliError lines and calls process.exit(1). process.exit is stubbed to
    // throw so the real exit is observed instead of killing the runner. The
    // path named in the first error line is therefore the resolved configPath,
    // which makes it an observation of the resolution rather than of the text.
    let exitSpy: jest.SpyInstance;
    let exitThrows: Error;

    beforeEach(() => {
      exitThrows = new Error('__process_exit__');
      exitSpy = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error(`__process_exit__:${String(code)}`);
      }) as never);
      errorSpy.mockClear();
    });

    afterEach(() => {
      exitSpy.mockRestore();
    });

    const expectExit = async (args: string[]): Promise<string> => {
      let thrown: Error | undefined;
      try {
        await runBenchmark(args);
      } catch (e) {
        thrown = e as Error;
      }
      expect(thrown).toBeDefined();
      expect(thrown!.message).toContain('__process_exit__:1');
      expect(exitSpy).toHaveBeenCalledWith(1);
      const firstLine = errorSpy.mock.calls.map((c) => String(c[0])).join('\n');
      return firstLine;
    };

    it('defaults to config.json when --config is absent', async () => {
      // Repo root ships config.example.json only, so the default target does
      // not exist and the loadConfig catch arm is entered for real. If the
      // default were anything else, the named path in the error would differ.
      const err = await expectExit([]);
      expect(err).toContain('config.json');
    });

    it('honours --config <path> and names that exact path', async () => {
      const missing = path.join(tmpDir, 'definitely-absent.json');
      const err = await expectExit(['--config', missing]);
      expect(err).toContain(missing);
      expect(err).not.toContain('config.example.json');
    });

    it('falls back to the default when --config is the last arg with no value', async () => {
      // getArgValue returns undefined for a trailing flag (index + 1 is out of
      // range), so the || default must apply rather than passing `undefined`
      // into readFileSync as the path.
      const err = await expectExit(['--config']);
      expect(err).toContain('config.json');
    });

    it('reads the file named by --config, not a hardcoded one', async () => {
      // The file exists and parses, so loadConfig returns instead of exiting;
      // the failure that follows must come from the models guard, and must
      // quote THIS path. A hardcoded configPath cannot produce this string.
      const cfg = writeConfig('parsed-but-empty.json', { models: [] });
      let thrown: Error | undefined;
      try {
        await runBenchmark(['--config', cfg]);
      } catch (e) {
        thrown = e as Error;
      }
      expect(thrown).toBeDefined();
      expect(thrown!.message).toContain(cfg);
    });
  });

  describe('empty-models guard', () => {
    const runExpectingGuard = async (args: string[]): Promise<string> => {
      let thrown: Error | undefined;
      try {
        await runBenchmark(args);
      } catch (e) {
        thrown = e as Error;
      }
      expect(thrown).toBeDefined();
      return thrown!.message;
    };

    it('rejects a config whose models array is empty', async () => {
      const cfg = writeConfig('models-empty.json', { models: [], benchmarks: {} });
      const msg = await runExpectingGuard(['--config', cfg]);
      expect(msg).toContain('config.models');
      expect(msg).toContain(cfg);
    });

    it('rejects a config with no models key at all', async () => {
      const cfg = writeConfig('models-missing.json', { benchmarks: { dialogue: true } });
      const msg = await runExpectingGuard(['--config', cfg]);
      expect(msg).toContain('config.models');
      expect(msg).toContain(cfg);
    });

    it('does NOT treat a non-array models value as empty, and still fails loudly', async () => {
      // The guard's documented condition is `length === 0`. An object has
      // length === undefined, which is not 0, so the guard does NOT fire and
      // the failure surfaces one line later at `models[0].type`. Asserted as
      // what is true: the run aborts with a TypeError that is NOT the
      // config.models message. The distinction matters -- a guard widened to
      // `!config.models?.length` would turn this into the friendly message,
      // which is a behaviour change, not a refactor.
      const cfg = writeConfig('models-object.json', { models: { name: 'x' } });
      let thrown: Error | undefined;
      try {
        await runBenchmark(['--config', cfg]);
      } catch (e) {
        thrown = e as Error;
      }
      expect(thrown).toBeDefined();
      expect(thrown!.message).not.toContain('config.models');
      expect(thrown!.message).toContain("reading 'type'");
    });

    it('lets a null entry past the guard and aborts at createAdapter', async () => {
      // Same shape as above: [null] has length 1, so the guard does not fire.
      const cfg = writeConfig('models-null-entry.json', { models: [null] });
      let thrown: Error | undefined;
      try {
        await runBenchmark(['--config', cfg]);
      } catch (e) {
        thrown = e as Error;
      }
      expect(thrown).toBeDefined();
      expect(thrown!.message).not.toContain('config.models');
      expect(thrown!.message).toContain("reading 'type'");
    });

    it('does not throw the guard error for a well-formed single model', async () => {
      // The negative control. If this ever threw the config.models error the
      // guard would be rejecting valid input; it must get past the guard and
      // fail (or succeed) somewhere strictly later.
      const cfg = writeConfig('models-one.json', {
        models: [
          {
            name: 'm',
            endpoint: 'http://127.0.0.1:1/v1',
            apiKey: 'k',
            type: 'openai',
            model: 'x',
          },
        ],
        benchmarks: { dialogue: false, coding: false },
        output: path.join(tmpDir, 'out'),
        runs: 1,
      });
      let thrown: Error | undefined;
      try {
        await runBenchmark(['--config', cfg]);
      } catch (e) {
        thrown = e as Error;
      }
      if (thrown !== undefined) {
        expect(thrown.message).not.toContain('config.models 为空');
      }
    });

    it('quotes the resolved path in the guard message, not a literal default', async () => {
      // Same guard, three distinct paths: proves the message interpolates the
      // argument rather than embedding a constant.
      const a = writeConfig('path-a.json', { models: [] });
      const b = writeConfig('path-b.json', { models: [] });
      const msgA = await runExpectingGuard(['--config', a]);
      const msgB = await runExpectingGuard(['--config', b]);
      expect(msgA).toContain(a);
      expect(msgB).toContain(b);
      expect(msgA).not.toBe(msgB);
    });
  });

  describe('start banner', () => {
    it('prints the run banner before touching the config', async () => {
      const cfg = writeConfig('banner.json', { models: [] });
      logSpy.mockClear();
      await runBenchmark(['--config', cfg]).catch(() => undefined);
      const logs = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(logs).toContain('LLM Benchmark');
    });
  });
});
