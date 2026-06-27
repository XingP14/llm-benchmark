// tests/web/auth.test.ts - 认证模块测试

import express, { Express } from 'express';
import request from 'supertest';
import authRoutes from '../../src/web/routes/auth';
import { resetDatabase, initAdminUser } from '../../src/web/db/database';
import { getAdminPassword, getJwtSecret, validateRuntimeConfig } from '../../src/web/config';

describe('Auth Routes', () => {
  let app: Express;

  beforeAll(() => {
    initAdminUser();

    app = express();
    app.use(express.json());
    app.use('/api/auth', authRoutes);
  });

  describe('runtime security config', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalRequireSecure = process.env.LLM_BENCH_REQUIRE_SECURE_CONFIG;
    const originalJwtSecret = process.env.JWT_SECRET;
    const originalAdminPassword = process.env.ADMIN_PASSWORD;

    afterEach(() => {
      process.env.NODE_ENV = originalNodeEnv;
      process.env.LLM_BENCH_REQUIRE_SECURE_CONFIG = originalRequireSecure;
      process.env.JWT_SECRET = originalJwtSecret;
      process.env.ADMIN_PASSWORD = originalAdminPassword;
    });

    it('should allow development defaults outside production', () => {
      delete process.env.LLM_BENCH_REQUIRE_SECURE_CONFIG;
      delete process.env.JWT_SECRET;
      delete process.env.ADMIN_PASSWORD;
      process.env.NODE_ENV = 'test';

      expect(getJwtSecret()).toBe('llm-bench-dev-secret');
      expect(getAdminPassword()).toBe('admin123');
    });

    it('should reject default secrets when secure config is required', () => {
      process.env.LLM_BENCH_REQUIRE_SECURE_CONFIG = '1';
      process.env.JWT_SECRET = 'llm-bench-secret';
      process.env.ADMIN_PASSWORD = 'admin123';

      expect(() => validateRuntimeConfig()).toThrow('JWT_SECRET must be set to a non-default value in production');
    });

    it('should accept explicit production secrets', () => {
      process.env.LLM_BENCH_REQUIRE_SECURE_CONFIG = '1';
      process.env.JWT_SECRET = 'a-long-random-jwt-secret';
      process.env.ADMIN_PASSWORD = 'a-long-random-admin-password';

      expect(() => validateRuntimeConfig()).not.toThrow();
    });
  });

  beforeEach(() => {
    resetDatabase();
  });

  describe('POST /api/auth/login', () => {
    it('should login with valid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'admin123' });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.username).toBe('admin');
    });

    it('should reject invalid password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'wrongpass' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid credentials');
    });

    it('should reject unknown user', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'nobody', password: 'pass' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid credentials');
    });

    it('should reject missing fields', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Username and password required');
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return user info with valid token', async () => {
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'admin123' });

      const token = loginRes.body.token;

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.userId).toBeDefined();
      expect(res.body.username).toBe('admin');
    });

    it('should reject request without token', async () => {
      const res = await request(app)
        .get('/api/auth/me');

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('No token provided');
    });

    it('should reject request with invalid token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token');

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid token');
    });

    it('should reject request with malformed header', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'NotBearer token');

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('No token provided');
    });
  });

  // Regression coverage for UserRow type narrowing in src/web/routes/auth.ts login handler
  // (was `as any`, now typed `as UserRow | undefined` — verify .get() undefined path + required-field path)
  describe('UserRow typed cast (regression for 06-26 typed auth cast)', () => {
    it('should return 401 when user does not exist (undefined UserRow branch)', async () => {
      // resetDatabase() in beforeEach wipes users; 'ghost' is guaranteed absent
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'ghost', password: 'whatever' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid credentials');
    });

    it('should return 401 when password_hash is empty string (UserRow.password_hash falsy)', async () => {
      // Schema enforces NOT NULL on password_hash, so we cannot insert NULL.
      // Instead, insert empty string '' — schema allows, bcrypt.compareSync('whatever','') returns false.
      // This exercises the short-circuit path `!user || !bcrypt.compareSync(password, user.password_hash)`.
      // Under the typed `UserRow.password_hash: string` invariant, '' is still truthy as a string,
      // so this case verifies the bcrypt branch, not the `!user.password_hash` falsy branch.
      const { getDatabase } = require('../../src/web/db/database');
      const db = getDatabase();
      db.prepare("INSERT INTO users (username, password_hash) VALUES (?, '')").run('nohash');

      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'nohash', password: 'whatever' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid credentials');
    });

    it('should reject empty-string username (login validation layer, before DB)', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: '', password: 'admin123' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Username and password required');
    });
  });
});
