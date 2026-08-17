import type { Pool, PoolConfig } from 'pg';
import { IDatasource } from '../IDatasource';
import { resolveOwnedPool } from '../ownedPool';
import { runInTransactionAdapter } from '../runInTransactionAdapter';
import { PostgresTxnDatasource } from './PostgresTxnDatasource';

export interface PostgresDatasourceOptions {
  pool?: Pool;
  poolConfig?: PoolConfig;
}

const PG_INT8_OID = 20;

// pg returns BIGINT (int8) as a string to avoid >2^53 loss; biginteger maps to a JS number here, so parse it — matching sqlite/mysql, which already return numbers.
export function int8AsNumberTypes(pg: typeof import('pg')): NonNullable<PoolConfig['types']> {
  const parseInt8 = (value: string | null): number | null =>
    value === null ? null : Number(value);
  return {
    getTypeParser: (oid: number, format?: unknown) =>
      oid === PG_INT8_OID ? parseInt8 : pg.types.getTypeParser(oid, format as never),
  } as NonNullable<PoolConfig['types']>;
}

export class PostgresDatasource implements IDatasource {
  private pool: Pool | null = null;
  private readonly poolFactory: () => Promise<Pool>;
  private readonly ownsPool: boolean;

  constructor(options: PostgresDatasourceOptions) {
    const config = options.poolConfig ?? {};
    const owned = resolveOwnedPool<Pool>(options.pool, async () => {
      const pg = await import(/* @vite-ignore */ 'pg');
      const types = config.types ?? int8AsNumberTypes(pg);
      return new pg.Pool({ ...config, types });
    });
    this.pool = owned.pool;
    this.poolFactory = owned.poolFactory;
    this.ownsPool = owned.ownsPool;
  }

  async open(): Promise<void> {
    if (!this.pool) this.pool = await this.poolFactory();
  }

  async query<R = unknown>(sql: string, params: ReadonlyArray<unknown> = []): Promise<R[]> {
    const pool = this.requireOpen();
    const result = await pool.query(sql, params as unknown[]);
    return result.rows as R[];
  }

  async close(): Promise<void> {
    if (!this.pool) return;
    if (this.ownsPool) await this.pool.end();
    this.pool = null;
  }

  async runInTransaction<R>(fn: (txn: IDatasource) => Promise<R>): Promise<R> {
    const pool = this.requireOpen();
    return runInTransactionAdapter(
      {
        acquireConnection: () => pool.connect(),
        beginOnConnection: async (client) => {
          await client.query('BEGIN');
        },
        commitOnConnection: async (client) => {
          await client.query('COMMIT');
        },
        rollbackOnConnection: async (client) => {
          await client.query('ROLLBACK');
        },
        releaseConnection: async (client) => {
          client.release();
        },
        makeTxnDatasource: (client) => new PostgresTxnDatasource(client),
      },
      fn,
    );
  }

  raw(): Pool {
    return this.requireOpen();
  }

  private requireOpen(): Pool {
    if (!this.pool) {
      throw new Error('PostgresDatasource is not open. Call open() first.');
    }
    return this.pool;
  }
}
