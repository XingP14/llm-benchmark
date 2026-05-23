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

const PORT = process.env.PORT || 3000;

// 创建 Express 应用
const app = express();
const server = createServer(app);

// 中间件
app.use(express.json());
app.use(express.static(path.join(__dirname, '../../public')));

// 路由
app.use('/api/auth', authRoutes);
app.use('/api/configs', configsRoutes);
app.use('/api/evaluations', evaluationsRoutes);
app.use('/api/questions', questionsRoutes);

// 健康检查
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// SPA fallback - 所有非 API 路由都返回 index.html
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '../../public/index.html'));
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
