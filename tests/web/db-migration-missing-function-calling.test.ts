// tests/web/db-migration-missing-function-calling.test.ts
//
// WHY THIS FILE EXISTS (2026-10-09 03:03 cron).
//
// The tick's assigned candidate was "db-migration-default-path.test.ts SIGKILLs
// in the FULL suite but passes standalone; suspected worker memory pressure
// from the 106 parallel suites". Measuring first -- as the candidate itself
// instructed -- showed that theory has NO MECHANISM on this repo:
//
//   * `npm test` is `jest --runInBand --coverage`. The suite is SERIAL. There
//     are no parallel workers and therefore no worker memory pressure.
//   * Measured on this HEAD, serial: db-migration-default-path.test.ts is
//     0.176s -- the 87th percentile of 107 suites. It is one of the FASTEST.
//     Total serial run 44.7s for 107 suites / 1265 tests.
//   * My own first measurement attempt made the mistake the prior tick's note
//     warns about: I ran `npx jest --coverage` WITHOUT --runInBand, jest
//     spawned 3 workers, and the run stalled 8 minutes with no progress. The
//     artifact was reproducing the very "parallelism" the note speculated
//     about -- and it hung, rather than SIGKILLed. So the recorded evidence for
//     the memory-pressure theory was itself produced by a command that does not
//     exist in CI or in `npm test`.
//
// Reading the target of the migration suite instead found a REAL defect on
// the same code path, with a measured root cause.
//
// THE DEFECT: initializeSchema() in src/web/db/database.ts adds TWO columns on
// the upgrade path:
//
//     if (!evalCols.some(c => c.name === 'include_long_context')) { ... ALTER ... }
//     if (!evalCols.some(c => c.name === 'include_multi_turn')) { ... ALTER ... }
//
// but the schema has a THIRD dimension column, include_function_calling
// (src/web/db/database.ts:130), which has NO upgrade arm. c71c2f2 (2026-06-02,
// "feat(benchmark): add Function Calling dimension") added the column to the
// CREATE TABLE statement and to the INSERT at
// src/web/routes/evaluations.ts:130 -- and nothing else. The ALTER block was
// never extended.
//
// WHO BREAKS. Any database created before 2026-06-02 has an evaluations table
// with no include_function_calling column. Opening it runs initializeSchema(),
// which now succeeds (it only checks the two newer columns) -- and then the
// very next statement in the product, the INSERT at
// src/web/routes/evaluations.ts:130, names the column explicitly:
//
//     INSERT INTO evaluations (id, user_id, status, include_dialogue,
//       include_coding, include_function_calling, include_long_context,
//       include_multi_turn) VALUES (?,?,?,?,?,?,?,?)
//
// so SQLite raises `table evaluations has no column named
// include_function_calling` and POST /api/evaluations answers 400. The
// migration block is the ONE place that could have saved the existing row, and
// it is the block that skipped it.
//
// This is the exact failure the sibling suite's header names -- "老版本创建的
// .db 文件升级到当前代码时, 补列逻辑唯一能救场的地方就是这两行, 而它们此前
// 零覆盖" -- except the sibling suite enumerated the columns that HAD arms,
// and so inherited the same list. A test that builds its fixture from the
// schema's own column list would not have had this hole; this one was written
// by hand and the hand-written list was the bug's hiding place.
//
// THE FIX (production): add the third arm, and make the list self-maintaining
// so the next dimension cannot repeat this.
//
// THE FIX (test): this file pins the upgrade path against a real legacy DB,
// and it pins it by DISCOVERING the columns from the source CREATE TABLE
// rather than by re-listing them, so the fixture cannot inherit the hole.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Database from 'better-sqlite3';

type DbModule = typeof import('../../src/web/db/database');

const REPO = path.join(__dirname, '..', '..');
const DATABASE_SRC = path.join(REPO, 'src', 'web', 'db', 'database.ts');

const ORIGINAL_DB_PATH = process.env.DB_PATH;
const ORIGINAL_CWD = process.cwd();

let tmpRoot: string;

