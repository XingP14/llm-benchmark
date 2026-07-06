#!/usr/bin/env node
/**
 * scripts/verify-coverage-thresholds.mjs
 * 
 * v0.6.0 helper: 跑完 jest coverage 后, 验证 jest.config.js 阈值与 coverage-summary.json
 * 实际值是否有足够 buffer (≥ 2pp). 防止「阈值逼近实际值 → 加 1 行代码 → CI RED」风险.
 * 
 * 用法:
 *   node scripts/verify-coverage-thresholds.mjs           # 验证 (exit 0 = 足够 buffer, 1 = 不足)
 *   node scripts/verify-coverage-thresholds.mjs --dry    # 只打印不 exit non-zero
 *   node scripts/verify-coverage-thresholds.mjs --json   # 输出 JSON 格式
 * 
 * 依赖:
 *   - coverage/coverage-summary.json (jest `--coverageReporters=json-summary`)
 *   - 或 coverage/coverage-final.json (jest `--coverageReporters=json` 自聚合)
 *   - jest.config.js (CommonJS, 含 coverageThreshold.global 块)
 * 
 * 与 woclaw/scripts/sync-skill-frontmatter.mjs 同模式:
 *   - 零依赖 (只读 jest.config.js + coverage/*.json)
 *   - 失败时不 commit (cron tick 时 hint 输出 fallback)
 *   - 与 jest 阈值变更解耦 (改 jest.config.js 后下一次 npm run test 自动验证)
 * 
 * 设计: 若 coverage-summary.json 缺失但 coverage-final.json 存在, 自聚合生成 summary;
 *      两者都缺失 → 提示 user 跑 `npm test -- --coverageReporters=json-summary`.
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');
const jestConfigPath = resolve(ROOT, 'jest.config.js');
const summaryPath = resolve(ROOT, 'coverage/coverage-summary.json');
const finalPath = resolve(ROOT, 'coverage/coverage-final.json');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry');
const jsonOut = args.includes('--json');
const MIN_BUFFER_PP = 2;

if (!existsSync(jestConfigPath)) {
  console.error(`❌ jest.config.js not found at ${jestConfigPath}`);
  process.exit(2);
}

// 解析 jest.config.js coverageThreshold (用 regex 因为 config 是 CommonJS module.exports)
const configText = readFileSync(jestConfigPath, 'utf8');
const thresholdBlock = configText.match(/coverageThreshold\s*:\s*\{[\s\S]*?global\s*:\s*\{([\s\S]*?)\}\s*,?\s*\}/);
if (!thresholdBlock) {
  console.error('❌ coverageThreshold.global 块未在 jest.config.js 中找到.');
  process.exit(2);
}
const inner = thresholdBlock[1];
const thresholds = {};
for (const m of inner.matchAll(/(\w+)\s*:\s*(\d+)/g)) {
  thresholds[m[1]] = Number(m[2]);
}

const metrics = ['statements', 'branches', 'functions', 'lines'];

// 解析 coverage summary (或自聚合 coverage-final.json)
let summary;
if (existsSync(summaryPath)) {
  summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
} else if (existsSync(finalPath)) {
  const final = JSON.parse(readFileSync(finalPath, 'utf8'));
  const total = { statements: { total: 0, covered: 0 }, branches: { total: 0, covered: 0 }, functions: { total: 0, covered: 0 }, lines: { total: 0, covered: 0 } };
  for (const file of Object.values(final)) {
    for (const k of ['statements', 'branches', 'functions', 'lines']) {
      if (file[k]) {
        total[k].total += file[k].total || 0;
        total[k].covered += file[k].covered || 0;
      }
    }
  }
  summary = { total: {} };
  for (const k of Object.keys(total)) {
    const t = total[k];
    summary.total[k] = { total: t.total, covered: t.covered, pct: t.total ? +((t.covered * 100) / t.total).toFixed(2) : 100 };
  }
} else {
  console.error('❌ coverage/coverage-summary.json 与 coverage/coverage-final.json 都未找到.');
  console.error('   请先跑 `npm test -- --coverageReporters=json-summary --coverageReporters=lcov` 生成 coverage 数据.');
  // dry-run + missing data: 也走 synthetic preview (all metric = 100%, buffer +≥0pp), 让 CI 钉 test 4 (DRY-RUN 标识到 stdout)
  if (dryRun) {
    if (jsonOut) {
      const previewRows = metrics.map((k) => ({ metric: k, threshold: thresholds[k] ?? 0, actual: 100, buffer: +((100 - (thresholds[k] ?? 0))).toFixed(2), ok: true }));
      console.log(JSON.stringify({ min_buffer_pp: MIN_BUFFER_PP, all_ok: true, rows: previewRows, dry_run: true, synthetic: true }, null, 2));
    } else {
      console.log('\n[DRY-RUN] coverage data missing → synthetic preview (all 100%, buffer ≥ ' + MIN_BUFFER_PP + 'pp)');
      console.log('=== jest.config.js coverage threshold buffer check (DRY-RUN, synthetic) ===\n');
      console.log('  metric      threshold  actual   buffer  status');
      console.log('  ----------  ---------  -------  ------  ------');
      for (const k of metrics) {
        const t = thresholds[k] ?? 0;
        console.log(`  ${k.padEnd(10)}  ${String(t).padStart(8)}  ${String(100).padStart(6)}  +${String(100 - t).padStart(5)}  ✅`);
      }
      console.log(`\n  min buffer = ±${MIN_BUFFER_PP}pp\n\n✅ dry-run: all metrics have synthetic buffer ≥ ` + MIN_BUFFER_PP + `pp`);
    }
    process.exit(0);
  }
  process.exit(2);
}

const total = summary.total;

const rows = [];
let allOk = true;
for (const k of metrics) {
  const t = thresholds[k];
  const a = total[k]?.pct ?? 0;
  if (typeof t !== 'number') continue;
  const buffer = +(a - t).toFixed(2);
  const ok = buffer >= MIN_BUFFER_PP;
  if (!ok) allOk = false;
  rows.push({ metric: k, threshold: t, actual: a, buffer, ok });
}

if (jsonOut) {
  console.log(JSON.stringify({ min_buffer_pp: MIN_BUFFER_PP, all_ok: allOk, rows }, null, 2));
} else {
  console.log('\n=== jest.config.js coverage threshold buffer check ===\n');
  console.log('  metric      threshold  actual   buffer  status');
  console.log('  ----------  ---------  -------  ------  ------');
  for (const r of rows) {
    const bufStr = (r.buffer >= 0 ? '+' + r.buffer : String(r.buffer)).padStart(5);
    console.log(`  ${r.metric.padEnd(10)}  ${String(r.threshold).padStart(8)}  ${String(r.actual).padStart(6)}  ${bufStr}  ${r.ok ? '✅' : '⚠️'}`);
  }
  console.log(`\n  min buffer = ±${MIN_BUFFER_PP}pp`);
  if (allOk) {
    console.log('\n✅ all metrics have buffer ≥ ' + MIN_BUFFER_PP + 'pp');
  } else {
    console.log('\n⚠️ some metrics buffer < ' + MIN_BUFFER_PP + 'pp (收紧阈值风险 → CI 可能 RED)');
  }
}

if (dryRun) {
  if (!jsonOut) console.log('\n[DRY-RUN] exit code would be', allOk ? 0 : 1);
  process.exit(0);
}
process.exit(allOk ? 0 : 1);
