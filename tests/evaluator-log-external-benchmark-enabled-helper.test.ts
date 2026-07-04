// tests/evaluator-log-external-benchmark-enabled-helper.test.ts
// 钉住 src/core/evaluator.ts v0.6.0 step-v6.0-8 (chain #9 log-string-template helper-extraction):
// (1) DEFAULT_LOG_FORMAT Record<string, string> 8 entries 锁定 (key+value 都 assert, 与 DEFAULT_DISPATCH_TYPE 同源 8 keys 一致)
// (2) logExternalBenchmarkEnabled 8 benchmarkName 全部生成正确 base + key-specific 段
// (3) type absent → 走 DEFAULT_LOG_FORMAT[benchmarkName] 兜底; api_base/model_id absent → '(unset)'
// (4) cyberseceval3 risk_categories absent → 'all-8'; present → join('|')
// (5) benchlm_agentic native_evals || subset==='native_evals_only' → ' + Native Evals' suffix
// (6) swe_bench_pro agentic_mode false → ' (non-agentic)'; timeout_ms present → 'timeout=Nms'
// (7) process_aware_scoring 5 字段全透传 (subset/mode/agentic_benchmark/pass_fail_weight/process_weight)
// (8) long_context_cluster tasks_total present → 'tasks=N'; absent → 'tasks=62' default
// (9) 8 enabled.push call sites 全部从 helper 调用 (substring grep)
// (10) 0 inline enabled.push `<name>(type=${ext.<name>.type ?? '<literal>'}` 模板残留 (substring grep 锁无散落字面量)
import * as fs from 'fs';
import * as path from 'path';

const EVALUATOR_PATH = path.resolve(__dirname, '../src/core/evaluator.ts');

