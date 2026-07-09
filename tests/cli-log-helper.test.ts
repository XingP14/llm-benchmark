// chain #17 closure: src/index.ts inline console.log / console.error / console.info
// -> cliLog / cliError per-prefix helpers in src/cli/cli_log.ts.
// parallels tests/web/server-log-helper.test.ts (chain #15) + tests/web/auth-admin-log-helper.test.ts (chain #16).

import * as fs from 'fs';
import * as path from 'path';

const INDEX_TS = path.join(__dirname, '..', 'src', 'index.ts');
const CLI_LOG_TS = path.join(__dirname, '..', 'src', 'cli', 'cli_log.ts');

function readIndexSrc(): string {
  return fs.readFileSync(INDEX_TS, 'utf8');
}

function readCliLogSrc(): string {
  return fs.readFileSync(CLI_LOG_TS, 'utf8');
}

function countInlineConsole(src: string, method: 'log' | 'error' | 'info' | 'warn'): number {
  // Count top-level call sites that begin a line with `console.<method>(`
  // after stripping leading whitespace. Excludes:
  //   - `cliLog(...)` / `cliError(...)` lines (those are call sites for helpers)
  //   - helper module bodies (we only inspect src/index.ts here, not cli_log.ts)
  //   - line-comment lines starting with `//` or block-comment lines starting with `*`
  const lines = src.split('\n');
  let n = 0;
  for (const raw of lines) {
    const trimmed = raw.trim();
    if (trimmed.startsWith('*') || trimmed.startsWith('//')) continue;
    if (trimmed.startsWith(`console.${method}(`)) n++;
  }
  return n;
}

describe('src/index.ts cliLog / cliError per-prefix helpers (chain #17 closure)', () => {
  it('imports cliLog + cliError from ./cli/cli_log', () => {
    const src = readIndexSrc();
    expect(src).toMatch(/import\s*\{\s*cliLog\s*,\s*cliError\s*\}\s*from\s*['"]\.\/cli\/cli_log['"]/);
  });

  it('has 0 inline console.log( call sites (excl. helper body + comments)', () => {
    const src = readIndexSrc();
    expect(countInlineConsole(src, 'log')).toBe(0);
  });

  it('has 0 inline console.error( call sites (excl. helper body + comments)', () => {
    const src = readIndexSrc();
    expect(countInlineConsole(src, 'error')).toBe(0);
  });

  it('has 0 inline console.info( call sites (excl. helper body + comments)', () => {
    const src = readIndexSrc();
    expect(countInlineConsole(src, 'info')).toBe(0);
  });

  it('routes CLI banner call sites through cliLog (>=24 sites)', () => {
    const src = readIndexSrc();
    const cliLogCount = (src.match(/^(\s*)cliLog\(/gm) || []).length;
    // --version (1) + run start (1) + run complete (1) + runBenchmark roadmap-info (1)
    // + initConfig 9 sites + compareModels 2 sites + listBenchmarks banner (1)
    // + printBenchmarkSection 3 sites + printSummary 4 sites + showHelp (1 template-literal site)
    // = 24 sites minimum (lifecycle banners).
    expect(cliLogCount).toBeGreaterThanOrEqual(24);
  });

  it('routes CLI error call sites through cliError (>=7 sites)', () => {
    const src = readIndexSrc();
    const cliErrorCount = (src.match(/^(\s*)cliError\(/gm) || []).length;
    // runBenchmark fatal-error (1) + compareModels usage-error (2) + loadConfig failure (3)
    // + main().catch fatal (1) = 7 sites minimum.
    expect(cliErrorCount).toBeGreaterThanOrEqual(7);
  });

  it('preserves showHelp template literal body intact (single cliLog call wraps the full block)', () => {
    const src = readIndexSrc();
    // showHelp opens with `cliLog(\`` and the closing `\`);` appears at the bottom
    // of the function (the template literal spans many lines and must remain
    // a single call site, not be split).
    expect(src).toMatch(/function showHelp\(\) \{[\s\S]*?cliLog\(`[\s\S]*?`\);[\s\S]*?\}/);
  });

  it('preserves all original banner payloads verbatim through helper migration', () => {
    const src = readIndexSrc();
    // Spot-check key payloads that must survive byte-identical (wire-format
    // guarantee documented in src/cli/cli_log.ts header comment).
    expect(src).toContain('llm-bench v${pkgVersion}');
    expect(src).toContain('🚀 LLM Benchmark 开始...');
    expect(src).toContain('✅ 评测完成!');
    expect(src).toContain('❌ 评测失败:');
    expect(src).toContain('✅ 配置文件已创建: ${configPath}');
    expect(src).toContain('🔄 对比评测 ${models.length} 个模型...');
    expect(src).toContain('✅ 对比完成!');
    expect(src).toContain('📋 可用评测题:');
    expect(src).toContain('📊 评测结果:');
    expect(src).toContain('无法加载配置文件: ${configPath}');
    expect(src).toContain('Fatal error:');
  });
});

describe('src/cli/cli_log.ts module shape (chain #17 helper definition)', () => {
  it('exports cliLog and cliError as arrow functions with (...args: unknown[]) signature', () => {
    const src = readCliLogSrc();
    expect(src).toMatch(/export const cliLog = \(\.\.\.args: unknown\[\]\): void => \{/);
    expect(src).toMatch(/console\.log\(\.\.\.args\);/);
    expect(src).toMatch(/export const cliError = \(\.\.\.args: unknown\[\]\): void => \{/);
    expect(src).toMatch(/console\.error\(\.\.\.args\);/);
  });

  it('does NOT add any shouldLog gate (parallels webServerLog / webAdminLog decision)', () => {
    const src = readCliLogSrc();
    // CLI lifecycle banners + errors must always appear, even under jest.
    // A future --quiet flag would live inside the helper body, not at call sites.
    expect(src).not.toMatch(/\bshouldLog[A-Z][A-Za-z]*/);
  });

  it('documents wire-format byte-equivalence guarantee in header comment', () => {
    const src = readCliLogSrc();
    expect(src).toContain('byte-identical');
    expect(src).toContain('chain #17');
  });
});
