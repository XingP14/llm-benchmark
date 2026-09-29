// tests/web/db-migration-default-path.test.ts
//
// 覆盖 src/web/db/database.ts 中长期未被任何测试执行到的分支:
//
//  1. :8  `const DB_PATH = process.env.DB_PATH || './data/llm-bench.db'`
//        的 DEFAULT 臂 —— jest.setup.js 无条件设置 process.env.DB_PATH,
//        所以整条测试套件里该 `||` 的右半边从未被求值 (dark arm)。
//  2. :28 `if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true })`
//        的 TRUE 臂 —— jest.setup.js 预先建好 test-data/, 目录永远存在。
//  3. :172 / :175 ALTER TABLE 迁移的两个 TRUE 臂 —— 全套件都用当前 schema 建库,
//        PRAGMA table_info(evaluations) 永远已经含有 include_long_context /
//        include_multi_turn, 所以两个 `if (!evalCols.some(...))` 永远走 false。
//
// (3) 是真正的行为漏洞面: 老版本创建的 .db 文件升级到当前代码时, 补列逻辑
// 唯一能救场的地方就是这两行, 而它们此前零覆盖 —— 删掉任一 if, 全部现有
// 测试依然全绿, 而线上老库会直接 "no such column: include_multi_turn"。
// 本文件用真实 better-sqlite3 手工造一个"老 schema"库来钉死这条迁移路径。

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Database from 'better-sqlite3';

type DbModule = typeof import('../../src/web/db/database');

const ORIGINAL_DB_PATH = process.env.DB_PATH;
const ORIGINAL_CWD = process.cwd();

let tmpRoot: string;

/** 在一个干净的模块注册表里加载 database.ts, 使模块级 DB_PATH 常量重新求值。 */
function loadFresh(dbPath: string | undefined, cwd?: string): DbModule {
  let mod!: DbModule;
  jest.isolateModules(() => {
    if (dbPath === undefined) {
      delete process.env.DB_PATH;
    } else {
      process.env.DB_PATH = dbPath;
    }
    if (cwd) process.chdir(cwd);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    mod = require('../../src/web/db/database') as DbModule;
  });
  return mod;
}

function columnsOf(db: Database.Database, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(
    c => c.name
  );
}

/** 模拟 v0.4.x 时代的 evaluations 表: 缺 include_long_context 与 include_multi_turn。 */
function createLegacyDb(dbPath: string, withRow: boolean): void {
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE evaluations (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      include_dialogue INTEGER DEFAULT 1,
      include_coding INTEGER DEFAULT 1,
      started_at DATETIME,
      completed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  if (withRow) {
    // 迁移必须保留既有数据, 且新列取 DEFAULT 0
    db.prepare(
      "INSERT INTO evaluations (id, user_id, status, include_dialogue, include_coding) VALUES ('eval-legacy-1', 1, 'COMPLETED', 1, 1)"
    ).run();
  }
  db.close();
}

describe('database.ts — DB_PATH fallback / 目录自建 / 老库补列迁移', () => {
  beforeAll(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lb-db-migrate-'));
  });

  afterAll(() => {
    if (ORIGINAL_DB_PATH === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = ORIGINAL_DB_PATH;
    process.chdir(ORIGINAL_CWD);
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('DB_PATH 未设置时回落到 ./data/llm-bench.db, 并自动创建缺失的数据目录', () => {
    const workdir = path.join(tmpRoot, 'cwd-fallback');
    fs.mkdirSync(workdir, { recursive: true });

    const mod = loadFresh(undefined, workdir);
    try {
      const db = mod.getDatabase();
      // 目录被 mkdirSync 补出来 (覆盖 :28 TRUE 臂)
      expect(fs.existsSync(path.join(workdir, 'data'))).toBe(true);
      // 连接确实落在回落路径上, 而不是 jest.setup 的 test-data/test-N.db
      expect(fs.existsSync(path.join(workdir, 'data', 'llm-bench.db'))).toBe(true);
      // 回落路径同样要建出完整 schema
      expect(columnsOf(db, 'users')).toContain('password_hash');
      expect(columnsOf(db, 'evaluations')).toContain('include_multi_turn');
    } finally {
      mod.closeDatabase();
    }
  });

  it('getDatabase 在数据目录缺失时自建嵌套目录 (DB_PATH 带多级前缀)', () => {
    const deep = path.join(tmpRoot, 'deep', 'a', 'b', 'c', 'bench.db');
    expect(fs.existsSync(path.dirname(deep))).toBe(false);

    const mod = loadFresh(deep);
    try {
      mod.getDatabase();
      expect(fs.existsSync(deep)).toBe(true);
    } finally {
      mod.closeDatabase();
    }
  });

  it('老库升级: 为缺列的 evaluations 表补出 include_long_context 与 include_multi_turn, 且保留既有行', () => {
    const legacyPath = path.join(tmpRoot, 'legacy.db');
    createLegacyDb(legacyPath, true);
    // 前置断言: 老库里确实没有这两列
    {
      const raw = new Database(legacyPath);
      const cols = columnsOf(raw, 'evaluations');
      expect(cols).not.toContain('include_long_context');
      expect(cols).not.toContain('include_multi_turn');
      raw.close();
    }

    const mod = loadFresh(legacyPath);
    let db!: Database.Database;
    try {
      db = mod.getDatabase();
      const cols = columnsOf(db, 'evaluations');
      expect(cols).toContain('include_long_context');
      expect(cols).toContain('include_multi_turn');

      // 迁移是 ALTER TABLE ADD COLUMN, 既有数据必须原样保留
      const row = db
        .prepare('SELECT id, status, include_long_context, include_multi_turn FROM evaluations WHERE id=?')
        .get('eval-legacy-1') as Record<string, unknown>;
      expect(row).toEqual({
        id: 'eval-legacy-1',
        status: 'COMPLETED',
        include_long_context: 0,
        include_multi_turn: 0,
      });
    } finally {
      mod.closeDatabase();
    }
  });

  it('迁移是幂等的: 二次打开已升级的库不再重复 ALTER, 列不重复', () => {
    const legacyPath = path.join(tmpRoot, 'legacy-twice.db');
    createLegacyDb(legacyPath, false);

    // 第一次打开: 走迁移
    const first = loadFresh(legacyPath);
    try {
      const cols = columnsOf(first.getDatabase(), 'evaluations');
      expect(cols).toContain('include_long_context');
    } finally {
      first.closeDatabase();
    }

    // 第二次打开 (新模块注册表 = 重新读磁盘): 两列已存在, 两个 if 都走 false
    const second = loadFresh(legacyPath);
    try {
      const cols = columnsOf(second.getDatabase(), 'evaluations');
      expect(cols.filter(c => c === 'include_long_context')).toHaveLength(1);
      expect(cols.filter(c => c === 'include_multi_turn')).toHaveLength(1);
    } finally {
      second.closeDatabase();
    }
  });

  it('closeDatabase / resetSingleton 之后重开仍可拿到可用连接 (singleton 复位)', () => {
    const p = path.join(tmpRoot, 'reopen.db');
    const mod = loadFresh(p);
    try {
      const a = mod.getDatabase();
      mod.closeDatabase();
      expect(mod.getDatabase()).not.toBe(a);

      mod.resetSingleton();
      const c = mod.getDatabase();
      mod.closeDatabase();
      expect(c).not.toBe(a);
    } finally {
      mod.closeDatabase();
    }
  });
});
