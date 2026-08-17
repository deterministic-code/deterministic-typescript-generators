import { randomUUID } from 'node:crypto';
import type { IDatasource } from '../IDatasource';
import { runInTransactionAdapter } from '../runInTransactionAdapter';
import type { OracleConnection } from './OracleDatasource';

// solid-i-allow: txn datasource wraps a borrowed connection; open()/close() are intentional no-ops until IDatasource separates connection lifecycle from query.
export class OracleTxnDatasource implements IDatasource {
  constructor(private readonly conn: OracleConnection) {}

  async open(): Promise<void> {
    // no-op: txn datasource does not own connection lifecycle
  }

  async close(): Promise<void> {
    // no-op: txn datasource does not own connection lifecycle
  }

  async query<R = unknown>(sql: string, params: ReadonlyArray<unknown> = []): Promise<R[]> {
    const result = await this.conn.execute<R>(sql, [...params], {
      outFormat: 4002,
      autoCommit: false,
    });
    if (result.rows && result.rows.length > 0) return result.rows;
    if (result.rows) return [];
    return [{ rowsAffected: result.rowsAffected ?? 0 } as unknown as R];
  }

  async runInTransaction<R>(fn: (txn: IDatasource) => Promise<R>): Promise<R> {
    const savepointName = `sp_${randomUUID().replace(/-/g, '_').slice(0, 28)}`;
    return runInTransactionAdapter<OracleConnection, R>(
      {
        acquireConnection: async () => this.conn,
        beginOnConnection: async (c) => {
          await c.execute(`SAVEPOINT ${savepointName}`, [], { autoCommit: false });
        },
        commitOnConnection: async () => {
          // no-op: oracle releases savepoints on outer commit
        },
        rollbackOnConnection: async (c) => {
          await c.execute(`ROLLBACK TO SAVEPOINT ${savepointName}`, [], { autoCommit: false });
        },
        releaseConnection: async () => {
          // no-op: we don't own the connection
        },
        makeTxnDatasource: (c) => new OracleTxnDatasource(c),
      },
      fn,
    );
  }
}
