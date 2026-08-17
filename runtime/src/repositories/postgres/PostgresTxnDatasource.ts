import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { IDatasource } from '../IDatasource';
import { runInTransactionAdapter } from '../runInTransactionAdapter';

// solid-i-allow: txn datasource wraps a borrowed connection; open()/close() are intentional no-ops until IDatasource separates connection lifecycle from query.
export class PostgresTxnDatasource implements IDatasource {
  constructor(private readonly client: PoolClient) {}

  async open(): Promise<void> {
    // no-op: txn datasource does not own connection lifecycle
  }

  async close(): Promise<void> {
    // no-op: txn datasource does not own connection lifecycle
  }

  async query<R = unknown>(sql: string, params: ReadonlyArray<unknown> = []): Promise<R[]> {
    const result = await this.client.query(sql, params as unknown[]);
    return result.rows as R[];
  }

  async runInTransaction<R>(fn: (txn: IDatasource) => Promise<R>): Promise<R> {
    const savepointName = `sp_${randomUUID().replace(/-/g, '_')}`;
    return runInTransactionAdapter<PoolClient, R>(
      {
        acquireConnection: async () => this.client,
        beginOnConnection: async (c) => {
          await c.query(`SAVEPOINT ${savepointName}`);
        },
        commitOnConnection: async (c) => {
          await c.query(`RELEASE SAVEPOINT ${savepointName}`);
        },
        rollbackOnConnection: async (c) => {
          await c.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
          await c.query(`RELEASE SAVEPOINT ${savepointName}`);
        },
        releaseConnection: async () => {
          // no-op: we don't own the connection
        },
        makeTxnDatasource: (c) => new PostgresTxnDatasource(c),
      },
      fn,
    );
  }
}
