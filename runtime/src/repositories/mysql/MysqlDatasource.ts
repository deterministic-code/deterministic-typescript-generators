import type { Pool, PoolConnection, PoolOptions } from 'mysql2/promise';
import { IDatasource } from '../IDatasource';
import { runInTransactionAdapter } from '../runInTransactionAdapter';
import { MysqlTxnDatasource } from './MysqlTxnDatasource';

export interface MysqlDatasourceOptions {
  pool?: Pool;
  poolConfig?: PoolOptions;
}

export class MysqlDatasource implements IDatasource {
  private pool: Pool | null = null;
  private readonly poolFactory: () => Promise<Pool>;
  private readonly ownsPool: boolean;

  constructor(options: MysqlDatasourceOptions) {
    if (options.pool) {
      this.pool = options.pool;
      this.poolFactory = async () => options.pool!;
      this.ownsPool = false;
    } else {
      // mysql2 formats bound Date params in the pool's `timezone` (default 'local'); pin UTC so datetime values round-trip as the instant the converter produced, not the host offset.
      const config: PoolOptions = { timezone: 'Z', ...(options.poolConfig ?? {}) };
      this.poolFactory = async () => {
        const { createPool } = await import(/* @vite-ignore */ 'mysql2/promise');
        return createPool(config);
      };
      this.ownsPool = true;
    }
  }

  async open(): Promise<void> {
    if (!this.pool) this.pool = await this.poolFactory();
  }

  async query<R = unknown>(sql: string, params: ReadonlyArray<unknown> = []): Promise<R[]> {
    const pool = this.requireOpen();
    const [result] = await pool.query(sql, params as unknown[]);
    if (Array.isArray(result)) return result as R[];
    return [result as R];
  }

  async close(): Promise<void> {
    if (!this.pool) return;
    if (this.ownsPool) await this.pool.end();
    this.pool = null;
  }

  async runInTransaction<R>(fn: (txn: IDatasource) => Promise<R>): Promise<R> {
    const pool = this.requireOpen();

    return runInTransactionAdapter<PoolConnection, R>(
      {
        acquireConnection: async () => await pool.getConnection(),
        beginOnConnection: async (conn) => {
          await conn.beginTransaction();
        },
        commitOnConnection: async (conn) => {
          await conn.commit();
        },
        rollbackOnConnection: async (conn) => {
          await conn.rollback();
        },
        releaseConnection: async (conn) => {
          conn.release();
        },
        makeTxnDatasource: (conn) => new MysqlTxnDatasource(conn),
      },
      fn,
    );
  }

  raw(): Pool {
    return this.requireOpen();
  }

  private requireOpen(): Pool {
    if (!this.pool) {
      throw new Error('MysqlDatasource is not open. Call open() first.');
    }
    return this.pool;
  }
}
