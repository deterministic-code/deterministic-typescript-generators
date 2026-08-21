import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { ISetup } from '../ISetup';
import { pathExists } from '../pathExists';
import { collectMigrationFiles } from '../collectMigrationFiles';
import type { SqlserverDatasource } from './SqlserverDatasource';

export interface SqlserverSetupOptions {
  datasource: SqlserverDatasource;
  migrationsDir?: string;
  seedFile?: string;
}

const SCHEMA_MIGRATIONS_DDL = `
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='schema_migrations')
  CREATE TABLE schema_migrations (
    version NVARCHAR(32) PRIMARY KEY,
    applied_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  )
`.trim();

export class SqlserverSetup implements ISetup {
  constructor(private readonly options: SqlserverSetupOptions) {}

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

    const setupFile = path.join(dir, 'setup.sql');
    if (await pathExists(setupFile)) {
      await ds.query(await readFile(setupFile, 'utf-8'));
    }

    const files = await collectMigrationFiles(dir);

    const applied = new Set(
      (await ds.query<{ version: string }>('SELECT version FROM schema_migrations')).map(
        (r) => r.version,
      ),
    );

    for (const { file, version } of files) {
      if (applied.has(version)) continue;
      const sql = await readFile(path.join(dir, file), 'utf-8');
      await ds.query(sql);
      // `applied` already excludes versions we haven't run, so a plain
      // INSERT is safe. SQL Server's lack of a portable
      // ON CONFLICT DO NOTHING isn't a problem here.
      await ds.query('INSERT INTO schema_migrations (version) VALUES (@p1)', [version]);
    }
  }
}
