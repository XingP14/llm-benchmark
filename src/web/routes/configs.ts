// src/web/routes/configs.ts - LLM 配置管理路由

import { Router, Response } from 'express';
import { getDatabase } from '../db/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

// GET /api/configs
router.get('/', (req: AuthRequest, res: Response) => {
  const db = getDatabase();
  const configs = db.prepare(`
    SELECT id, user_id, name, type, endpoint, model, is_active, created_at
    FROM configs WHERE user_id = ?
  `).all(req.userId);
  res.json(configs);
});

// POST /api/configs
router.post('/', (req: AuthRequest, res: Response) => {
  const { name, type, endpoint, api_key, model } = req.body;
  if (!name || !type || !endpoint || !api_key) {
    res.status(400).json({ error: 'Missing required fields: name, type, endpoint, api_key' });
    return;
  }

  const db = getDatabase();
  const result = db.prepare(`
    INSERT INTO configs (user_id, name, type, endpoint, api_key, model)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(req.userId, name, type, endpoint, api_key, model || null);

  res.json({ id: result.lastInsertRowid, name, type, endpoint, model });
});

// PUT /api/configs/:id
router.put('/:id', (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { name, type, endpoint, api_key, model, is_active } = req.body;

  const db = getDatabase();
  const existing = db.prepare('SELECT id FROM configs WHERE id=? AND user_id=?').get(id, req.userId);
  if (!existing) {
    res.status(404).json({ error: 'Config not found' });
    return;
  }

  db.prepare(`
    UPDATE configs SET name=?, type=?, endpoint=?, api_key=?, model=?, is_active=?
    WHERE id=? AND user_id=?
  `).run(name, type, endpoint, api_key, model, is_active ? 1 : 0, id, req.userId);

  res.json({ success: true });
});

// DELETE /api/configs/:id
router.delete('/:id', (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const db = getDatabase();
  db.prepare('DELETE FROM configs WHERE id=? AND user_id=?').run(id, req.userId);
  res.json({ success: true });
});

export default router;
