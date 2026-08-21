import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { ISetup } from '../ISetup';
import { pathExists } from '../pathExists';
import { collectMigrationFiles } from '../collectMigrationFiles';
import type { OracleDatasource } from './OracleDatasource';

export interface OracleSetupOptions {
  datasource: OracleDatasource;
  migrationsDir?: string;
  seedFile?: string;
}

const SCHEMA_MIGRATIONS_DDL = `
DECLARE
  v_count NUMBER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM user_tables WHERE table_name = 'SCHEMA_MIGRATIONS';
  IF v_count = 0 THEN
    EXECUTE IMMEDIATE 'CREATE TABLE schema_migrations (version VARCHAR2(32) PRIMARY KEY, applied_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL)';
  END IF;
END;
`.trim();

export class OracleSetup implements ISetup {
  constructor(private readonly options: OracleSetupOptions) {}

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
      (
        await ds.query<{ VERSION: string } | { version: string }>(
          'SELECT version FROM schema_migrations',
        )
      ).map((r) => (r as Record<string, string>).VERSION ?? (r as Record<string, string>).version),
    );

    for (const { file, version } of files) {
      if (applied.has(version)) continue;
      const sql = await readFile(path.join(dir, file), 'utf-8');
      await ds.query(sql);
      // `applied` already filters out previously-run versions, so a
      // plain INSERT is safe even though Oracle lacks ON CONFLICT.
      await ds.query('INSERT INTO schema_migrations (version) VALUES (:1)', [version]);
    }
  }
}
