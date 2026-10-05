// tests/evaluator-log-helpers.test.ts
// 钉住 src/core/evaluator.ts 模块级 log/logWarn/logError/logInfo 助手:
// 1) test 模式 (JEST_WORKER_ID 存在) — shouldLog=false, 助手永不递归, 不会爆栈
// 2) production 模式 (NODE_ENV/JEST_WORKER_ID 强制 unset, 走 dist/ 编译产物) —
//    修复前: log() 自递归 → RangeError: Maximum call stack size exceeded
//    修复后: console.log/warn/error/info 直接走原生方法, run() 正常返回 []
//
// 设计: 由于 helpers 是 module-level non-exported, 且 test 模式下 shouldLog=false
// 永远不会走到递归分支, 必须 spawn 子进程 + 走 dist + unset env vars 才能稳定复现/保护.
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { Evaluator } from '../src/core/evaluator';
import { LLMAdapter } from '../src/adapters/adapter';
import { BenchmarkConfig, EvaluationResult } from '../src/types';

// BUDGET (2026-10-06): the child does ~60ms of real work and node's own startup
// on an idle box is ~30-90ms, so the original 8s was ~47x the standalone cost.
// That headroom is not real headroom on a loaded host: measured on this machine
// under sustained load, the SAME probe exceeded 8s wall clock and came back as
// `spawnSync node ETIMEDOUT` even though the child had no reason to take that
// long. A wall-clock budget sized for a quiet machine makes this case a load
// flake that reports as a failure of the recursion guard it is proving.
//
// Module scope, not the it() body: the jest-level timeout is the third argument
// of `it(name, fn, timeout)`, which is a SIBLING of the callback, not inside it.
// A const declared inside the callback is not in scope there -- the suite then
// fails to compile with TS2304 and reports 0 tests, which reads like a red
// recursion guard but is not one.
const SUBPROCESS_BUDGET_MS = 30000;
const JEST_TIMEOUT_MS = SUBPROCESS_BUDGET_MS + 15000;

class StubAdapter implements LLMAdapter {
  async chat(): Promise<string> { return 'ok'; }
  async ping(): Promise<boolean> { return true; }
  getName(): string { return 'stub'; }
  get name(): string { return 'stub'; }
}

describe('evaluator log helpers (no infinite recursion)', () => {
  const cfg: BenchmarkConfig = {
    models: [
      { name: 'm1', endpoint: 'https://x', apiKey: 'k', type: 'openai' },
    ],
    benchmarks: { dialogue: true, coding: true },
  };

  it('module loads and instantiates without throwing (test mode is silent)', () => {
    const ev = new Evaluator(cfg, new StubAdapter());
    expect(ev).toBeInstanceOf(Evaluator);
  });

  it('run() with empty models returns [] without throwing (test mode silent)', async () => {
    const ev = new Evaluator({ ...cfg, models: [] }, new StubAdapter());
    const results: EvaluationResult[] = await ev.run();
    expect(Array.isArray(results)).toBe(true);
    expect(results).toHaveLength(0);
  });

  it('the dist the recursion guard above depends on is not older than its source', () => {
    // The case above spawns node against dist/core/evaluator.js, so it can only
    // detect a self-recursive log() if dist actually contains the current src.
    // dist/ is gitignored and never rebuilt by `npm test`, so a stale dist turns
    // that case into a false green: observed 2026-10-05 with a self-recursive
    // log() in src and a pre-mutation dist, where it passed in 77ms because the
    // artifact it read still held console.log. CI only catches this by accident,
    // via the `npm run build` step that happens to precede `npm test` there.
    // Fail on the staleness itself, so the guard cannot pass vacuously.
    const srcFile = path.resolve(__dirname, '../src/core/evaluator.ts');
    const distFile = path.resolve(__dirname, '../dist/core/evaluator.js');
    expect(fs.existsSync(distFile)).toBe(true);
    const srcMtime = fs.statSync(srcFile).mtimeMs;
    const distMtime = fs.statSync(distFile).mtimeMs;
    expect({ distIsStale: distMtime < srcMtime }).toEqual({ distIsStale: false });
  });

  it('production mode: log() does NOT recurse infinitely (subprocess + dist smoke)', () => {
    // 子进程脚本: 在 production mode (NODE_ENV/JEST_WORKER_ID 强制 unset) 下
    // 加载编译后的 dist/core/evaluator.js 并跑 empty-models run(). 修复前会爆 RangeError.
    // Budget rationale lives with SUBPROCESS_BUDGET_MS at module scope.
    const projectRoot = path.resolve(__dirname, '..');
    const probe = [
      "delete process.env.NODE_ENV;",
      "delete process.env.JEST_WORKER_ID;",
      "const { Evaluator } = require('./core/evaluator.js');",
      "const adapter = { chat: async () => 'ok', ping: async () => true, getName: () => 'stub', name: 'stub' };",
      "const cfg = { models: [], benchmarks: { dialogue: true, coding: true } };",
      "const ev = new Evaluator(cfg, adapter);",
      "ev.run().then(",
      "  (r) => { console.log('OK len=' + r.length); process.exit(0); },",
      "  (e) => { console.error('ERR ' + (e && e.message)); process.exit(1); }",
      ");",
    ].join('\n');
    let out = '';
    let err = '';
    let code = 0;
    try {
      out = execFileSync('node', ['-e', probe], {
        cwd: path.join(projectRoot, 'dist'),
        env: { ...process.env, NODE_ENV: '', JEST_WORKER_ID: '' },
        encoding: 'utf8',
        timeout: SUBPROCESS_BUDGET_MS,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (e: any) {
      // A timeout hands back status=null, so `e.status ?? 1` silently folds a
      // KILLED-BY-BUDGET run into a clean exit-1. Surface the distinction so
      // a future overrun says "the budget was too small", not "the recursion
      // guard failed".
      const killedByBudget = e.killed === true || e.signal === 'SIGTERM';
      err = killedByBudget
        ? `[subprocess budget of ${SUBPROCESS_BUDGET_MS}ms exceeded] ${e.message || ''}`
        : (e.stderr || e.stdout || String(e)).toString();
      code = e.status ?? (killedByBudget ? null : 1);
    }
    expect({ code, out: out.slice(0, 200), err: err.slice(0, 200) }).toEqual(
      expect.objectContaining({ code: 0, out: expect.stringContaining('OK len=0') })
    );
    expect(err).not.toMatch(/Maximum call stack size exceeded/);
    // The jest-level timeout must stay ABOVE the subprocess budget, or jest
    // kills the test itself and the diagnostic above is never reached.
  }, JEST_TIMEOUT_MS);
});
