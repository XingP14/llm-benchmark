// tests/web/setup.ts - 测试环境设置

import Database from 'better-sqlite3';

// 全局测试数据库实例
let testDb: Database.Database | null = null;

/**
 * 获取测试数据库
 */
export function getTestDatabase(): Database.Database {
  if (!testDb) {
    testDb = new Database(':memory:');
    testDb.pragma('journal_mode = WAL');
    testDb.pragma('foreign_keys = ON');
    initializeSchema(testDb);
  }
  return testDb;
}

/**
 * 关闭测试数据库
 */
export function closeTestDatabase(): void {
  if (testDb) {
    try {
      testDb.close();
    } catch (e) {
      // 忽略关闭错误
    }
    testDb = null;
  }
}

/**
 * 重置测试数据库
 */
export function resetTestDatabase(): void {
  if (testDb) {
    testDb.exec('DELETE FROM results');
    testDb.exec('DELETE FROM evaluation_configs');
    testDb.exec('DELETE FROM evaluations');
    testDb.exec('DELETE FROM configs');
    testDb.exec('DELETE FROM users');
    
    const bcrypt = require('bcrypt');
    const hash = bcrypt.hashSync('admin123', 10);
    testDb.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run('admin', hash);
  }
}

/**
 * 初始化数据库结构
 */
function initializeSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      api_key TEXT NOT NULL,
      model TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS evaluations (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      include_dialogue INTEGER DEFAULT 1,
      include_coding INTEGER DEFAULT 1,
      started_at DATETIME,
      completed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS evaluation_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      evaluation_id TEXT NOT NULL,
      config_id INTEGER NOT NULL,
      FOREIGN KEY (evaluation_id) REFERENCES evaluations(id),
      FOREIGN KEY (config_id) REFERENCES configs(id)
    );

    CREATE TABLE IF NOT EXISTS results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      evaluation_id TEXT NOT NULL,
      config_id INTEGER NOT NULL,
      question_id TEXT NOT NULL,
      question_type TEXT NOT NULL,
      category TEXT NOT NULL,
      model_output TEXT,
      score INTEGER,
      reference_answer TEXT,
      test_results TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (evaluation_id) REFERENCES evaluations(id),
      FOREIGN KEY (config_id) REFERENCES configs(id)
    );
  `);

  // 初始化管理员用户
  const bcrypt = require('bcrypt');
  const hash = bcrypt.hashSync('admin123', 10);
  database.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run('admin', hash);
}

// 设置环境变量
process.env.JWT_SECRET = 'test-secret-key';
process.env.ADMIN_PASSWORD = 'admin123';
