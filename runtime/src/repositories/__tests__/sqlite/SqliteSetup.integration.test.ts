import Database from 'better-sqlite3';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathExists } from '../../pathExists';
import { SqliteSetup } from '../../sqlite/SqliteSetup';

async function tempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sqlite-setup-'));
  return dir;
}

describe('SqliteSetup', () => {
  let workDir: string;
  let dbPath: string;

  beforeEach(async () => {
    workDir = await tempDir();
    dbPath = path.join(workDir, 'app.db');
  });

  afterEach(async () => {
    await fs.rm(workDir, { recursive: true, force: true });
  });

  it('run() creates the db file when missing', async () => {
    expect(await pathExists(dbPath)).toBe(false);
    await new SqliteSetup({ dbPath }).run();
    expect(await pathExists(dbPath)).toBe(true);
  });

  it('run() applies versioned migrations in order, skipping already-applied versions', async () => {
    const migrationsDir = path.join(workDir, 'migrations');
    await fs.mkdir(migrationsDir);
    await fs.writeFile(
      path.join(migrationsDir, 'setup.sql'),
      'CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT DEFAULT CURRENT_TIMESTAMP);',
    );
    await fs.writeFile(
      path.join(migrationsDir, 'V001__create_widgets.sql'),
      "CREATE TABLE widgets (id INTEGER PRIMARY KEY); INSERT INTO schema_migrations (version) VALUES ('V001');",
    );
    await fs.writeFile(
      path.join(migrationsDir, 'V002__add_color.sql'),
      "ALTER TABLE widgets ADD COLUMN color TEXT; INSERT INTO schema_migrations (version) VALUES ('V002');",
    );

    await new SqliteSetup({ dbPath, migrationsDir }).run();

    const db = new Database(dbPath);
    const cols = db.pragma('table_info(widgets)') as Array<{ name: string }>;
    expect(cols.map((c) => c.name).sort()).toEqual(['color', 'id']);
    const versions = db.prepare('SELECT version FROM schema_migrations ORDER BY version').all();
    expect(versions).toEqual([{ version: 'V001' }, { version: 'V002' }]);
    db.close();

    await new SqliteSetup({ dbPath, migrationsDir }).run();
    const db2 = new Database(dbPath);
    const versions2 = db2.prepare('SELECT version FROM schema_migrations ORDER BY version').all();
    expect(versions2).toEqual([{ version: 'V001' }, { version: 'V002' }]);
    db2.close();
  });

  it('run() rewrites seed INSERTs to be idempotent', async () => {
    const migrationsDir = path.join(workDir, 'migrations');
    await fs.mkdir(migrationsDir);
    await fs.writeFile(
      path.join(migrationsDir, 'setup.sql'),
      'CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT DEFAULT CURRENT_TIMESTAMP);',
    );
    await fs.writeFile(
      path.join(migrationsDir, 'V001__create_widgets.sql'),
      "CREATE TABLE widgets (id INTEGER PRIMARY KEY, name TEXT UNIQUE); INSERT INTO schema_migrations (version) VALUES ('V001');",
    );
    const seedFile = path.join(workDir, 'seed.sql');
    await fs.writeFile(seedFile, "INSERT INTO widgets (id, name) VALUES (1, 'alpha');");

    await new SqliteSetup({ dbPath, migrationsDir, seedFile }).run();
    await new SqliteSetup({ dbPath, migrationsDir, seedFile }).run();

    const db = new Database(dbPath);
    const rows = db.prepare('SELECT id, name FROM widgets').all();
    expect(rows).toEqual([{ id: 1, name: 'alpha' }]);
    db.close();
  });

  it('run() is a no-op for migrations when migrationsDir is missing', async () => {
    await expect(
      new SqliteSetup({ dbPath, migrationsDir: path.join(workDir, 'nope') }).run(),
    ).resolves.toBeUndefined();
    expect(await pathExists(dbPath)).toBe(true);
  });

  it('run() auto-creates schema_migrations when no setup.sql is present', async () => {
    const migrationsDir = path.join(workDir, 'migrations');
    await fs.mkdir(migrationsDir);
    await fs.writeFile(
      path.join(migrationsDir, '1700000001_initial_up.sql'),
      'CREATE TABLE widgets (id INTEGER PRIMARY KEY);',
    );

    await new SqliteSetup({ dbPath, migrationsDir }).run();

    const db = new Database(dbPath);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>;
    expect(tables.map((t) => t.name)).toContain('schema_migrations');
    expect(tables.map((t) => t.name)).toContain('widgets');
    const versions = db.prepare('SELECT version FROM schema_migrations ORDER BY version').all();
    expect(versions).toEqual([{ version: '1700000001_initial' }]);
    db.close();
  });

  it('run() accepts <digits>_<label>_up.sql filenames and ignores matching _down.sql', async () => {
    const migrationsDir = path.join(workDir, 'migrations');
    await fs.mkdir(migrationsDir);
    await fs.writeFile(
      path.join(migrationsDir, '1700000001_initial_up.sql'),
      'CREATE TABLE widgets (id INTEGER PRIMARY KEY);',
    );
    await fs.writeFile(
      path.join(migrationsDir, '1700000001_initial_down.sql'),
      'DROP TABLE widgets;',
    );
    await fs.writeFile(
      path.join(migrationsDir, '1700000002_v002_up.sql'),
      'ALTER TABLE widgets ADD COLUMN color TEXT;',
    );
    await fs.writeFile(
      path.join(migrationsDir, '1700000002_v002_down.sql'),
      'ALTER TABLE widgets DROP COLUMN color;',
    );

    await new SqliteSetup({ dbPath, migrationsDir }).run();

    const db = new Database(dbPath);
    const cols = db.pragma('table_info(widgets)') as Array<{ name: string }>;
    expect(cols.map((c) => c.name).sort()).toEqual(['color', 'id']);
    const versions = db.prepare('SELECT version FROM schema_migrations ORDER BY version').all();
    expect(versions).toEqual([{ version: '1700000001_initial' }, { version: '1700000002_v002' }]);
    db.close();
  });

  it('run() auto-baselines when the DB has user tables but schema_migrations is empty', async () => {
    const preDb = new Database(dbPath);
    preDb.exec('CREATE TABLE widgets (id INTEGER PRIMARY KEY, name TEXT);');
    preDb.exec(`CREATE TABLE migrates (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE);`);
    preDb.exec("INSERT INTO migrates (name) VALUES ('1700000001_initial');");
    preDb.close();

    const migrationsDir = path.join(workDir, 'migrations');
    await fs.mkdir(migrationsDir);
    await fs.writeFile(
      path.join(migrationsDir, '1700000001_initial_up.sql'),
      'CREATE TABLE widgets (id INTEGER PRIMARY KEY, name TEXT);',
    );

    await expect(new SqliteSetup({ dbPath, migrationsDir }).run()).resolves.toBeUndefined();

    const db = new Database(dbPath);
    const versions = db.prepare('SELECT version FROM schema_migrations').all();
    expect(versions).toEqual([{ version: '1700000001_initial' }]);
    db.close();
  });

  it('run() is idempotent for new-pattern migrations without manual schema_migrations bookkeeping', async () => {
    const migrationsDir = path.join(workDir, 'migrations');
    await fs.mkdir(migrationsDir);
    await fs.writeFile(
      path.join(migrationsDir, '1700000001_initial_up.sql'),
      'CREATE TABLE widgets (id INTEGER PRIMARY KEY);',
    );

    await new SqliteSetup({ dbPath, migrationsDir }).run();
    // Second run must not re-execute the CREATE (would error: table already exists).
    await expect(new SqliteSetup({ dbPath, migrationsDir }).run()).resolves.toBeUndefined();

    const db = new Database(dbPath);
    const versions = db.prepare('SELECT version FROM schema_migrations').all();
    expect(versions).toEqual([{ version: '1700000001_initial' }]);
    db.close();
  });
});
