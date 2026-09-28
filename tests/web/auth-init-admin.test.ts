// tests/web/auth-init-admin.test.ts
// Covers the last uncovered branch in src/web/routes/auth.ts: the
// `if (!existing)` arm of initAdmin() at lines 39-43 plus the
// webAdminLog(...) call on line 42.
//
// initAdmin() is the bootstrap path the web server runs at module load
// (src/web/server.ts:76), and every existing auth suite seeds the admin row
// through initAdminUser()/resetDatabase() in src/web/db/database.ts instead —
// so the "first run, admin absent -> create + log" branch never executed.
// A silent edit that dropped the INSERT, or that made the bootstrap log line
// misreport the password source, would leave the whole suite green.
//
// Env mutations are restored in afterEach so no other suite observes a leaked
// ADMIN_PASSWORD / NODE_ENV / LLM_BENCH_REQUIRE_SECURE_CONFIG.

import bcrypt from 'bcrypt';
import { getDatabase, resetDatabase } from '../../src/web/db/database';
import { initAdmin } from '../../src/web/routes/auth';
import { getAdminPassword } from '../../src/web/config';

describe('initAdmin bootstrap (src/web/routes/auth.ts:36-44)', () => {
  const ORIGINAL_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
  const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
  const ORIGINAL_REQUIRE_SECURE = process.env.LLM_BENCH_REQUIRE_SECURE_CONFIG;

  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    resetDatabase();
    delete process.env.LLM_BENCH_REQUIRE_SECURE_CONFIG;
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    if (ORIGINAL_ADMIN_PASSWORD === undefined) {
      delete process.env.ADMIN_PASSWORD;
    } else {
      process.env.ADMIN_PASSWORD = ORIGINAL_ADMIN_PASSWORD;
    }
    if (ORIGINAL_NODE_ENV === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    }
    if (ORIGINAL_REQUIRE_SECURE === undefined) {
      delete process.env.LLM_BENCH_REQUIRE_SECURE_CONFIG;
    } else {
      process.env.LLM_BENCH_REQUIRE_SECURE_CONFIG = ORIGINAL_REQUIRE_SECURE;
    }
    // Leave the shared singleton in the shape every other suite expects.
    resetDatabase();
  });

  function adminRowCount(): number {
    const db = getDatabase();
    const row = db.prepare('SELECT COUNT(*) AS n FROM users WHERE username = ?').get('admin') as { n: number };
    return row.n;
  }

  it('creates the admin user on first run when no admin row exists', () => {
    const db = getDatabase();
    db.prepare('DELETE FROM users WHERE username = ?').run('admin');
    expect(adminRowCount()).toBe(0);

    initAdmin();

    expect(adminRowCount()).toBe(1);
  });

  it('hashes the resolved admin password, never the raw value', () => {
    const db = getDatabase();
    db.prepare('DELETE FROM users WHERE username = ?').run('admin');

    initAdmin();

    const row = db.prepare('SELECT password_hash FROM users WHERE username = ?').get('admin') as {
      password_hash: string;
    };
    expect(row.password_hash).not.toBe(getAdminPassword());
    expect(bcrypt.compareSync(getAdminPassword(), row.password_hash)).toBe(true);
  });

  it('logs the creation and reports development-default when ADMIN_PASSWORD is unset', () => {
    const db = getDatabase();
    db.prepare('DELETE FROM users WHERE username = ?').run('admin');
    delete process.env.ADMIN_PASSWORD;

    initAdmin();

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(String(logSpy.mock.calls[0][0])).toContain('Admin user created: admin');
    expect(String(logSpy.mock.calls[0][0])).toContain('development-default');
  });

  it('reports the environment as the password source when ADMIN_PASSWORD is set', () => {
    const db = getDatabase();
    db.prepare('DELETE FROM users WHERE username = ?').run('admin');
    process.env.ADMIN_PASSWORD = 'env-supplied-admin-password';

    initAdmin();

    expect(String(logSpy.mock.calls[0][0])).toContain('environment');

    const row = db.prepare('SELECT password_hash FROM users WHERE username = ?').get('admin') as {
      password_hash: string;
    };
    expect(bcrypt.compareSync('env-supplied-admin-password', row.password_hash)).toBe(true);
  });

  it('is idempotent: a second call inserts nothing and logs nothing', () => {
    const db = getDatabase();
    db.prepare('DELETE FROM users WHERE username = ?').run('admin');

    initAdmin();
    logSpy.mockClear();

    initAdmin();

    expect(adminRowCount()).toBe(1);
    expect(logSpy).not.toHaveBeenCalled();
  });
});
