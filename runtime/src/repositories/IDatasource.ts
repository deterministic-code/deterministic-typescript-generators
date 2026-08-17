export interface IDatasource {
  open(): Promise<void>;
  query<R = unknown>(sql: string, params?: ReadonlyArray<unknown>): Promise<R[]>;
  close(): Promise<void>;
  runInTransaction<R>(fn: (txn: IDatasource) => Promise<R>): Promise<R>;
}
