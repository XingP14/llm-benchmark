/**
 * R551 -- the OPERATOR-CONFIG plane: a config field that the harness
 * publishes, documents and validates -- and never reads.
 *
 * R519 / R522 / R524 / R526 / R528 / R531 / R532 / R533 / R535 / R537 / R539 /
 * R546 / R548 audited the per-dimension SCORERS, the external-benchmark
 * channel, the judge-is-the-subject posture, the failure channel, the
 * published confidence interval and the completion envelope.  Every one of
 * them asked "is this NUMBER right?".
 *
 * R551 steps all the way back to the thing an OPERATOR writes: the
 * `config.json` (and the shipped `config.example.json`, and the
 * `BenchmarkConfig` type that describes it).  The question is not "is this
 * number right?" but:
 *
 *     "The operator set this. Does it change anything?"
 *
 * WHAT WAS MEASURED (through the real production classes -- the real
 * `Evaluator`, the real `createAdapter`, the real `Reporter`, the real
 * `buildOpenAIChatBody`; nothing re-implements the config load, the
 * dispatch, the aggregation or the report rendering):
 *
 *   F1  `concurrency` AND `runs` ARE PART OF THE PUBLISHED CONTRACT AND NO
 *       CODE EVER READS THEM.
 *
 *       `src/types/index.ts` declares:
 *         concurrency?: number;   // 并发数 (默认 3)
 *         runs?: number;           // 评测次数 (默认 1)
 *       `src/index.ts` `initConfig()` WRITES both into the generated
 *       `config.json` (`concurrency: 3`, `runs: 1`).
 *       `config.example.json` -- the file shipped in the npm package
 *       (`package.json` `files` includes `config.example.json`) -- carries
 *       BOTH.
 *       `tests/config-example-external-benchmarks-roadmap-parity.test.ts`
 *       ASSERTS both are present and numeric ("initConfig() parity").
 *
 *       MEASURED: across the whole of `src/`, the token `concurrency`
 *       occurs ZERO times outside `src/types/index.ts` (the declaration)
 *       and `src/index.ts` (the writer).  `runs` likewise.  So the field is
 *       DECLARED, WRITTEN, SHIPPED, DOCUMENTED-BY-TEST -- and READ BY
 *       NOTHING.
 *
 *   F2  THE DEAD FIELD CHANGES NOTHING, AND THE TEST SUITE PROVES IT
 *       CHANGES NOTHING -- WHICH IS WHY IT IS STILL THERE.
 *
 *       The parity test above asserts the field EXISTS and is a number.  It
 *       never asserts that setting it to a different value changes the run.
 *       MEASURED: an evaluation with `concurrency: 99` and one with
 *       `concurrency: 1` produce byte-identical published output, and the
 *       number of concurrent in-flight model calls is the same in both --
 *       because `Evaluator.run()` runs every model with `Promise.all` over
 *       `this.config.models`, i.e. ALL models at once, unconditionally.
 *
 *       So the operator has a knob labelled "concurrency" whose value is
 *       provably not the concurrency, and a knob labelled "runs" (run the
 *       benchmark N times) that provably runs it once.
 *
 *   F3  `ModelConfig.params` -- "可选: 额外参数" (optional extra parameters) --
 *       IS ALSO NEVER READ.  It is the natural place to put per-model
 *       `temperature` / `max_tokens` / `top_p`, and the adapters hard-code
 *       `temperature: 0.7` and `max_tokens: 4096` in
 *       `buildOpenAIChatBody` instead.  MEASURED: an operator's
 *       `params: { temperature: 0 }` does not reach the outbound request
 *       body, while the same key under `params` on the ModelConfig is
 *       accepted, carried through the config, and dropped.
 *
 *   F4  `BenchmarkConfig.companion_tools` (the GuideLLM SLO-sweep
 *       segment) IS DECLARED, SHIPPED IN config.example.json, ASSERTED BY A
 *       TEST -- AND NEVER READ.  It is a whole segment of the operator's
 *       config file with zero readers.
 *
 *   F5  THE FAILURE MODE IS SILENT, AND THE LOUD MODE GIVES FALSE
 *       CONFIDENCE (R512's shape, in a new repo).
 *
 *       A wrong TYPE at top level is LOUD: `loadConfig` is `JSON.parse` and
 *       the shape is not validated, but a value the code does consume
 *       (`benchmarks.dialogue: false`) at least changes behaviour.  A field
 *       the code does NOT consume is SILENT: setting `concurrency: 99` is
 *       accepted, stored, published in the example config, asserted by a
 *       test -- and does nothing.  The operator cannot tell the difference
 *       between "the tool ignored my setting" and "the tool honoured it".
 *
 *   F6  THE DEAD FIELDS ARE NOT ACCIDENTALLY DEAD -- THEY ARE IN THE
 *       SHIPPED ARTIFACT AND PINNED BY A PASSING TEST.
 *
 *       `config.example.json` is in `package.json`'s `files` array, so it
 *       ships to npm.  The parity test asserts `typeof cfg.concurrency ===
 *       'number'` and `typeof cfg.runs === 'number'`.  So the field is not
 *       merely declared in a type -- it is a CONTRACT the repository
 *       currently enforces and a package that currently publishes.
 *
 * CONTROLS (arms E/F pin things that MUST hold, so the defect arms are not
 * vacuous):
 *
 *   E   the fields DO exist in the type, in `initConfig()`'s output, in
 *       `config.example.json`, and in the shipped `package.json` `files`
 *       list -- i.e. the field is genuinely PUBLISHED, not a private
 *       leftover.  A suite that only showed "nothing reads it" would also
 *       be satisfied by a field nobody ever saw.
 *   F   the fields that ARE consumed DO change behaviour -- e.g.
 *       `benchmarks.function_calling: false` vs `true` changes the number
 *       of questions asked.  This is the positive control that proves the
 *       instrument can see a config field take effect.
 *
 * ROUND NUMBER: R551.  The namespace is global and monotonic across BOTH
 * repositories (R548 lb -> R549 wc -> R550 wc -> R551 lb).
 *
 * POLARITY: this is a defect-PRESENCE gate.  Every arm is GREEN on the
 * defective tree; a REPAIR flips the corresponding arm RED.  That is the
 * kill signal the mutation matrix reads.  (This repo's CI runs the whole
 * jest suite, so a suite that is RED on the defective tree would turn the
 * release gate RED -- a CI gate and a defect detector are different
 * instruments.)
 */

