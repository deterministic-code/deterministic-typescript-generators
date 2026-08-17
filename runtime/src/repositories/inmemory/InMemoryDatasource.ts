import type { IDatasource } from '../IDatasource';

export interface InMemoryTable {
  rows: unknown[];
  nextId: number;
}

// solid-i-allow: in-memory backend has no connection or raw-SQL surface; open()/query() intentionally refuse until IDatasource splits lifecycle and raw-query out.
export class InMemoryDatasource implements IDatasource {
  private tables = new Map<string, InMemoryTable>();

  getTable(name: string): InMemoryTable {
    if (!this.tables.has(name)) {
      this.tables.set(name, { rows: [], nextId: 1 });
    }
    return this.tables.get(name)!;
  }

  async open(): Promise<void> {}

  async close(): Promise<void> {
    this.tables.clear();
  }

  async query<R = unknown>(_sql: string, _params?: ReadonlyArray<unknown>): Promise<R[]> {
    throw new Error('InMemory backend does not support raw SQL queries');
  }

  async runInTransaction<R>(fn: (txn: IDatasource) => Promise<R>): Promise<R> {
    const snapshot = new Map(
      [...this.tables.entries()].map(([k, v]) => [
        k,
        { rows: structuredClone(v.rows), nextId: v.nextId },
      ]),
    );

    try {
      const result = await fn(this);
      return result;
    } catch (e) {
      snapshot.forEach((snapshotTable, key) => {
        const currentTable = this.tables.get(key);
        if (currentTable) {
          currentTable.rows = snapshotTable.rows;
          currentTable.nextId = snapshotTable.nextId;
        }
      });
      throw e;
    }
  }
}
