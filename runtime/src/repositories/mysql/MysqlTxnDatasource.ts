import type { PoolConnection } from 'mysql2/promise';
import { randomUUID } from 'crypto';
import type { IDatasource } from '../IDatasource';
import { runInTransactionAdapter } from '../runInTransactionAdapter';

// solid-i-allow: txn datasource wraps a borrowed connection; open()/close() are intentional no-ops until IDatasource separates connection lifecycle from query.
export class MysqlTxnDatasource implements IDatasource {
  constructor(private readonly connection: PoolConnection) {}

  async open(): Promise<void> {}

  async query<R = unknown>(sql: string, params: ReadonlyArray<unknown> = []): Promise<R[]> {
    const [result] = await this.connection.query(sql, params as unknown[]);
    if (Array.isArray(result)) return result as R[];
    return [result as R];
  }

  async close(): Promise<void> {}

  async runInTransaction<R>(fn: (txn: IDatasource) => Promise<R>): Promise<R> {
    const savepointName = `sp_${randomUUID().replace(/-/g, '_')}`;

    return runInTransactionAdapter<PoolConnection, R>(
      {
        acquireConnection: async () => this.connection,
        beginOnConnection: async (conn) => {
          await conn.query(`SAVEPOINT ${savepointName}`);
        },
        commitOnConnection: async (conn) => {
          await conn.query(`RELEASE SAVEPOINT ${savepointName}`);
        },
        rollbackOnConnection: async (conn) => {
          await conn.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
        },
        releaseConnection: async () => {
          // no-op: the outer datasource owns the connection lifecycle
        },
        makeTxnDatasource: (conn) => new MysqlTxnDatasource(conn),
      },
      fn,
    );
  }
}
