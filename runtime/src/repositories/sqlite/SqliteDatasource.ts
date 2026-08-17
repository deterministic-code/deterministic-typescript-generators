import type Database from 'better-sqlite3';
import { IDatasource } from '../IDatasource';
import { runInTransactionAdapter } from '../runInTransactionAdapter';
import { SqliteTxnDatasource } from './SqliteTxnDatasource';

export interface SqliteDatasourceOptions {
  dbPath: string;
  pragmas?: string[];
}

export class SqliteDatasource implements IDatasource {
  private db: Database.Database | null = null;

  constructor(private readonly options: SqliteDatasourceOptions) {}

  async open(): Promise<void> {
    if (this.db) return;
    const { default: DatabaseCtor } = await import(/* @vite-ignore */ 'better-sqlite3');
    this.db = new DatabaseCtor(this.options.dbPath);
    const pragmas = this.options.pragmas ?? ['journal_mode = WAL', 'foreign_keys = ON'];
    for (const pragma of pragmas) {
      this.db.pragma(pragma);
    }
  }

  async query<R = unknown>(sql: string, params: ReadonlyArray<unknown> = []): Promise<R[]> {
    const db = this.requireOpen();
    const stmt = db.prepare(sql);
    if (stmt.reader) {
      return stmt.all(...(params as unknown[])) as R[];
    }
    const result = stmt.run(...(params as unknown[]));
    return [{ changes: result.changes, lastInsertRowid: result.lastInsertRowid } as R];
  }

  async close(): Promise<void> {
    if (!this.db) return;
    this.db.close();
    this.db = null;
  }

  raw(): Database.Database {
    return this.requireOpen();
  }

  async runInTransaction<R>(fn: (txn: IDatasource) => Promise<R>): Promise<R> {
    const db = this.requireOpen();
    return runInTransactionAdapter<Database.Database, R>(
      {
        acquireConnection: async () => db,
        beginOnConnection: async (d) => {
          // why BEGIN IMMEDIATE: BEGIN (DEFERRED) acquires a read snapshot lazily and then upgrades to a writer lock on first write. In WAL mode with multiple connections to the same file (e.g. cross-process), that upgrade fails immediately with SQLITE_BUSY_SNAPSHOT (extended code 517) when another connection has committed since the snapshot — and busy_timeout does NOT retry on 517. better-sqlite3's single-connection synchronous nature hides this in-process today, but BEGIN IMMEDIATE keeps the txn correct under any future multi-connection or cross-process use; mirrors the rust sqlite datasource fix in #1099.
          d.prepare('BEGIN IMMEDIATE').run();
        },
        commitOnConnection: async (d) => {
          d.prepare('COMMIT').run();
        },
        rollbackOnConnection: async (d) => {
          d.prepare('ROLLBACK').run();
        },
        releaseConnection: async () => {
          // no-op: we don't own the connection
        },
        makeTxnDatasource: (d) => new SqliteTxnDatasource(d),
      },
      fn,
    );
  }

  private requireOpen(): Database.Database {
    if (!this.db) {
      throw new Error('SqliteDatasource is not open. Call open() first.');
    }
    return this.db;
  }
}
