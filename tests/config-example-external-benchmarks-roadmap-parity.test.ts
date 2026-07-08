// tests/config-example-external-benchmarks-roadmap-parity.test.ts
//
// 07-09 cron tick: config.example.json _external_benchmarks_roadmap parity
// — pre-fix content drifted from src/types/index.ts ExternalBenchmarkRoadmap:
//   (a) `_comment` claimed "src/types/index.ts BenchmarkConfig 未声明" — false since 2150d07
//   (b) `webdev_arena` slot used stale `endpoint` / `category` / `scoring` keys (dropped by 0ffb136 8/8 type wire)
//   (c) only 1 of 8 dispatch keys shown — terminal_bench / aa_omniscience / benchlm_agentic /
//       cyberseceval3 / swe_bench_pro / long_context_cluster / process_aware_scoring missing
//   (d) no companion_tools 段 (declared in BenchmarkConfig per 0ffb136 era)
//   (e) concurrency/runs missing — pre-fix had only models/benchmarks/output top-level
//
// closure parallels stale-bak-cleanup (999a62a) config drift detection pattern — type-layer
// parity gate (config.example.json keys ⊆ ExternalBenchmarkRoadmap allowed keys + presence
// of all 8 dispatch keys + comment no longer claims type-undeclared)

import * as fs from 'fs';
import * as path from 'path';

const CONFIG_PATH = path.join(__dirname, '..', 'config.example.json');

interface DispatchSlotShape {
  enabled: boolean;
  type?: string;
  api_base?: string;
  model_id?: string;
  timeout_ms?: number;
  anchor_score?: number;
  subset?: string;
  agentic_mode?: boolean;
  native_evals?: boolean;
  risk_categories?: string[];
  tasks_total?: number;
  mode?: string;
  agentic_benchmark?: string;
  pass_fail_weight?: number;
  process_weight?: number;
}

interface ConfigExample {
  models: unknown[];
  benchmarks: Record<string, boolean>;
  _external_benchmarks_roadmap?: Record<string, DispatchSlotShape | string> & {
    _comment?: string;
  };
  companion_tools?: {
    _comment?: string;
    guidellm?: { installed?: boolean; sweep_config?: string };
  };
  output?: string;
  concurrency?: number;
  runs?: number;
}

const EIGHT_DISPATCH_KEYS = [
  'webdev_arena',
  'terminal_bench',
  'aa_omniscience',
  'benchlm_agentic',
  'cyberseceval3',
  'swe_bench_pro',
  'long_context_cluster',
  'process_aware_scoring',
] as const;

// Per ExternalDispatchType union alias (bb49dd0): 6 valid type literals.
const VALID_DISPATCH_TYPES = new Set([
  'agentic_coding',
  'agentic_fullstack',
  'agentic_swe',
  'process_agentic',
  'long_context_retrieval',
  'safety_evaluation',
]);

// Allowed keys per dispatch slot (subset of declared in src/types/index.ts ExternalBenchmarkRoadmap,
// as listed across the 8 fetcher interfaces).
const ALLOWED_SLOT_KEYS = new Set([
  '_comment',
  'enabled',
  'type',
  'api_base',
  'model_id',
  'timeout_ms',
  'anchor_score',
  'subset',
  'agentic_mode',
  'native_evals',
  'risk_categories',
  'tasks_total',
  'mode',
  'agentic_benchmark',
  'pass_fail_weight',
  'process_weight',
]);

