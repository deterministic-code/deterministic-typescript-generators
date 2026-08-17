import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { IDatasource } from '../IDatasource';
import { runInTransactionAdapter } from '../runInTransactionAdapter';

// solid-i-allow: txn datasource wraps a borrowed connection; open()/close() are intentional no-ops until IDatasource separates connection lifecycle from query.
export class SqliteTxnDatasource implements IDatasource {
  constructor(private readonly db: Database.Database) {}

  async open(): Promise<void> {
    // no-op: txn datasource does not own connection lifecycle
  }

  async close(): Promise<void> {
    // no-op: txn datasource does not own connection lifecycle
  }

  async query<R = unknown>(sql: string, params: ReadonlyArray<unknown> = []): Promise<R[]> {
    const stmt = this.db.prepare(sql);
    if (stmt.reader) {
      return stmt.all(...(params as unknown[])) as R[];
    }
    const result = stmt.run(...(params as unknown[]));
    return [{ changes: result.changes, lastInsertRowid: result.lastInsertRowid } as R];
  }

  async runInTransaction<R>(fn: (txn: IDatasource) => Promise<R>): Promise<R> {
    const savepointName = `sp_${randomUUID().replace(/-/g, '_')}`;
    return runInTransactionAdapter<Database.Database, R>(
      {
        acquireConnection: async () => this.db,
        beginOnConnection: async (d) => {
          d.prepare(`SAVEPOINT ${savepointName}`).run();
        },
        commitOnConnection: async (d) => {
          d.prepare(`RELEASE SAVEPOINT ${savepointName}`).run();
        },
        rollbackOnConnection: async (d) => {
          d.prepare(`ROLLBACK TO SAVEPOINT ${savepointName}`).run();
          d.prepare(`RELEASE SAVEPOINT ${savepointName}`).run();
        },
        releaseConnection: async () => {
          // no-op: we don't own the connection
        },
        makeTxnDatasource: (d) => new SqliteTxnDatasource(d),
      },
      fn,
    );
  }

  raw(): Database.Database {
    return this.db;
  }
}
