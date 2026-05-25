// tests/web/database-mock.ts - 数据库 Mock

// 这个模块需要在测试开始前被导入，以替换真实的 getDatabase
import { getTestDatabase, closeTestDatabase, resetTestDatabase } from './setup';

// Jest 模块 mock
jest.mock('../../src/web/db/database', () => {
  const Database = require('better-sqlite3');
  
  let mockDb: any = null;
  
  return {
    getDatabase: jest.fn(() => {
      if (!mockDb) {
        mockDb = new Database(':memory:');
        mockDb.pragma('journal_mode = WAL');
        mockDb.pragma('foreign_keys = ON');
        
        // 创建表结构
        mockDb.exec(`
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
        
        // 初始化管理员
        const bcrypt = require('bcrypt');
        const hash = bcrypt.hashSync('admin123', 10);
        mockDb.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run('admin', hash);
      }
      return mockDb;
    }),
    closeDatabase: jest.fn(() => {
      if (mockDb) {
        mockDb.close();
        mockDb = null;
      }
    }),
  };
});

export { resetTestDatabase, closeTestDatabase, getTestDatabase };
