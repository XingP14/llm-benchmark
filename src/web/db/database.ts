// src/web/db/database.ts - SQLite 数据库连接管理

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcrypt';

const DB_PATH = process.env.DB_PATH || './data/llm-bench.db';

let db: Database.Database | null = null;

/**
 * 获取数据库连接
 */
// SQLite PRAGMA table_info row shape (used by ALTER TABLE migrations)
interface PragmaColumn {
  cid: number;
  name: string;
  type: string;
  notnull: 0 | 1;
  dflt_value: unknown;
  pk: 0 | 1;
}

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

    // bcrypt imported at module top
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
  // bcrypt imported at module top
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
      include_long_context INTEGER DEFAULT 0,
      include_multi_turn INTEGER DEFAULT 0,
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

  // 兼容已有库：补加后加的 include_* 维度列。
  //
  // 这里为什么要显式列出升级臂：`c71c2f2`
  // (2026-06-02, Function Calling 维度) 只改了 CREATE TABLE 和
  // routes/evaluations.ts 的 INSERT，没有在下面补对应的 ALTER，于是任何
  // 2026-06-02 之前建的库升级后仍然缺 include_function_calling，而产品自己的
  // INSERT 显式写死了这一列 —— 老用户 POST /api/evaluations 直接 400
  // "table evaluations has no column named include_function_calling"。
  //
  // 下面的循环取代了逐列手写 if：升级臂集中在 EVALUATION_MIGRATION_COLUMNS 一处，
  // 不用改控制流。
  //
  // 但它**不是** schema 声明驱动的，也不保证「加了新维度就自动升级」。实测：
  // 往 CREATE TABLE 里加一个 include_reasoning 而不动下面的列表，老库依然不会
  // 被补上该列（probe: _tmp/probe-comment-claim.mjs，2026-10-09）。EVALUATION_MIGRATION_COLUMNS
  // 仍然是手工维护的列表，加维度时必须同步加一条 —— 这正是本 bug 的藏身处，
  // 所以它的回归由 tests/web/db-migration-missing-function-calling.test.ts
  // 的 case (3) 守住：该用例从 CREATE TABLE 推导「基线之后新增的列」并与本列表
  // 求差集，列表漏一条就红。保证来自测试，不来自这条注释。
  if (db) {
    const evalCols = db.prepare("PRAGMA table_info(evaluations)").all() as PragmaColumn[];
    const existing = new Set(evalCols.map((c) => c.name));
    for (const column of EVALUATION_MIGRATION_COLUMNS) {
      if (!existing.has(column)) {
        db.exec(`ALTER TABLE evaluations ADD COLUMN ${column} INTEGER DEFAULT 0`);
      }
    }
  }
}

/**
 * evaluations 表在基线 schema 之后新增的维度列，各自需要一条 ALTER 升级臂。
 *
 * 与 initializeSchema 的 CREATE TABLE 一一对应，是升级路径的唯一事实来源。
 * 仅包含基线之后新增的列：include_dialogue / include_coding 自 evaluations 表
 * 诞生起就存在，老库必然已有，不需要（也不应该）ALTER。
 */
export const EVALUATION_MIGRATION_COLUMNS = [
  'include_function_calling',
  'include_long_context',
  'include_multi_turn',
] as const;
