// src/web/server.ts - Express 服务器入口
// chain #15 closure: 2 inline console.log (L63 banner + L73 shutdown) → webServerLog per-prefix helper (parallels core/scorer.ts logError + web/engine/evaluator.ts logEvalError 漏更续集)。

import express from 'express';
import { createServer } from 'http';
import path from 'path';
import { existsSync, statSync } from 'fs';
import fs from 'fs';
import authRoutes, { initAdmin } from './routes/auth';
import configsRoutes from './routes/configs';
import evaluationsRoutes from './routes/evaluations';
import questionsRoutes from './routes/questions';
import { initWebSocket } from './websocket';
import { closeDatabase } from './db/database';
import { adminPasswordSource, validateRuntimeConfig } from './config';

/**
 * Server lifecycle log helper — 沿 src/core/scorer.ts:14 logError + src/web/engine/evaluator.ts:30 logEvalError
 * + src/core/reporter.ts:7 + src/web/websocket.ts:9 per-prefix helper 集中模式。
 *
 * chain #15 closure: server.ts 的 2 个 inline `console.log` site (L63 listen-banner + L73 SIGINT-shutdown)
 * 此前直接调 console.log, 散落在 server.ts 入口里。
 * 现通过 webServerLog 集中: 加 1 个新 helper / 调整 gate 语义只需改 1 处,
 * 不再让 server lifecycle log 走 raw console.log (parallels core/scorer.ts + web/engine/evaluator.ts 漏更续集)。
 *
 * 注: webServerLog 不带 shouldLog gate (因为 server 启动 banner 和 SIGINT shutdown 都是生命周期事件,
 * 与 per-evaluation error log 不同 — lifecycle log 应该 always 出现, 哪怕 jest 测试环境也保留).
 * 如果未来要加 shouldLog gate, 沿 src/core/scorer.ts:14 模式集中即可, 不必改 call sites.
 */
const webServerLog = (...args: unknown[]): void => {
  console.log(...args);
};

const PORT = process.env.PORT || 3033;
// PUBLIC_DIR 可用环境变量覆盖(默认是仓库里的 public/)。
// R498c 的回归测试需要在一个**临时的** public 目录里放一个指向 /etc 的
// 软链接才能观测到越界; 让被测的真实服务指向那个目录, 比在仓库的 public/
// 里种一个软链接更干净, 也不会污染工作区。
const PUBLIC_DIR = process.env.PUBLIC_DIR
  ? path.resolve(process.env.PUBLIC_DIR)
  : path.join(__dirname, '../../public');
// R497: 归一化后的 public 根目录, 用于把请求路径限制在这个目录之内。
const PUBLIC_ROOT = path.resolve(PUBLIC_DIR);
// R498c: realpath 之后的真实根目录。`path.resolve` 只归一化 `..`, 不解析
// 符号链接, 所以 public 目录**内部**的一个软链接仍然能通过"文本包含"检查
// 却指向目录之外 —— 实测: `public/escape -> /etc` 时 `GET /escape/passwd`
// 返回 200, 内容是真实的 /etc/shadow(root 密码哈希)。
// 收边必须建立在**真实路径**上: 根目录与候选路径都过 realpath 再比较。
let PUBLIC_REAL_ROOT = PUBLIC_ROOT;
try {
  PUBLIC_REAL_ROOT = fs.realpathSync(PUBLIC_ROOT);
} catch {
  PUBLIC_REAL_ROOT = PUBLIC_ROOT;
}

// 创建 Express 应用
const app = express();
const server = createServer(app);

// 中间件
app.use(express.json());

// 静态文件服务
//
// R498c: express.static (serve-static → send) 用 `fs.stat` 跟随符号链接,
// 所以 public 目录**内部**的一个软链接可以让它把目录外的文件直接发出去 ——
// 实测: public/escape -> /etc 时 `GET /escape/passwd` 经由 express.static
// 就返回了 200, 内容是真实的 /etc/shadow(root 密码哈希)。
// `send` 没有提供关闭跟随软链接的开关(该版本无 followSymlinks 选项), 所以
// 收边必须由**它前面**的一道自建守卫完成: 请求路径 realpath 之后必须仍在
// 真实根目录之内, 否则 403, 一律不放行到 express.static。
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    next();
    return;
  }
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(req.path);
  } catch {
    res.status(400).json({ error: 'Bad request' });
    return;
  }
  const candidate = path.resolve(PUBLIC_ROOT, decodedPath.replace(/^\/+/, ''));
  let real: string;
  try {
    real = fs.realpathSync(candidate);
  } catch {
    // 路径不存在(或不可读) -> 不是越界, 交给后面的中间件按正常 miss 处理。
    next();
    return;
  }
  if (real === PUBLIC_REAL_ROOT || real.startsWith(PUBLIC_REAL_ROOT + path.sep)) {
    next();
    return;
  }
  // 真实路径落在根目录之外 -> 拒绝。
  res.status(403).json({ error: 'Forbidden' });
});
app.use(express.static(PUBLIC_DIR));