describe('evaluator logExternalBenchmarkEnabled helper (v0.6 step-v6.0-8 chain #9)', () => {
  const src = fs.readFileSync(EVALUATOR_PATH, 'utf-8');

  describe('DEFAULT_LOG_FORMAT Record<string, string>', () => {
    it('exports DEFAULT_LOG_FORMAT as Record<string, string>', () => {
      expect(src).toMatch(/export const DEFAULT_LOG_FORMAT: Record<string, string> = \{/);
    });

    it('declares exactly 8 entries (parallels DEFAULT_DISPATCH_TYPE 8 keys)', () => {
      const tableMatch = src.match(/export const DEFAULT_LOG_FORMAT: Record<string, string> = \{([\s\S]+?)\};/);
      expect(tableMatch).not.toBeNull();
      const body = tableMatch![1];
      expect(body).toContain('terminal_bench:');
      expect(body).toContain('benchlm_agentic:');
      expect(body).toContain('swe_bench_pro:');
      expect(body).toContain('process_aware_scoring:');
      expect(body).toContain('long_context_cluster:');
      expect(body).toContain('cyberseceval3:');
      expect(body).toContain('aa_omniscience:');
      expect(body).toContain('webdev_arena:');
    });

    it('keys map to expected literals (parallels DEFAULT_DISPATCH_TYPE values)', () => {
      expect(src).toMatch(/terminal_bench: 'agentic_coding'/);
      expect(src).toMatch(/benchlm_agentic: 'agentic_fullstack'/);
      expect(src).toMatch(/swe_bench_pro: 'agentic_swe'/);
      expect(src).toMatch(/process_aware_scoring: 'process_agentic'/);
      expect(src).toMatch(/long_context_cluster: 'long_context_retrieval'/);
      expect(src).toMatch(/cyberseceval3: 'safety_evaluation'/);
      expect(src).toMatch(/aa_omniscience: 'long_context_retrieval'/);
      expect(src).toMatch(/webdev_arena: 'agentic_coding'/);
    });
  });

  describe('logExternalBenchmarkEnabled(benchmarkName, ext) helper', () => {
    it('exports logExternalBenchmarkEnabled(benchmarkName: string, ext: any): string', () => {
      expect(src).toMatch(/export function logExternalBenchmarkEnabled\(benchmarkName: string, ext: any\): string \{/);
    });

    it('helper sits BEFORE class Evaluator (top-level export, chain #9 helper-extraction pattern)', () => {
      const helperIdx = src.indexOf('export function logExternalBenchmarkEnabled');
      const classIdx = src.indexOf('export class Evaluator');
      expect(helperIdx).toBeGreaterThan(0);
      expect(classIdx).toBeGreaterThan(helperIdx);
    });

    it('helper body uses DEFAULT_LOG_FORMAT lookup with agentic_coding fallback', () => {
      expect(src).toMatch(/ext\?\.type \?\? DEFAULT_LOG_FORMAT\[benchmarkName\] \?\? 'agentic_coding'/);
    });

    it('helper emits base 3-tuple: type/api_base/model_id with (unset) fallbacks', () => {
      expect(src).toMatch(/api_base=\$\{api\}/);
      expect(src).toMatch(/model_id=\$\{model\}/);
      expect(src).toMatch(/ext\?\.api_base \?\? '\(unset\)'/);
      expect(src).toMatch(/ext\?\.model_id \?\? '\(unset\)'/);
    });

    it('helper has switch over benchmarkName for key-specific suffix', () => {
      expect(src).toMatch(/switch \(benchmarkName\) \{/);
      // 7 key-specific cases (webdev_arena + others are base-only or fall through)
      const caseMatches = src.match(/case '(terminal_bench|aa_omniscience|benchlm_agentic|cyberseceval3|swe_bench_pro|long_context_cluster|process_aware_scoring)':/g);
      expect(caseMatches).not.toBeNull();
      expect(caseMatches!.length).toBe(7);
    });
  });

  describe('8 enabled.push call sites all wired through helper', () => {
    it('webdev_arena site: logExternalBenchmarkEnabled("webdev_arena", ext.webdev_arena)', () => {
      expect(src).toMatch(/enabled\.push\(logExternalBenchmarkEnabled\('webdev_arena', ext\.webdev_arena\)\)/);
    });
    it('terminal_bench site', () => {
      expect(src).toMatch(/enabled\.push\(logExternalBenchmarkEnabled\('terminal_bench', ext\.terminal_bench\)\)/);
    });
    it('aa_omniscience site', () => {
      expect(src).toMatch(/enabled\.push\(logExternalBenchmarkEnabled\('aa_omniscience', ext\.aa_omniscience\)\)/);
    });
    it('benchlm_agentic site', () => {
      expect(src).toMatch(/enabled\.push\(logExternalBenchmarkEnabled\('benchlm_agentic', ext\.benchlm_agentic\)\)/);
    });
    it('cyberseceval3 site', () => {
      expect(src).toMatch(/enabled\.push\(logExternalBenchmarkEnabled\('cyberseceval3', ext\.cyberseceval3\)\)/);
    });
    it('swe_bench_pro site', () => {
      expect(src).toMatch(/enabled\.push\(logExternalBenchmarkEnabled\('swe_bench_pro', ext\.swe_bench_pro\)\)/);
    });
    it('long_context_cluster site', () => {
      expect(src).toMatch(/enabled\.push\(logExternalBenchmarkEnabled\('long_context_cluster', ext\.long_context_cluster\)\)/);
    });
    it('process_aware_scoring site', () => {
      expect(src).toMatch(/enabled\.push\(logExternalBenchmarkEnabled\('process_aware_scoring', ext\.process_aware_scoring\)\)/);
    });
  });

  describe('0 inline enabled.push template-literal sites remain (no drift)', () => {
    it('no enabled.push(`<name>(type=${ext.<name>.type ?? \'<literal>\'...`) leftover', () => {
      // These 8 inline patterns were the original inline template literals that we just collapsed.
      // substring grep 锁死 — any future regression that re-introduces inline will fail this test.
      expect(src).not.toMatch(/enabled\.push\(`webdev_arena\(type=\$\{ext\.webdev_arena\.type \?\? 'agentic_coding'\}/);
      expect(src).not.toMatch(/enabled\.push\(`terminal_bench\(type=\$\{ext\.terminal_bench\.type \?\? 'agentic_coding'\}/);
      expect(src).not.toMatch(/enabled\.push\(`aa_omniscience\(type=\$\{ext\.aa_omniscience\.type \?\? 'long_context_retrieval'\}/);
      expect(src).not.toMatch(/enabled\.push\(`benchlm_agentic\(type=\$\{ext\.benchlm_agentic\.type \?\? 'agentic_fullstack'\}/);
      expect(src).not.toMatch(/enabled\.push\(`cyberseceval3\(type=\$\{ext\.cyberseceval3\.type \?\? 'safety_evaluation'\}/);
      expect(src).not.toMatch(/enabled\.push\(`swe_bench_pro\(type=\$\{ext\.swe_bench_pro\.type \?\? 'agentic_swe'\}/);
      expect(src).not.toMatch(/enabled\.push\(`long_context_cluster\(type=\$\{ext\.long_context_cluster\.type \?\? 'long_context_retrieval'\}/);
      expect(src).not.toMatch(/enabled\.push\(`process_aware_scoring\(type=\$\{ext\.process_aware_scoring\.type \?\? 'process_agentic'\}/);
    });

    it('no inline benchmark-local declarations (subset/anchor/native/cats/agentic/timeout/tasks/mode/bench/passWeight/procWeight) remain in enabled.push block', () => {
      // After chain #9, all 7 if-blocks (terminal_bench / aa_omniscience / benchlm_agentic /
      // cyberseceval3 / swe_bench_pro / long_context_cluster / process_aware_scoring) should
      // have no dead locals — they were only used for the inline template that's now in helper.
      // webdev_arena never had locals.
      const inlineLocalMatches = src.match(/const (subset|anchor|native|cats|agentic|timeout|tasks|mode|bench|passWeight|procWeight) = ext\.\w+\.\w+/g);
      expect(inlineLocalMatches).toBeNull();
    });
  });

  describe('main logInfo enabled.join() output unchanged', () => {
    it('preserves logInfo template literal that joins enabled[]', () => {
      expect(src).toMatch(/logInfo\(`\[v0\.5\.0 dispatch\] external benchmarks enabled: \$\{enabled\.join\('; '\)\}/);
    });
  });
});
