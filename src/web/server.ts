// src/web/server.ts - Express 服务器入口

import express from 'express';
import { createServer } from 'http';
import path from 'path';
import authRoutes, { initAdmin } from './routes/auth';
import configsRoutes from './routes/configs';
import evaluationsRoutes from './routes/evaluations';
import questionsRoutes from './routes/questions';
import { initWebSocket } from './websocket';
import { getDatabase } from './db/database';

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
app.use((req, res, next) => {
  // 跳过 API 路径
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  // 如果是文件请求且存在，直接返回
  const filePath = path.join(PUBLIC_DIR, req.path);
  if (require('fs').existsSync(filePath) && require('fs').statSync(filePath).isFile()) {
    res.sendFile(filePath);
    return;
  }
  // 否则返回 index.html
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// 初始化
initAdmin();
initWebSocket(server);

// 启动服务器
server.listen(PORT, () => {
  console.log(`
🎯 LLM Benchmark Web Server
============================
URL: http://localhost:${PORT}
Default Admin: admin / ${process.env.ADMIN_PASSWORD || 'admin123'}
  `);
});

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  const { closeDatabase } = require('./db/database');
  closeDatabase();
  process.exit(0);
});

export default app;