import * as fs from 'fs';
import * as path from 'path';
import { Evaluator } from '../src/core/evaluator';
import { createAdapter } from '../src/adapters/create-adapter';
import { Reporter } from '../src/core/reporter';
import { BenchmarkConfig, ModelConfig } from '../src/types';

const SRC = path.join(__dirname, '..', 'src');
const REPO = path.join(__dirname, '..');

/** Strip comments so a census of "live code" is not confused by prose. */
function stripComments(raw: string): string {
  return raw
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')
    .replace(/^\s*\*.*$/gm, ' ');
}

/** Every production source file under src/, as repo-relative paths. */
let _srcFilesCache: string[] | null = null;
function allSrcFiles(): string[] {
  if (_srcFilesCache) return _srcFilesCache;
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
        out.push(path.relative(REPO, full).split(path.sep).join('/'));
      }
    }
  };
  walk(SRC);
  _srcFilesCache = out;
  return out;
}

/** Cache of comment-stripped source, so the census arms stay fast. */
const _liveCache = new Map<string, string>();
function liveSource(rel: string): string {
  const hit = _liveCache.get(rel);
  if (hit !== undefined) return hit;
  const raw = fs.readFileSync(path.join(REPO, rel), 'utf-8');
  const stripped = stripComments(raw);
  _liveCache.set(rel, stripped);
  return stripped;
}

/** The declaration site of a config field is not a READER of it. */
function readersOf(token: string): string[] {
  const files = allSrcFiles();
  const declFile = 'src/types/index.ts';
  const writers = new Set(['src/index.ts']);
  const hits: string[] = [];
  for (const rel of files) {
    if (rel === declFile) continue;
    if (writers.has(rel)) continue;
    if (new RegExp(`\\b${token}\\b`).test(liveSource(rel))) hits.push(rel);
  }
  return hits;
}

