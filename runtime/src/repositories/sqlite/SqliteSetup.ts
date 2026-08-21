import type Database from 'better-sqlite3';
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { ISetup } from '../ISetup';
import { pathExists } from '../pathExists';
import { collectMigrationFiles } from '../collectMigrationFiles';

export interface SqliteSetupOptions {
  dbPath: string;
  migrationsDir?: string;
  seedFile?: string;
  // Reuse an already-open Database handle; required for `:memory:` where opening a second connection lands migrations on a throwaway that dies on close.
  database?: Database.Database;
}

export class SqliteSetup implements ISetup {
  constructor(private readonly options: SqliteSetupOptions) {}

  async run(): Promise<void> {
    const reused = this.options.database;
    let db: Database.Database;
    if (reused) {
      db = reused;
    } else {
      const { default: DatabaseCtor } = await import(/* @vite-ignore */ 'better-sqlite3');
      db = new DatabaseCtor(this.options.dbPath);
    }
    try {
      // WAL journaling only makes sense on file-backed DBs; `:memory:` + reused handles keep whatever the caller already configured.
      if (!reused && this.options.dbPath !== ':memory:') {
        db.pragma('journal_mode = WAL');
      }
      db.pragma('foreign_keys = OFF');
      await this.runMigrations(db);
      if (this.options.seedFile) {
        await this.applySeed(db, this.options.seedFile);
      }
      db.pragma('foreign_keys = ON');
    } finally {
      if (!reused) db.close();
    }
  }

  private async runMigrations(db: Database.Database): Promise<void> {
    const dir = this.options.migrationsDir;
    if (!dir || !(await pathExists(dir))) return;

    const setupFile = path.join(dir, 'setup.sql');
    if (await pathExists(setupFile)) {
      db.exec(await readFile(setupFile, 'utf-8'));
    }

    db.exec(
      'CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT DEFAULT CURRENT_TIMESTAMP);',
    );

    const files = await collectMigrationFiles(dir);

    const applied = new Set(
      (db.prepare('SELECT version FROM schema_migrations').all() as Array<{ version: string }>).map(
        (r) => r.version,
      ),
    );

    const insertVersion = db.prepare(
      'INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)',
    );

    // Baseline mode: empty schema_migrations but user tables already exist (bootstrapped by predev hook / legacy seed) — mark every on-disk migration as applied so re-running doesn't fail with "table already exists"; new versions added later still apply because they're not in the baselined set.
    if (applied.size === 0 && hasExistingUserTables(db)) {
      for (const { version } of files) {
        insertVersion.run(version);
        applied.add(version);
      }
    }

    for (const { file, version } of files) {
      if (applied.has(version)) continue;
      db.exec(await readFile(path.join(dir, file), 'utf-8'));
      insertVersion.run(version);
    }
  }

  private async applySeed(db: Database.Database, seedFile: string): Promise<void> {
    if (!(await pathExists(seedFile))) return;
    const sql = (await readFile(seedFile, 'utf-8')).replace(
      /INSERT INTO/gi,
      'INSERT OR IGNORE INTO',
    );
    db.exec(sql);
  }
}

const MIGRATION_TRACKING_TABLES = new Set(['schema_migrations', 'migrates', 'migrate_logs']);

function hasExistingUserTables(db: Database.Database): boolean {
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .all() as Array<{ name: string }>;
  return rows.some((r) => !MIGRATION_TRACKING_TABLES.has(r.name));
}
