// src/web/server.ts - Express 服务器入口
// chain #15 closure: 2 inline console.log (L63 banner + L73 shutdown) → webServerLog per-prefix helper (parallels core/scorer.ts logError + web/engine/evaluator.ts logEvalError 漏更续集)。

import express from 'express';
import { createServer } from 'http';
import path from 'path';
import { existsSync, statSync } from 'fs';
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
const PUBLIC_DIR = path.join(__dirname, '../../public');
// R497: 归一化后的 public 根目录, 用于把请求路径限制在这个目录之内。
const PUBLIC_ROOT = path.resolve(PUBLIC_DIR);

// 创建 Express 应用
const app = express();
const server = createServer(app);

// 中间件
app.use(express.json());

// 静态文件服务
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
  if (relativePath !== '' && existsSync(targetPath) && statSync(targetPath).isFile()) {
    // 用 root 相对路径发送: send 的 dotfile 守卫此时只看相对路径的段,
    // 而不是整条绝对路径(部署目录里带 `.` 段会让所有文件 404)。
    //
    // `path.relative` 给出的是**已归一化**的相对路径: 即使请求路径里带有
    // `a/../b` 这种文本上的 `..`, 发给 send 的串里也不再有 `..` 段,
    // 于是 send 自己的 UP_PATH_REGEXP 守卫不会被一个无害的路径误触发 403。
    const safeRelative = path.relative(PUBLIC_ROOT, targetPath);
    res.sendFile(safeRelative, { root: PUBLIC_ROOT });
    return;
  }
  // 否则返回 index.html
  res.sendFile('index.html', { root: PUBLIC_ROOT });
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
