export interface IRepository {
  query<R = unknown>(sql: string, params?: ReadonlyArray<unknown>): Promise<R[]>;
}