describe('config.example.json ↔ ExternalBenchmarkRoadmap parity (07-09 cron)', () => {
  let cfg: ConfigExample;
  let raw: string;

  beforeAll(() => {
    raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    cfg = JSON.parse(raw) as ConfigExample;
  });

  it('config.example.json parses as valid JSON', () => {
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it('exposes _external_benchmarks_roadmap segment (post-2150d07 type declared)', () => {
    expect(cfg._external_benchmarks_roadmap).toBeDefined();
    expect(typeof cfg._external_benchmarks_roadmap).toBe('object');
  });

  it('_comment no longer claims type-undeclared (regression gate for stale drift)', () => {
    const comment = cfg._external_benchmarks_roadmap?._comment ?? '';
    expect(comment).not.toMatch(/未声明/);
    expect(comment).not.toMatch(/未消费/);
    expect(comment.length).toBeGreaterThan(20);
  });

  it('declares all 8 dispatch keys (closure of hint 修 v0.5.0 type 段 5 处 stub 真实化 — 8/8 parity)', () => {
    const roadmap = cfg._external_benchmarks_roadmap ?? {};
    for (const key of EIGHT_DISPATCH_KEYS) {
      expect(roadmap[key]).toBeDefined();
      expect(typeof roadmap[key]).toBe('object');
    }
    const presentKeys = Object.keys(roadmap).filter((k) => k !== '_comment');
    expect(presentKeys.sort()).toEqual([...EIGHT_DISPATCH_KEYS].sort());
  });

  it('every dispatch slot uses only ExternalBenchmarkRoadmap-declared keys (no stale endpoint/category/scoring)', () => {
    const roadmap = cfg._external_benchmarks_roadmap ?? {};
    for (const slotKey of Object.keys(roadmap)) {
      if (slotKey === '_comment') continue;
      const slot = roadmap[slotKey] as DispatchSlotShape;
      for (const fieldKey of Object.keys(slot)) {
        expect(ALLOWED_SLOT_KEYS.has(fieldKey)).toBe(true);
      }
      // no stale 0ffb136-era dropped fields
      const slotObj = slot as unknown as Record<string, unknown>;
      expect(slotObj.endpoint).toBeUndefined();
      expect(slotObj.category).toBeUndefined();
      expect(slotObj.scoring).toBeUndefined();
    }
  });

  it('every dispatch slot.type ∈ ExternalDispatchType union alias (6 literals)', () => {
    const roadmap = cfg._external_benchmarks_roadmap ?? {};
    for (const slotKey of EIGHT_DISPATCH_KEYS) {
      const slot = roadmap[slotKey] as DispatchSlotShape;
      expect(slot.type).toBeDefined();
      expect(VALID_DISPATCH_TYPES.has(slot.type as string)).toBe(true);
    }
  });

  it('every dispatch slot.enabled=false by default (no accidental live dispatch from example)', () => {
    const roadmap = cfg._external_benchmarks_roadmap ?? {};
    for (const slotKey of EIGHT_DISPATCH_KEYS) {
      const slot = roadmap[slotKey] as DispatchSlotShape;
      expect(slot.enabled).toBe(false);
    }
  });

  it('subset-bearing slots use a declared subset literal', () => {
    const roadmap = cfg._external_benchmarks_roadmap ?? {};
    // terminal_bench: full/hard/lite (06-20 02:43 cron)
    expect(['full', 'hard', 'lite']).toContain(
      (roadmap.terminal_bench as DispatchSlotShape).subset,
    );
    // swe_bench_pro: verified/lite/multilingual (06-20 05:03 cron)
    expect(['verified', 'lite', 'multilingual']).toContain(
      (roadmap.swe_bench_pro as DispatchSlotShape).subset,
    );
    // benchlm_agentic: all/design2code_only/vision2web_only/native_evals_only
    expect(['all', 'design2code_only', 'vision2web_only', 'native_evals_only']).toContain(
      (roadmap.benchlm_agentic as DispatchSlotShape).subset,
    );
    // long_context_cluster: longbench_v2/babilong/infinitebench/phonebook/all
    expect(['longbench_v2', 'babilong', 'infinitebench', 'phonebook', 'all']).toContain(
      (roadmap.long_context_cluster as DispatchSlotShape).subset,
    );
    // process_aware_scoring: all_process_signals/commit_metrics/runtime_metrics/single
    expect(['all_process_signals', 'commit_metrics', 'runtime_metrics', 'single']).toContain(
      (roadmap.process_aware_scoring as DispatchSlotShape).subset,
    );
  });

  it('declares companion_tools.guidellm segment (0ffb136 era BenchmarkConfig companion_tools?)', () => {
    expect(cfg.companion_tools).toBeDefined();
    expect(cfg.companion_tools?.guidellm).toBeDefined();
    expect(typeof cfg.companion_tools?.guidellm?.installed).toBe('boolean');
  });

  it('top-level keeps concurrency + runs + output + models + benchmarks (initConfig() parity)', () => {
    expect(Array.isArray(cfg.models)).toBe(true);
    expect(cfg.models.length).toBeGreaterThan(0);
    expect(cfg.benchmarks.dialogue).toBe(true);
    expect(cfg.benchmarks.coding).toBe(true);
    expect(cfg.output).toBeDefined();
    expect(typeof cfg.concurrency).toBe('number');
    expect(typeof cfg.runs).toBe('number');
  });

  it('regression guard: 8 dispatch keys + companion_tools present (parallels stale-bak-cleanup 8-test gate)', () => {
    const roadmap = cfg._external_benchmarks_roadmap ?? {};
    const dispatchCount = EIGHT_DISPATCH_KEYS.filter((k) => roadmap[k] !== undefined).length;
    expect(dispatchCount).toBe(8);
    expect(cfg.companion_tools?.guidellm).toBeDefined();
  });
});
