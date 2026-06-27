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
import * as path from 'path';
import { Evaluator } from '../src/core/evaluator';
import { LLMAdapter } from '../src/adapters/adapter';
import { BenchmarkConfig, EvaluationResult } from '../src/types';

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

  it('production mode: log() does NOT recurse infinitely (subprocess + dist smoke)', () => {
    // 子进程脚本: 在 production mode (NODE_ENV/JEST_WORKER_ID 强制 unset) 下
    // 加载编译后的 dist/core/evaluator.js 并跑 empty-models run(). 修复前会爆 RangeError.
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
        timeout: 8000,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (e: any) {
      err = (e.stderr || e.stdout || String(e)).toString();
      code = e.status ?? 1;
    }
    expect({ code, out: out.slice(0, 200), err: err.slice(0, 200) }).toEqual(
      expect.objectContaining({ code: 0, out: expect.stringContaining('OK len=0') })
    );
    expect(err).not.toMatch(/Maximum call stack size exceeded/);
  }, 15000);
});
