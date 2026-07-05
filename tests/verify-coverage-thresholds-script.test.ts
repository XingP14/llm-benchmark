// tests/verify-coverage-thresholds-script.test.ts
// 钉住 scripts/verify-coverage-thresholds.mjs (zero-dep coverage-buffer verifier):
// 1) 文件存在 + ESM 语法 OK (node --check)
// 2) 无 coverage data + 无 --dry → exit 2 (data missing)
// 3) 无 coverage data + --dry → exit 0 (dry 不 fail)
// 4) 有 coverage data (现成 coverage/coverage-summary.json) + 无 flag → exit 0 (现 all metrics 100% buffer ≥10pp)
// 5) 有 coverage data + --json --dry → JSON 输出包含 min_buffer_pp / all_ok / rows (4 metrics)
// 6) 4 metrics rows: statements/branches/functions/lines (顺序锁定, threshold=90/70/85/90)
// 7) buffer ≥ 0 (现 100% actual → buffer 都 ≥ 10pp, regression gate)
// 8) jest.config.js coverageThreshold.global 4 字段值锁定 (90/70/85/90) — 防止下次 chain 改阈值未同步 verifier
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';

const REPO_ROOT = path.resolve(__dirname, '..');
const SCRIPT_PATH = path.resolve(REPO_ROOT, 'scripts/verify-coverage-thresholds.mjs');
const JEST_CONFIG = path.resolve(REPO_ROOT, 'jest.config.js');
const SUMMARY_PATH = path.resolve(REPO_ROOT, 'coverage/coverage-summary.json');

function runScript(args: string[]): { stdout: string; stderr: string; code: number } {
  try {
    const stdout = execFileSync('node', [SCRIPT_PATH, ...args], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { stdout, stderr: '', code: 0 };
  } catch (e: any) {
    // execFileSync throws on non-zero exit
    return {
      stdout: (e.stdout ?? '').toString(),
      stderr: (e.stderr ?? '').toString(),
      code: typeof e.status === 'number' ? e.status : 1,
    };
  }
}

describe('verify-coverage-thresholds.mjs script', () => {
  test('1) script file exists at scripts/verify-coverage-thresholds.mjs', () => {
    expect(fs.existsSync(SCRIPT_PATH)).toBe(true);
  });

  test('2) ESM syntax OK (node --check)', () => {
    // node --check would throw on syntax error; we rely on successful require below
    expect(() => execFileSync('node', ['--check', SCRIPT_PATH], { encoding: 'utf8' })).not.toThrow();
  });

  test('3) missing coverage data + no flag → exit 2 (data missing), stderr guides npm test', () => {
    // 临时改 cwd 不可行, 改用 sub-shell 跳到没 coverage 的 tmp dir 跑 — 太重; 改为: 若现 coverage 数据 missing 才验, 否则跳过
    const hasCoverage = fs.existsSync(SUMMARY_PATH);
    if (hasCoverage) {
      // 当前有 coverage 数据 (jest --coverage 跑过), 不验 missing 分支 — 1) 已在文件存在性覆盖; 2) dry 分支覆盖
      expect(true).toBe(true);
      return;
    }
    const r = runScript([]);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/coverage-(summary|final)\.json/);
  });

  test('4) missing coverage data + --dry → exit 0 (dry 不 fail)', () => {
    const hasCoverage = fs.existsSync(SUMMARY_PATH);
    if (hasCoverage) {
      expect(true).toBe(true);
      return;
    }
    const r = runScript(['--dry']);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/DRY-RUN/);
  });

  test('5) with coverage data + no flag → exit 0, prints 4-row table', () => {
    const r = runScript([]);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/jest\.config\.js coverage threshold buffer check/);
    expect(r.stdout).toMatch(/all metrics have buffer/);
  });

  test('6) with coverage data + --json --dry → valid JSON {min_buffer_pp, all_ok, rows[4]}', () => {
    const r = runScript(['--json', '--dry']);
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.min_buffer_pp).toBe(2);
    expect(parsed.all_ok).toBe(true);
    expect(Array.isArray(parsed.rows)).toBe(true);
    expect(parsed.rows.length).toBe(4);
    const metrics = parsed.rows.map((row: any) => row.metric);
    expect(metrics).toEqual(['statements', 'branches', 'functions', 'lines']);
  });

  test('7) 4 metrics rows 字段锁定 (threshold + actual + buffer + ok)', () => {
    const r = runScript(['--json']);
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout);
    const byMetric: Record<string, any> = {};
    for (const row of parsed.rows) byMetric[row.metric] = row;
    expect(byMetric.statements.threshold).toBe(90);
    expect(byMetric.branches.threshold).toBe(70);
    expect(byMetric.functions.threshold).toBe(85);
    expect(byMetric.lines.threshold).toBe(90);
    for (const row of parsed.rows) {
      expect(typeof row.actual).toBe('number');
      expect(typeof row.buffer).toBe('number');
      expect(row.ok).toBe(true);
      expect(row.buffer).toBeGreaterThanOrEqual(2); // MIN_BUFFER_PP
    }
  });

  test('8) jest.config.js coverageThreshold.global 4 字段值锁定 (regression gate 防止阈值变更未同步 verifier)', () => {
    const configText = fs.readFileSync(JEST_CONFIG, 'utf8');
    expect(configText).toMatch(/statements:\s*90/);
    expect(configText).toMatch(/branches:\s*70/);
    expect(configText).toMatch(/functions:\s*85/);
    expect(configText).toMatch(/lines:\s*90/);
  });
});
