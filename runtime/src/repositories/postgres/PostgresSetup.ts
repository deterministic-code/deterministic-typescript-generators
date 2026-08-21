import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { ISetup } from '../ISetup';
import { pathExists } from '../pathExists';
import { collectMigrationFiles } from '../collectMigrationFiles';
import { PostgresDatasource } from './PostgresDatasource';

export interface PostgresSetupOptions {
  datasource: PostgresDatasource;
  migrationsDir?: string;
  seedFile?: string;
}

const SCHEMA_MIGRATIONS_DDL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
`.trim();

export class PostgresSetup implements ISetup {
  constructor(private readonly options: PostgresSetupOptions) {}

  async run(): Promise<void> {
    const ds = this.options.datasource;
    await ds.open();
    await ds.query(SCHEMA_MIGRATIONS_DDL);
    if (this.options.migrationsDir) {
      await this.runMigrations(this.options.migrationsDir);
    }
    if (this.options.seedFile && (await pathExists(this.options.seedFile))) {
      const seed = await readFile(this.options.seedFile, 'utf-8');
      await ds.query(seed);
    }
  }

  private async runMigrations(dir: string): Promise<void> {
    if (!(await pathExists(dir))) return;
    const ds = this.options.datasource;

    // Optional one-shot setup.sql applied before the versioned chain —
    // matches the SqliteSetup contract and lets create-datasource-tables
    // emit per-dialect bootstrap state.
    const setupFile = path.join(dir, 'setup.sql');
    if (await pathExists(setupFile)) {
      await ds.query(await readFile(setupFile, 'utf-8'));
    }

    const files = await collectMigrationFiles(dir);

    const appliedRows = await ds.query<{ version: string }>(
      'SELECT version FROM schema_migrations',
    );
    const applied = new Set(appliedRows.map((r) => r.version));

    for (const { file, version } of files) {
      if (applied.has(version)) continue;
      const sql = await readFile(path.join(dir, file), 'utf-8');
      await ds.query(sql);
      await ds.query('INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING', [
        version,
      ]);
    }
  }
}
