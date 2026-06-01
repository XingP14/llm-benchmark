// src/web/db/database.ts - SQLite 数据库连接管理

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = process.env.DB_PATH || './data/llm-bench.db';

let db: Database.Database | null = null;

/**
 * 获取数据库连接
 */
export function getDatabase(): Database.Database {
  if (!db) {
    const dbDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    initializeSchema(db);
  }
  return db;
}

/**
 * 关闭数据库连接
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * 重置数据库单例（测试用）
 */
export function resetSingleton(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * 重置数据库（测试用）
 * 使用 INSERT OR REPLACE 避免并行测试的 UNIQUE 冲突
 */
export function resetDatabase(): void {
  // 如果单例不存在，重新创建连接
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    initializeSchema(db);
  }

  // 使用事务确保原子性
  const reset = db.transaction(() => {
    db!.exec('DELETE FROM results');
    db!.exec('DELETE FROM evaluation_configs');
    db!.exec('DELETE FROM evaluations');
    db!.exec('DELETE FROM configs');
    db!.exec('DELETE FROM users');

    const bcrypt = require('bcrypt');
    const hash = bcrypt.hashSync('admin123', 10);
    db!.prepare('INSERT OR REPLACE INTO users (id, username, password_hash) VALUES (1, ?, ?)').run('admin', hash);
  });
  reset();
}

/**
 * 初始化管理员用户
 */
export function initAdminUser(): void {
  const database = getDatabase();
  const bcrypt = require('bcrypt');
  const hash = bcrypt.hashSync('admin123', 10);
  // 只在 admin 用户不存在时插入
  const existing = database.prepare('SELECT id FROM users WHERE username=?').get('admin');
  if (!existing) {
    database.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run('admin', hash);
  }
}

/**
 * 初始化数据库表结构
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
      include_function_calling INTEGER DEFAULT 0,
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

    CREATE INDEX IF NOT EXISTS idx_results_eval ON results(evaluation_id);
    CREATE INDEX IF NOT EXISTS idx_results_config ON results(config_id);
    CREATE INDEX IF NOT EXISTS idx_evaluations_user ON evaluations(user_id);
    CREATE INDEX IF NOT EXISTS idx_configs_user ON configs(user_id);
  `);
}