/** Count in-flight adapter.chat calls at the peak. */
class PeakCounter {
  peak = 0;
  private current = 0;
  enter() {
    this.current += 1;
    this.peak = Math.max(this.peak, this.current);
  }
  leave() {
    this.current -= 1;
  }
}

function baseConfig(overrides: Partial<BenchmarkConfig> = {}): BenchmarkConfig {
  const model: ModelConfig = {
    name: 'probe-model',
    type: 'openai',
    endpoint: 'https://example.invalid/v1',
    apiKey: 'probe-key',
    model: 'probe-model-v1',
  };
  return {
    models: [model],
    benchmarks: {
      dialogue: true,
      coding: false,
      function_calling: false,
      long_context: false,
      multi_turn: false,
    },
    ...overrides,
  } as BenchmarkConfig;
}

/** A stub adapter that answers with a fixed score; records peak concurrency. */
function stubAdapter(answer: string, counter?: PeakCounter): any {
  return {
    async chat(_messages: unknown, _config: ModelConfig): Promise<string> {
      counter?.enter();
      try {
        await new Promise((r) => setTimeout(r, 5));
        return answer;
      } finally {
        counter?.leave();
      }
    },
    async ping(): Promise<boolean> {
      return true;
    },
    getName(): string {
      return 'probe-stub';
    },
  };
}

/**
 * Run the real Evaluator over the real dialogue benchmark with a stub judge.
 *
 * The arms that compare two configs only need the AGGREGATES to be equal --
 * and the aggregates are equal after the same questions.  The production
 * `Scorer` and the production `Evaluator` are always the ones doing the work.
 *
 * NOTE on runtime: this machine runs the whole cron fleet, and a load
 * average in the dozens makes even a file census take tens of seconds
 * (measured: 7.6 s for arm A, 24 s for arm D2).  jest's default 10 s
 * per-test timeout therefore fires on a LOAD FLAKE, not on a defect, so the
 * suite raises it explicitly (R528-4: the cost here is environmental, not
 * per-suite).
 */
async function runEvaluation(
  config: BenchmarkConfig,
  counter?: PeakCounter,
): Promise<{ total: number; dims: any; results: any[] }> {
  const evaluator = new Evaluator(config, stubAdapter('85', counter) as any);
  const results = await evaluator.run();
  const first: any = results[0];
  return {
    total: first.totalScore,
    dims: first.dimensions,
    results,
  };
}

