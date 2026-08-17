import { randomUUID } from 'node:crypto';
import type { IDatasource } from '../IDatasource';
import { runInTransactionAdapter } from '../runInTransactionAdapter';

interface MssqlRequest {
  input(name: string, value: unknown): MssqlRequest;
  query<R = unknown>(text: string): Promise<{ recordset: R[]; rowsAffected: number[] }>;
}

interface MssqlTransaction {
  request(): MssqlRequest;
}

// solid-i-allow: txn datasource wraps a borrowed connection; open()/close() are intentional no-ops until IDatasource separates connection lifecycle from query.
export class SqlserverTxnDatasource implements IDatasource {
  constructor(private readonly txn: MssqlTransaction) {}

  async open(): Promise<void> {
    // no-op: txn datasource does not own connection lifecycle
  }

  async close(): Promise<void> {
    // no-op: txn datasource does not own connection lifecycle
  }

  async query<R = unknown>(sqlText: string, params: ReadonlyArray<unknown> = []): Promise<R[]> {
    const request = this.txn.request();
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

  async runInTransaction<R>(fn: (txn: IDatasource) => Promise<R>): Promise<R> {
    const savepointName = `sp_${randomUUID().replace(/-/g, '_').slice(0, 30)}`;
    return runInTransactionAdapter<MssqlTransaction, R>(
      {
        acquireConnection: async () => this.txn,
        beginOnConnection: async (txn) => {
          const request = txn.request();
          await request.query(`SAVE TRANSACTION ${savepointName}`);
        },
        commitOnConnection: async () => {
          // no-op: mssql savepoints are released implicitly by outer COMMIT
        },
        rollbackOnConnection: async (txn) => {
          const request = txn.request();
          await request.query(`ROLLBACK TRANSACTION ${savepointName}`);
        },
        releaseConnection: async () => {
          // no-op: we don't own the connection
        },
        makeTxnDatasource: (txn) => new SqlserverTxnDatasource(txn),
      },
      fn,
    );
  }
}
