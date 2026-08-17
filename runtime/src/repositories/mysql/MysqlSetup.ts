import { readFile, readdir } from 'node:fs/promises';
import * as path from 'node:path';
import { ISetup } from '../ISetup';
import { pathExists } from '../pathExists';
import { MysqlDatasource } from './MysqlDatasource';

export interface MysqlSetupOptions {
  datasource: MysqlDatasource;
  migrationsDir?: string;
  seedFile?: string;
}

const SCHEMA_MIGRATIONS_DDL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(32) PRIMARY KEY,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
)
`.trim();

export class MysqlSetup implements ISetup {
  constructor(private readonly options: MysqlSetupOptions) {}

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
    // matches the SqliteSetup / PostgresSetup contract.
    const setupFile = path.join(dir, 'setup.sql');
    if (await pathExists(setupFile)) {
      await runSqlScript(ds, await readFile(setupFile, 'utf-8'));
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
      await runSqlScript(ds, sql);
      // INSERT IGNORE keeps re-runs of a partial chain idempotent —
      // mirror of postgres's ON CONFLICT DO NOTHING.
      await ds.query('INSERT IGNORE INTO schema_migrations (version) VALUES (?)', [version]);
    }
  }
}

// mysql2's pool.query() rejects multi-statement SQL by default, but the
// emitted migration files contain CREATE TABLE + CREATE TRIGGER + INSERT
// in a single file. Enabling multipleStatements on the pool would widen
// the SQL-injection surface for every consumer query — instead split on
// `;` boundaries here and dispatch one statement at a time. Quote- and
// comment-aware so string literals containing `;` don't fool the splitter.
//
// `GO` on its own line is treated as a batch separator (SQL Server / Sybase
// convention, reused here as the cross-dialect marker). Each batch is sent
// as one statement to mysql2 — CREATE PROCEDURE bodies contain internal `;`
// that the per-statement splitter must NOT split on, so they ride atomically
// inside a single GO-bounded batch. `DELIMITER` is a CLI-only directive and
// is not emitted — it's only used by the `mysql` shell, not the driver.
async function runSqlScript(ds: MysqlDatasource, sql: string): Promise<void> {
  for (const batch of splitOnGoBatches(sql)) {
    if (isAtomicBatch(batch)) {
      await ds.query(batch);
      continue;
    }
    for (const stmt of splitSqlStatements(batch)) {
      await ds.query(stmt);
    }
  }
}

function splitOnGoBatches(sql: string): string[] {
  const batches: string[] = [];
  let current: string[] = [];
  for (const rawLine of sql.split(/\r?\n/)) {
    const stripped = rawLine.replace(/--.*$/, '').trim();
    if (stripped === 'GO') {
      const batch = current.join('\n').trim();
      if (batch) batches.push(batch);
      current = [];
      continue;
    }
    current.push(rawLine);
  }
  const tail = current.join('\n').trim();
  if (tail) batches.push(tail);
  return batches;
}

function isAtomicBatch(batch: string): boolean {
  const head = batch.replace(/^--.*$/gm, '').trimStart();
  return /^(CREATE\s+(OR\s+REPLACE\s+|OR\s+ALTER\s+)?(PROCEDURE|FUNCTION|TRIGGER|EVENT)\b)/i.test(
    head,
  );
}

function splitSqlStatements(sql: string): string[] {
  const out: string[] = [];
  let current = '';
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (ch === '-' && next === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      current += ch;
      i++;
      while (i < sql.length) {
        if (sql[i] === '\\') {
          current += sql[i] + (sql[i + 1] ?? '');
          i += 2;
          continue;
        }
        if (sql[i] === quote) {
          current += sql[i];
          i++;
          break;
        }
        current += sql[i];
        i++;
      }
      continue;
    }
    if (ch === ';') {
      const stmt = current.trim();
      if (stmt) out.push(stmt);
      current = '';
      i++;
      continue;
    }
    current += ch;
    i++;
  }
  const tail = current.trim();
  if (tail) out.push(tail);
  return out;
}

const LEGACY_PATTERN = /^V(\d+)__(.+)\.sql$/;
const NEW_PATTERN = /^(\d+)_(.+)_up\.sql$/;

interface MigrationFile {
  file: string;
  version: string;
  sortKey: number;
}

async function collectMigrationFiles(dir: string): Promise<MigrationFile[]> {
  const out: MigrationFile[] = [];
  for (const file of await readdir(dir)) {
    const legacy = LEGACY_PATTERN.exec(file);
    if (legacy) {
      out.push({
        file,
        version: `V${legacy[1]}`,
        sortKey: parseInt(legacy[1], 10),
      });
      continue;
    }
    const next = NEW_PATTERN.exec(file);
    if (next) {
      out.push({
        file,
        version: `${next[1]}_${next[2]}`,
        sortKey: parseInt(next[1], 10),
      });
    }
  }
  return out.sort((a, b) => a.sortKey - b.sortKey);
}
