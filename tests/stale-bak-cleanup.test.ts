// tests/stale-bak-cleanup.test.ts
//
// 钉住 src/core/evaluator.ts.bak 已清空 + .gitignore 包含 *.bak + src/index.ts L277 loadConfig catch 走 errorMessage:
// 1) src/core/evaluator.ts.bak 文件已不存在 (stale 漏更 22:43 cron dispatchV050External refactor 留下的 cp 备份, md5 4182a257 跟 evaluator.ts 一致, git ls-files 未追踪但 git check-ignore 返回非零导致污染 git status)
// 2) .gitignore 末尾追加 # Backup files 段包含 *.bak 条目 (prevent future 漏更 — 一旦再有 cp .bak 出来会被自动忽略)
// 3) git check-ignore src/core/evaluator.ts.bak 退出码 0 (确认 .gitignore 生效, 不会再次污染 git status)
// 4) src/index.ts L277 loadConfig catch 块包含 errorMessage(error) 调用 (原版漏更: 只 console.error(configPath) 不 log underlying error)
// 5) src/index.ts L277 loadConfig catch 块保留 configPath + 提示 + process.exit(1) 行为不变 (refactor 不改语义)
// 6) src/index.ts 已有 `import { errorMessage } from './errors';` (no new import needed)
// 7) src/index.ts L391 main().catch 块包含 : unknown 类型标注 + errorMessage(error) 调用 (漏更 #2)
// 8) src/index.ts L391 main().catch 块保留 process.exit(1) 行为不变

import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';

describe('stale .bak cleanup + index.ts catch errorMessage 漏更', () => {
  const repoRoot = path.resolve(__dirname, '..');

  test('1) src/core/evaluator.ts.bak 已删除 (不再污染 git status)', () => {
    const bakPath = path.join(repoRoot, 'src', 'core', 'evaluator.ts.bak');
    expect(fs.existsSync(bakPath)).toBe(false);
  });

  test('2) .gitignore 末尾包含 # Backup files 段 + *.bak + *.bak.ts 两条规则', () => {
    const gitignorePath = path.join(repoRoot, '.gitignore');
    const content = fs.readFileSync(gitignorePath, 'utf-8');
    expect(content).toMatch(/# Backup files.*\n.*\*\.bak\n.*\*\.bak\.ts/s);
  });

  test('3) git check-ignore src/core/evaluator.ts.bak 退出码 0 (.gitignore 生效)', () => {
    // 若有人意外 cp 一个 evaluator.ts.bak 出来, git 应该自动忽略
    let exitCode = -1;
    let stdout = '';
    try {
      stdout = execFileSync('git', ['check-ignore', '-v', 'src/core/evaluator.ts.bak'], {
        cwd: repoRoot,
        encoding: 'utf-8',
      });
      exitCode = 0;
    } catch (err: unknown) {
      exitCode = (err as { status?: number }).status ?? -1;
      stdout = (err as { stdout?: string }).stdout ?? '';
    }
    // git check-ignore: exit 0 = ignored, exit 1 = not ignored, exit 128 = error
    expect(exitCode).toBe(0);
    // 应包含 .gitignore 行号 + *.bak 规则
    expect(stdout).toMatch(/\.gitignore:\d+:\*\.bak/);
  });

  test('4) src/index.ts loadConfig catch 包含 errorMessage(error) 调用', () => {
    const indexPath = path.join(repoRoot, 'src', 'index.ts');
    const content = fs.readFileSync(indexPath, 'utf-8');
    // loadConfig function body — 抓 catch 块后到下一个 function 之间的代码
    const match = content.match(/function loadConfig[\s\S]*?\n\}\n/);
    expect(match).not.toBeNull();
    if (!match) return;
    const block = match[0];
    expect(block).toMatch(/catch \(error: unknown\)/);
    expect(block).toMatch(/errorMessage\(error\)/);
  });

  test('5) src/index.ts loadConfig catch 保留 configPath 提示 + process.exit(1) 行为不变', () => {
    const indexPath = path.join(repoRoot, 'src', 'index.ts');
    const content = fs.readFileSync(indexPath, 'utf-8');
    const match = content.match(/function loadConfig[\s\S]*?\n\}\n/);
    expect(match).not.toBeNull();
    if (!match) return;
    const block = match[0];
    expect(block).toMatch(/无法加载配置文件: \$\{configPath\}/);
    expect(block).toMatch(/请先运行: llm-bench init/);
    expect(block).toMatch(/process\.exit\(1\)/);
  });

  test('6) src/index.ts 已 import errorMessage from ./errors (no new import needed)', () => {
    const indexPath = path.join(repoRoot, 'src', 'index.ts');
    const content = fs.readFileSync(indexPath, 'utf-8');
    expect(content).toMatch(/import\s*\{\s*errorMessage\s*\}\s*from\s*'\.\/errors'/);
  });

  test('7) src/index.ts main().catch 包含 : unknown 标注 + errorMessage(error) 调用', () => {
    const indexPath = path.join(repoRoot, 'src', 'index.ts');
    const content = fs.readFileSync(indexPath, 'utf-8');
    const match = content.match(/main\(\)\.catch\(\s*\(error: unknown\)\s*=>\s*\{[\s\S]*?\}\s*\);/);
    expect(match).not.toBeNull();
    if (!match) return;
    const block = match[0];
    expect(block).toMatch(/errorMessage\(error\)/);
    // 不再有原始的 `console.error('Fatal error:', error)` (用 raw error, not errorMessage(error))
    expect(block).not.toMatch(/console\.error\('Fatal error:',\s*error\)/);
  });

  test('8) src/index.ts main().catch 保留 process.exit(1) 行为不变', () => {
    const indexPath = path.join(repoRoot, 'src', 'index.ts');
    const content = fs.readFileSync(indexPath, 'utf-8');
    const match = content.match(/main\(\)\.catch\(\s*\(error: unknown\)\s*=>\s*\{[\s\S]*?\}\s*\);/);
    expect(match).not.toBeNull();
    if (!match) return;
    const block = match[0];
    expect(block).toMatch(/process\.exit\(1\)/);
  });
});