describe('R551 -- the operator-config plane: a published setting with no reader', () => {
  // The machine runs the whole cron fleet; a file census can take tens of
  // seconds under load.  jest's default 10 s per-test timeout would turn
  // that into a load FLAKE, so it is raised explicitly here (R528-4).
  jest.setTimeout(120000);
  describe('the census (arm A/B/D)', () => {
    it('arm A: no live code under src/ reads `concurrency`', () => {
      expect(readersOf('concurrency')).toEqual([]);
    });

    it('arm A2: no live code under src/ reads `runs`', () => {
      // `runs` is a common English word; require it to appear as a property
      // access or an object key, not as prose.
      const files = allSrcFiles().filter(
        (rel) => rel !== 'src/types/index.ts' && rel !== 'src/index.ts',
      );
      const hits: string[] = [];
      for (const rel of files) {
        const live = liveSource(rel);
        if (
          /\bruns\b\s*[:=]/.test(live) ||
          /\.runs\b/.test(live) ||
          /\['runs'\]/.test(live) ||
          /"runs"/.test(live)
        ) {
          hits.push(rel);
        }
      }
      expect(hits).toEqual([]);
    });

    it('arm D: no live code under src/ reads `ModelConfig.params`', () => {
      const files = allSrcFiles().filter(
        (rel) => rel !== 'src/types/index.ts' && rel !== 'src/index.ts',
      );
      const hits: string[] = [];
      for (const rel of files) {
        // `req.params` is express's route params, not ModelConfig.params.
        const live = liveSource(rel).replace(/req\.params\b/g, 'req__params');
        if (/\.params\b/.test(live) || /\bparams\s*:/.test(live)) {
          hits.push(rel);
        }
      }
      expect(hits).toEqual([]);
    });

    it('arm D2: no live code under src/ reads `companion_tools`', () => {
      expect(readersOf('companion_tools')).toEqual([]);
    });
  });

  describe('the behaviour (arm B/C)', () => {
    it('arm B: `concurrency: 1` and `concurrency: 99` produce the SAME published output', async () => {
      const a = await runEvaluation(baseConfig({ concurrency: 1 }));
      const b = await runEvaluation(baseConfig({ concurrency: 99 }));
      expect(b.total).toBe(a.total);
      expect(JSON.stringify(b.dims)).toBe(JSON.stringify(a.dims));
    });

    it('arm B2: the number of models evaluated CONCURRENTLY does not follow `concurrency`', async () => {
      // The evaluator runs every model with `Promise.all` over
      // `this.config.models` -- so the real concurrency is "all of them",
      // whatever `concurrency` says.
      const models: ModelConfig[] = ['m1', 'm2', 'm3'].map((name) => ({
        name,
        type: 'openai',
        endpoint: 'https://example.invalid/v1',
        apiKey: 'k',
        model: name,
      }));
      const c1 = new PeakCounter();
      await runEvaluation(baseConfig({ models, concurrency: 1 }), c1);
      const c99 = new PeakCounter();
      await runEvaluation(baseConfig({ models, concurrency: 99 }), c99);
      // The declared knob says 1 in one run and 99 in the other, but the
      // observed peak in-flight count is the same (all models at once).
      expect(c1.peak).toBe(3);
      expect(c99.peak).toBe(3);
      expect(c99.peak).toBe(c1.peak);
    });

    it('arm C: `runs: 5` does not run the evaluation five times', async () => {
      // Each dialogue question costs TWO adapter calls: one to the subject
      // model, one to the LLM judge.  So one pass over 13 dialogue questions
      // is 26 calls.  `runs: 5` must not multiply that.
      const countCallsFor = async (runs: number): Promise<number> => {
        let calls = 0;
        const counting: any = {
          async chat(): Promise<string> {
            calls += 1;
            return '85';
          },
          async ping(): Promise<boolean> {
            return true;
          },
          getName(): string {
            return 'probe-stub';
          },
        };
        const config = baseConfig({ runs });
        const evaluator = new Evaluator(config, counting as any);
        const results = await evaluator.run();
        expect(results[0].scores.length).toBe(13);
        return calls;
      };
      const once = await countCallsFor(1);
      const five = await countCallsFor(5);
      // 13 questions x (1 subject call + 1 judge call).
      expect(once).toBe(26);
      // `runs: 5` costs exactly what `runs: 1` costs.
      expect(five).toBe(once);
    });

    it('arm C2: `params` on the ModelConfig does not reach the outbound request body', async () => {
      // Drive the REAL adapter (not the helper) with a stubbed global fetch,
      // so the assertion is about the bytes the provider would receive.
      const originalFetch = global.fetch;
      let capturedBody: any = null;
      global.fetch = jest.fn().mockImplementation(async (_url: any, init: any) => {
        capturedBody = JSON.parse(init.body);
        return {
          ok: true,
          json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
        };
      }) as any;
      try {
        const adapter = createAdapter('openai');
        await adapter.chat([{ role: 'user', content: 'hi' }], {
          name: 'probe-model',
          type: 'openai',
          endpoint: 'https://example.invalid/v1',
          apiKey: 'probe-key',
          model: 'probe-model-v1',
          // The operator's per-model overrides.
          params: { temperature: 0, max_tokens: 128 },
        });
        // The operator's `params` are accepted, carried through the config,
        // and DROPPED: the body is the hard-coded default.
        expect(capturedBody).toEqual({
          model: 'probe-model-v1',
          messages: [{ role: 'user', content: 'hi' }],
          temperature: 0.7,
          max_tokens: 4096,
        });
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  describe('the publication (arm E)', () => {
    it('arm E: `concurrency` and `runs` are in the type, in initConfig(), in config.example.json, and in the shipped files list', () => {
      const types = fs.readFileSync(path.join(SRC, 'types', 'index.ts'), 'utf-8');
      expect(types).toMatch(/concurrency\?\s*:\s*number/);
      expect(types).toMatch(/runs\?\s*:\s*number/);

      const idx = fs.readFileSync(path.join(SRC, 'index.ts'), 'utf-8');
      expect(idx).toMatch(/concurrency:\s*3/);
      expect(idx).toMatch(/runs:\s*1/);

      const example = JSON.parse(
        fs.readFileSync(path.join(REPO, 'config.example.json'), 'utf-8'),
      );
      expect(typeof example.concurrency).toBe('number');
      expect(typeof example.runs).toBe('number');

      const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf-8'));
      expect(pkg.files).toContain('config.example.json');
    });

    it('arm E2: the shipped example config is asserted by a PASSING test, which is why the field survives', () => {
      const parity = fs.readFileSync(
        path.join(REPO, 'tests', 'config-example-external-benchmarks-roadmap-parity.test.ts'),
        'utf-8',
      );
      // The parity test pins the PRESENCE and TYPE of the dead fields...
      expect(parity).toMatch(/typeof cfg\.concurrency\)\.toBe\('number'\)/);
      expect(parity).toMatch(/typeof cfg\.runs\)\.toBe\('number'\)/);
      // ...and never pins that they CHANGE anything: every ASSERTION that
      // mentions `concurrency` or `runs` in the parity suite is about its
      // PRESENCE or its TYPE.
      const assertions = parity
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.startsWith('expect('))
        .filter((l) => /concurrency|\bruns\b/.test(l));
      expect(assertions.length).toBeGreaterThan(0);
      for (const line of assertions) {
        expect(line).toMatch(/toBe\('number'\)|toBeDefined\(\)/);
      }
    });

    it('arm E3: `companion_tools` is declared, shipped in the example config and asserted -- and has no reader', () => {
      const types = fs.readFileSync(path.join(SRC, 'types', 'index.ts'), 'utf-8');
      expect(types).toMatch(/companion_tools\?/);
      const example = JSON.parse(
        fs.readFileSync(path.join(REPO, 'config.example.json'), 'utf-8'),
      );
      expect(example.companion_tools).toBeDefined();
      expect(example.companion_tools?.guidellm).toBeDefined();
      expect(readersOf('companion_tools')).toEqual([]);
    });
  });

  describe('the controls (arms F/G)', () => {
    it('arm F: a config field that IS consumed DOES change the run (positive control)', async () => {
      const off = await runEvaluation(
        baseConfig({
          benchmarks: {
            dialogue: true,
            coding: false,
            function_calling: false,
            long_context: false,
            multi_turn: false,
          },
        }),
      );
      const on = await runEvaluation(
        baseConfig({
          benchmarks: {
            dialogue: true,
            coding: false,
            function_calling: true,
            long_context: false,
            multi_turn: false,
          },
        }),
      );
      const offN = off.results[0].scores.length;
      const onN = on.results[0].scores.length;
      // The consumed field moves the number of questions asked.
      expect(onN).toBe(offN + 5);
      expect(offN).toBe(13);
    });

    it('arm G: the published report for a dead-field run is byte-identical to the one without the field', async () => {
      const a = await runEvaluation(baseConfig());
      const b = await runEvaluation(baseConfig({ concurrency: 42, runs: 9 }));
      const mdA = Reporter.generateMarkdown(a.results);
      const mdB = Reporter.generateMarkdown(b.results);
      // Strip the only legitimately-varying parts: the timestamp line and
      // the duration column.
      const strip = (s: string) =>
        s
          .replace(/\*\*评测时间\*\*:.*/g, '')
          // the ranking table's duration column
          .replace(/\|\s*\d+\.\d+s\s*\|/g, '| DUR |')
          // the detail block's duration line
          .replace(/- \*\*评测耗时\*\*:.*/g, '- **评测耗时**: DUR');
      expect(strip(mdB)).toBe(strip(mdA));
    });
  });
});
