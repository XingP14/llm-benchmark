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
