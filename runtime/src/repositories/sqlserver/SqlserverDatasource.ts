import type { ConnectionPool, config as MssqlConfig } from 'mssql';
import { IDatasource } from '../IDatasource';
import { runInTransactionAdapter } from '../runInTransactionAdapter';
import { SqlserverTxnDatasource } from './SqlserverTxnDatasource';

export interface SqlserverDatasourceOptions {
  pool?: ConnectionPool;
  poolConfig?: MssqlConfig;
}

interface MssqlRequest {
  input(name: string, value: unknown): MssqlRequest;
  query<R = unknown>(text: string): Promise<{ recordset: R[]; rowsAffected: number[] }>;
}

interface MssqlTransaction {
  begin(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  request(): MssqlRequest;
}

interface MssqlPool {
  connect(): Promise<MssqlPool>;
  request(): MssqlRequest;
  close(): Promise<void>;
  transaction(): MssqlTransaction;
}

export class SqlserverDatasource implements IDatasource {
  private pool: MssqlPool | null = null;
  private readonly poolFactory: () => Promise<MssqlPool>;
  private readonly ownsPool: boolean;
  private connected = false;

  constructor(options: SqlserverDatasourceOptions) {
    if (options.pool) {
      this.pool = options.pool as unknown as MssqlPool;
      this.poolFactory = async () => options.pool as unknown as MssqlPool;
      this.ownsPool = false;
    } else {
      const config = options.poolConfig;
      if (!config) {
        throw new Error('SqlserverDatasource requires either pool or poolConfig');
      }
      this.poolFactory = async () => {
        const { ConnectionPool } = await import(/* @vite-ignore */ 'mssql');
        return new ConnectionPool(config) as unknown as MssqlPool;
      };
      this.ownsPool = true;
    }
  }

  async open(): Promise<void> {
    if (!this.pool) this.pool = await this.poolFactory();
    if (!this.connected && this.ownsPool) {
      await this.pool.connect();
      this.connected = true;
    }
  }

  async query<R = unknown>(sqlText: string, params: ReadonlyArray<unknown> = []): Promise<R[]> {
    const pool = this.requireOpen();
    const request = pool.request();
    params.forEach((v, i) => request.input(`p${i + 1}`, v));
    const result = await request.query<R>(sqlText);
    if (Array.isArray(result.recordset) && result.recordset.length > 0) {
      return result.recordset;
    }
    if (Array.isArray(result.recordset)) {
      return result.recordset;
    }
    return [{ rowsAffected: result.rowsAffected[0] ?? 0 } as unknown as R];
  }

  async close(): Promise<void> {
    if (!this.pool) return;
    if (this.ownsPool) await this.pool.close();
    this.pool = null;
    this.connected = false;
  }

  async runInTransaction<R>(fn: (txn: IDatasource) => Promise<R>): Promise<R> {
    const pool = this.requireOpen();
    return runInTransactionAdapter<MssqlTransaction, R>(
      {
        acquireConnection: async () => {
          const txn = pool.transaction();
          return txn;
        },
        beginOnConnection: async (txn) => {
          await txn.begin();
        },
        commitOnConnection: async (txn) => {
          await txn.commit();
        },
        rollbackOnConnection: async (txn) => {
          await txn.rollback();
        },
        releaseConnection: async () => {
          // no-op: mssql cleans up Transaction internally on commit/rollback
        },
        makeTxnDatasource: (txn) => new SqlserverTxnDatasource(txn),
      },
      fn,
    );
  }

  raw(): MssqlPool {
    return this.requireOpen();
  }

  private requireOpen(): MssqlPool {
    if (!this.pool) {
      throw new Error('SqlserverDatasource is not open. Call open() first.');
    }
    return this.pool;
  }
}
