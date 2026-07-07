// src/web/routes/auth.ts - 认证路由

import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { getDatabase } from '../db/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { getAdminPassword, getJwtSecret, adminPasswordSource } from '../config';

const router = Router();

/**
 * users 表 row 类型 — id/username/password_hash NOT NULL, created_at 默认可选
 * (SQLite TEXT/DATETIME 默认 NULL 除非 DEFAULT CURRENT_TIMESTAMP, 但 .get() 收口为可选更安全)
 */
interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  created_at?: string | null;
}

/**
 * chain #16 closure: migrate auth.ts:32 admin init console.log to webAdminLog per-prefix helper
 * (parallels src/web/server.ts webServerLog + src/core/scorer.ts logError + src/web/engine/evaluator.ts logEvalError 漏更续集).
 * webAdminLog 不带 shouldLog gate (admin init is a bootstrap lifecycle event that must always appear,
 * e.g. during first-run db bootstrap under jest, unlike per-request auth debug logs).
 */
const webAdminLog = (...args: unknown[]): void => {
  console.log(...args);
};

/**
 * 初始化管理员用户
 */
export function initAdmin(): void {
  const db = getDatabase();
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  if (!existing) {
    const hash = bcrypt.hashSync(getAdminPassword(), 10);
    db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run('admin', hash);
    webAdminLog(`Admin user created: admin (password source: ${adminPasswordSource()})`);
  }
}

// POST /api/auth/login
router.post('/login', (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: 'Username and password required' });
    return;
  }

  const db = getDatabase();
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as UserRow | undefined;

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const token = jwt.sign({ userId: user.id, username: user.username }, getJwtSecret(), { expiresIn: '24h' });
  res.json({ token, username: user.username });
});

// GET /api/auth/me
router.get('/me', authMiddleware, (req: AuthRequest, res: Response) => {
  res.json({ userId: req.userId, username: req.username });
});

export default router;