/** Load database.ts in a clean registry so module-level DB_PATH re-evaluates. */
function loadFresh(dbPath: string | undefined, cwd?: string): DbModule {
  let mod!: DbModule;
  jest.isolateModules(() => {
    if (dbPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = dbPath;
    if (cwd) process.chdir(cwd);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('../../src/web/db/database') as DbModule;
  });
  return mod;
}

function columnsOf(db: Database.Database, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(
    (c) => c.name,
  );
}

/**
 * Every dimension column the CURRENT CREATE TABLE declares for `evaluations`.
 *
 * Read from the source rather than hardcoded. This is the load-bearing
 * mechanism of this file: the sibling suite hardcoded the two columns that
 * happen to have ALTER arms, which is precisely why the third went unnoticed.
 * Deriving the list means a future dimension column is covered here the day it
 * is added to the schema, with no edit to this file.
 */
function schemaDimensionColumns(): string[] {
  const src = fs.readFileSync(DATABASE_SRC, 'utf8');
  const createTable = src.match(/CREATE TABLE IF NOT EXISTS evaluations \(([\s\S]*?)\n    \);/);
  expect(createTable).not.toBeNull();
  if (!createTable) return [];
  const body = createTable[1];
  return Array.from(body.matchAll(/^\s*(include_\w+)\s+INTEGER\s+DEFAULT/mg)).map((m) => m[1]);
}

/**
 * The exported upgrade-arm list, read from the REAL module rather than from
 * the source text, so the assertion tracks behaviour and not spelling.
 */
function readMigrationColumns(): readonly string[] {
  const mod = loadFresh(path.join(tmpRoot, 'never-opened.db'));
  try {
    return mod.EVALUATION_MIGRATION_COLUMNS;
  } finally {
    mod.closeDatabase();
  }
}

/** Build a pre-2026-06-02 evaluations table: no function_calling column. */
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
      include_long_context INTEGER DEFAULT 0,
      include_multi_turn INTEGER DEFAULT 0,
      started_at DATETIME,
      completed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      evaluation_id TEXT NOT NULL,
      config_id TEXT NOT NULL,
      question_id TEXT NOT NULL,
      question_type TEXT NOT NULL,
      category TEXT NOT NULL,
      model_output TEXT,
      score INTEGER,
      reference_answer TEXT,
      test_results TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE evaluation_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      evaluation_id TEXT NOT NULL,
      config_id INTEGER NOT NULL
    );
  `);
  if (withRow) {
    db.prepare(
      "INSERT INTO evaluations (id, user_id, status, include_dialogue, include_coding, include_long_context, include_multi_turn) VALUES ('eval-legacy-1', 1, 'COMPLETED', 1, 1, 0, 0)",
    ).run();
  }
  db.close();
}

describe('database.ts — 老库升级必须补齐 schema 声明的每一个 include_* 维度列', () => {
  beforeAll(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lb-db-fc-migrate-'));
  });

  afterAll(() => {
    if (ORIGINAL_DB_PATH === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = ORIGINAL_DB_PATH;
    process.chdir(ORIGINAL_CWD);
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  // Case (0) pins the premise of the file. If a future schema drops every
  // include_* column, the rest of the suite would pass for the wrong reason.
  it('(0) the schema declares at least the three known dimension columns', () => {
    const cols = schemaDimensionColumns();
    expect(cols).toContain('include_dialogue');
    expect(cols).toContain('include_coding');
    expect(cols).toContain('include_function_calling');
    expect(cols).toContain('include_long_context');
    expect(cols).toContain('include_multi_turn');
  });

  it('(1) opening a pre-2026-06-02 database adds the missing function_calling column', () => {
    const legacyPath = path.join(tmpRoot, 'legacy-fc.db');
    createLegacyDb(legacyPath, true);

    // Precondition: the legacy table genuinely lacks the column. Asserted, not
    // assumed, so a fixture-drift cannot make the upgrade look correct.
    {
      const raw = new Database(legacyPath);
      expect(columnsOf(raw, 'evaluations')).not.toContain('include_function_calling');
      raw.close();
    }

    const mod = loadFresh(legacyPath);
    try {
      const cols = columnsOf(mod.getDatabase(), 'evaluations');
      expect(cols).toContain('include_function_calling');
    } finally {
      mod.closeDatabase();
    }
  });

  // The end-to-end arm. Before the fix this throws
  // "table evaluations has no column named include_function_calling" out of the
  // product's own INSERT, and POST /api/evaluations answers 400 for every
  // request against a pre-June database.
  it('(2) the product INSERT at routes/evaluations.ts succeeds on the upgraded database', () => {
    const legacyPath = path.join(tmpRoot, 'legacy-insert.db');
    createLegacyDb(legacyPath, true);

    const mod = loadFresh(legacyPath);
    let db!: Database.Database;
    try {
      db = mod.getDatabase();

      // The exact column list and parameter order of the product INSERT,
      // copied from src/web/routes/evaluations.ts:130-141.
      const info = db.prepare(
        'INSERT INTO evaluations (id, user_id, status, include_dialogue, include_coding, include_function_calling, include_long_context, include_multi_turn) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      );
      info.run('eval-after-upgrade', 1, 'PENDING', 1, 1, 1, 0, 0);

      const row = db
        .prepare('SELECT id, status, include_function_calling FROM evaluations WHERE id=?')
        .get('eval-after-upgrade') as Record<string, unknown>;
      expect(row).toEqual({
        id: 'eval-after-upgrade',
        status: 'PENDING',
        include_function_calling: 1,
      });

      // The upgrade is an upgrade, not a recreate: the pre-existing row and its
      // data survive the ALTER.
      const legacy = db
        .prepare('SELECT id, status FROM evaluations WHERE id=?')
        .get('eval-legacy-1') as Record<string, unknown>;
      expect(legacy).toEqual({ id: 'eval-legacy-1', status: 'COMPLETED' });
    } finally {
      mod.closeDatabase();
    }
  });

  // The self-maintaining arm. A hand-written list of columns is a list that
  // will be incomplete the next time someone adds a dimension; this asserts
  // that whatever the schema declares, the migration covers.
  it('(3) every include_* column ADDED AFTER the baseline schema has an upgrade arm', () => {
    const src = fs.readFileSync(DATABASE_SRC, 'utf8');

    // include_dialogue and include_coding shipped in the ORIGINAL evaluations
    // table, so a pre-2026-06-02 database already has them and they need no
    // arm. Asserting an arm for them would be a false requirement, and
    // satisfying it with a pointless ALTER is worse than not asserting it.
    // The question this case actually asks is: does every dimension column
    // added AFTER the baseline have a way to reach an old database?
    const BASELINE = new Set(['include_dialogue', 'include_coding']);
    const addedLater = schemaDimensionColumns().filter((c) => !BASELINE.has(c));
    expect(addedLater.length).toBeGreaterThan(0);

    // The upgrade arms are driven by EVALUATION_MIGRATION_COLUMNS. Read the
    // exported list rather than grepping for the old per-column `c.name ===`
    // shape, so this case tracks the REAL source of truth: if the fix were
    // reverted to hand-written ifs covering only two columns, the set
    // difference below would still name include_function_calling.
    const migrationCols = readMigrationColumns();
    expect([...migrationCols].sort()).toEqual([...addedLater].sort());

    // And the list must be wired to the ALTER loop, not merely declared.
    expect(src).toContain('for (const column of EVALUATION_MIGRATION_COLUMNS)');
    expect(src).toContain('ALTER TABLE evaluations ADD COLUMN ${column}');
  });

  it('(4) the upgrade is idempotent: a second open re-runs no ALTER and adds no duplicate column', () => {
    const legacyPath = path.join(tmpRoot, 'legacy-idempotent.db');
    createLegacyDb(legacyPath, false);

    const first = loadFresh(legacyPath);
    try {
      expect(columnsOf(first.getDatabase(), 'evaluations')).toContain('include_function_calling');
    } finally {
      first.closeDatabase();
    }

    // Second open re-reads disk from a clean registry, so both arms of the
    // migration take the FALSE side this time.
    const second = loadFresh(legacyPath);
    try {
      const cols = columnsOf(second.getDatabase(), 'evaluations');
      expect(cols.filter((c) => c === 'include_function_calling')).toHaveLength(1);
    } finally {
      second.closeDatabase();
    }
  });
});