// API 路由
app.use('/api/auth', authRoutes);
app.use('/api/configs', configsRoutes);
app.use('/api/evaluations', evaluationsRoutes);
app.use('/api/questions', questionsRoutes);

// 健康检查
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// SPA fallback - 所有非 API 路由都返回 index.html
app.use((req, res, _next) => {
  // 跳过 API 路径
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  // 如果是文件请求且存在，直接返回
  //
  // R497 安全修复: path.join 会把 `..` 归一化掉, 所以拼接结果可能已经离开
  // PUBLIC_DIR。旧写法 path.join(PUBLIC_DIR, req.path) 把一个越界的绝对路径
  // 交给 res.sendFile —— send 自带的 `..` 守卫此时已经失效(段已被折叠),
  // 于是任何匿名请求都能读到 PUBLIC_DIR 之外的任意文件(如 /etc/shadow)。
  // 修复方式是先解码, 再用 path.resolve 归一化, 最后显式断言结果仍在
  // PUBLIC_ROOT 之内; 越界一律 403, 不再落到 SPA 分支。
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(req.path);
  } catch {
    res.status(400).json({ error: 'Bad request' });
    return;
  }
  const relativePath = decodedPath.replace(/^\/+/, '');
  const targetPath = path.resolve(PUBLIC_ROOT, relativePath);
  const isInsidePublicDir =
    targetPath === PUBLIC_ROOT || targetPath.startsWith(PUBLIC_ROOT + path.sep);
  if (!isInsidePublicDir) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  // R498c: 上面的"文本包含"检查是必要条件, 但**不充分** —— 它只说明
  // "路径拼写上以根目录开头"。真正被读出来的是这个路径**指向的文件**, 而
  // public 目录**内部**的一个软链接可以让它指向目录之外。
  //
  // 实测 (R498c, 无任何凭据): public/escape -> /etc 时,
  //   GET /escape/passwd   -> 200, body = 真实的 /etc/shadow(root 密码哈希)
  //   GET /escape/hostname -> 200, body = 真实主机名
  // 也就是 R497 的修复在**软链接**这一形状上仍然是一个匿名任意文件读。
  //
  // 收边必须建立在**真实路径**上: 候选路径过 realpath 之后再和 realpath
  // 之后的根比较。realpath 会把路径上的每一段软链接都解析掉, 所以软链接
  // 指向的**子目录**同样不能把目标带出去。
  //
  // 注意 realpath 也会把 public 目录自身可能经由的软链接(如 /tmp ->
  // /private/tmp)归一化, 所以根与候选必须在同一个坐标系里比较。
  let realTargetPath: string | null = null;
  try {
    const real = fs.realpathSync(targetPath);
    if (real === PUBLIC_REAL_ROOT || real.startsWith(PUBLIC_REAL_ROOT + path.sep)) {
      realTargetPath = real;
    }
  } catch {
    realTargetPath = null; // 不存在(或不可读) -> 落到 SPA 分支
  }
  if (relativePath !== '' && realTargetPath !== null && existsSync(realTargetPath) && statSync(realTargetPath).isFile()) {
    // 用 root 相对路径发送: send 的 dotfile 守卫此时只看相对路径的段,
    // 而不是整条绝对路径(部署目录里带 `.` 段会让所有文件 404)。
    //
    // `path.relative` 给出的是**已归一化**的相对路径: 即使请求路径里带有
    // `a/../b` 这种文本上的 `..`, 发给 send 的串里也不再有 `..` 段,
    // 于是 send 自己的 UP_PATH_REGEXP 守卫不会被一个无害的路径误触发 403。
    //
    // R498c: 这里传的是**真实路径**的相对形式 —— 相对 PUBLIC_REAL_ROOT,
    // 而不是相对 PUBLIC_ROOT —— 否则一个软链接目录里的文件在 realpath 之后
    // 根本不在 PUBLIC_ROOT 之下, path.relative 会算出 `../../etc/passwd`。
    const safeRelative = path.relative(PUBLIC_REAL_ROOT, realTargetPath);
    res.sendFile(safeRelative, { root: PUBLIC_REAL_ROOT });
    return;
  }
  // 否则返回 index.html
  res.sendFile('index.html', { root: PUBLIC_REAL_ROOT });
});

// 初始化
validateRuntimeConfig();
initAdmin();
initWebSocket(server);

// 启动服务器
server.listen(PORT, () => {
  webServerLog(`
🎯 LLM Benchmark Web Server
============================
URL: http://localhost:${PORT}
Admin user: admin (password source: ${adminPasswordSource()})
  `);
});

// 优雅关闭
process.on('SIGINT', () => {
  webServerLog('\nShutting down...');
  closeDatabase();
  process.exit(0);
});

export default app;
