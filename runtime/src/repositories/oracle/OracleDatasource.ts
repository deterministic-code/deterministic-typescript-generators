import type { Pool, PoolAttributes } from 'oracledb';
import { IDatasource } from '../IDatasource';
import { runInTransactionAdapter } from '../runInTransactionAdapter';
import { OracleTxnDatasource } from './OracleTxnDatasource';

export interface OracleDatasourceOptions {
  pool?: Pool;
  poolConfig?: PoolAttributes;
}

export interface OracleConnection {
  execute<R = unknown>(
    sql: string,
    binds?: unknown,
    options?: { outFormat?: number; autoCommit?: boolean },
  ): Promise<{
    rows?: R[];
    rowsAffected?: number;
    outBinds?: Record<string, unknown> | unknown[];
  }>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  close(): Promise<void>;
}

interface OraclePool {
  getConnection(): Promise<OracleConnection>;
  close(drainTimeSec?: number): Promise<void>;
}

export class OracleDatasource implements IDatasource {
  private pool: OraclePool | null = null;
  private readonly poolFactory: () => Promise<OraclePool>;
  private readonly ownsPool: boolean;

  constructor(options: OracleDatasourceOptions) {
    if (options.pool) {
      this.pool = options.pool as unknown as OraclePool;
      this.poolFactory = async () => options.pool as unknown as OraclePool;
      this.ownsPool = false;
    } else {
      const config = options.poolConfig;
      if (!config) {
        throw new Error('OracleDatasource requires either pool or poolConfig');
      }
      this.poolFactory = async () => {
        const mod = (await import(/* @vite-ignore */ 'oracledb')) as unknown as {
          default?: { createPool?: (c: PoolAttributes) => Promise<OraclePool> };
          createPool?: (c: PoolAttributes) => Promise<OraclePool>;
        };
        const createPool = mod.default?.createPool ?? mod.createPool;
        if (!createPool) {
          throw new Error('oracledb module does not expose createPool');
        }
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
    const conn = await pool.getConnection();
    try {
      const result = await conn.execute<R>(sql, [...params], {
        outFormat: 4002,
        autoCommit: true,
      });
      if (result.rows && result.rows.length > 0) return result.rows;
      if (result.rows) return [];
      return [{ rowsAffected: result.rowsAffected ?? 0 } as unknown as R];
    } finally {
      await conn.close();
    }
  }

  async executeReturningId(sql: string, params: ReadonlyArray<unknown> = []): Promise<number> {
    const pool = this.requireOpen();
    const conn = await pool.getConnection();
    try {
      const binds: unknown[] = [...params, { dir: 3003, type: 2010 }];
      const result = await conn.execute(sql, binds, { autoCommit: true });
      const out = result.outBinds as unknown[] | Record<string, unknown[]>;
      if (Array.isArray(out)) {
        const last = out[out.length - 1] as unknown[] | number | undefined;
        if (Array.isArray(last)) return Number(last[0]);
        return Number(last);
      }
      const values = Object.values(out ?? {});
      const last = values[values.length - 1] as unknown[] | number | undefined;
      if (Array.isArray(last)) return Number(last[0]);
      return Number(last);
    } finally {
      await conn.close();
    }
  }

  async runInTransaction<R>(fn: (txn: IDatasource) => Promise<R>): Promise<R> {
    const pool = this.requireOpen();
    return runInTransactionAdapter(
      {
        acquireConnection: () => pool.getConnection(),
        beginOnConnection: async () => {
          // no-op: Oracle does not have explicit BEGIN; transaction is implicit when autoCommit is false
        },
        commitOnConnection: async (conn) => {
          await conn.commit();
        },
        rollbackOnConnection: async (conn) => {
          await conn.rollback();
        },
        releaseConnection: async (conn) => {
          await conn.close();
        },
        makeTxnDatasource: (conn) => new OracleTxnDatasource(conn),
      },
      fn,
    );
  }

  async close(): Promise<void> {
    if (!this.pool) return;
    if (this.ownsPool) await this.pool.close(0);
    this.pool = null;
  }

  raw(): OraclePool {
    return this.requireOpen();
  }

  private requireOpen(): OraclePool {
    if (!this.pool) {
      throw new Error('OracleDatasource is not open. Call open() first.');
    }
    return this.pool;
  }
}
