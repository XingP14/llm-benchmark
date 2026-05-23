-- LLM Benchmark Database Schema

-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- LLM 配置表
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

-- 评测记录表
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

-- 评测-配置关联表
CREATE TABLE IF NOT EXISTS evaluation_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  evaluation_id TEXT NOT NULL,
  config_id INTEGER NOT NULL,
  FOREIGN KEY (evaluation_id) REFERENCES evaluations(id),
  FOREIGN KEY (config_id) REFERENCES configs(id)
);

-- 结果表
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

-- 索引
CREATE INDEX IF NOT EXISTS idx_results_eval ON results(evaluation_id);
CREATE INDEX IF NOT EXISTS idx_results_config ON results(config_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_user ON evaluations(user_id);
CREATE INDEX IF NOT EXISTS idx_configs_user ON configs(user_id);
