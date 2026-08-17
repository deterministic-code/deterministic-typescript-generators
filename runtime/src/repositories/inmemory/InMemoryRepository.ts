import type { IDataSourceMiddleware } from '../../middleware/IDataSourceMiddleware';
import type { InMemoryDatasource } from './InMemoryDatasource';
import { IRepository } from '../IRepository';

// solid-i-allow: in-memory backend has no raw-SQL surface; query() intentionally refuses until IRepository separates raw-query from CRUD.
export class InMemoryRepository implements IRepository {
  constructor(
    protected readonly datasource: InMemoryDatasource,
    protected readonly middlewares: readonly IDataSourceMiddleware[] = [],
  ) {}

  async query<R = unknown>(_sql: string, _params?: ReadonlyArray<unknown>): Promise<R[]> {
    throw new Error('InMemory backend does not support raw SQL queries');
  }
}
