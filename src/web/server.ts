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
  const filePath = path.join(PUBLIC_DIR, req.path);
  if (existsSync(filePath) && statSync(filePath).isFile()) {
    res.sendFile(filePath);
    return;
  }
  // 否则返回 index.html
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
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
