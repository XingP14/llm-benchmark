// tests/web/auth-middleware-branch.test.ts - auth中间件分支测试

import express, { Express } from 'express';
import request from 'supertest';
import authRoutes from '../../src/web/routes/auth';
import { resetDatabase, initAdminUser, resetSingleton } from '../../src/web/db/database';

describe('Auth Middleware Branch Coverage', () => {
  let app: Express;

  beforeAll(() => {
    resetSingleton();
    initAdminUser();

    app = express();
    app.use(express.json());
    app.use('/api/auth', authRoutes);
  });

  beforeEach(() => {
    resetDatabase();
  });

  describe('GET /api/auth/me - branch coverage', () => {
    it('should hit authHeader?.startsWith branch TRUE - no auth header at all', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('No token provided');
    });

    it('should hit authHeader?.startsWith branch TRUE - Bearer missing', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'NotBearer token');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('No token provided');
    });

    it('should hit authHeader?.startsWith branch FALSE - valid token', async () => {
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'admin123' });
      const token = loginRes.body.token;

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
    });

    it('should hit catch branch - malformed token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer not.a.valid.jwt');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid token');
    });

    it('should hit catch branch - empty string token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer ');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('No token provided');
    });

    it('should hit catch branch - expired token', async () => {
      // Create an expired token
      const jwt = require('jsonwebtoken');
      const JWT_SECRET = process.env.JWT_SECRET || 'llm-bench-secret';
      const expiredToken = jwt.sign({ userId: 1, username: 'admin' }, JWT_SECRET, { expiresIn: '-1s' });
      
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`);
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid token');
    });
  });
});
