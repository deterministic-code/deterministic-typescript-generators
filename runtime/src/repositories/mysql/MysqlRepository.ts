import type { IDataSourceMiddleware } from '../../middleware/IDataSourceMiddleware';
import { IRepository } from '../IRepository';
import { MysqlDatasource } from './MysqlDatasource';

export class MysqlRepository implements IRepository {
  constructor(
    protected readonly datasource: MysqlDatasource,
    protected readonly middlewares: readonly IDataSourceMiddleware[] = [],
  ) {}

  protected async runQuery<R>(sql: string, params?: ReadonlyArray<unknown>): Promise<R[]> {
    const provider = 'mysql' as const;
    let currentSql = sql;
    let currentParams = params;
    for (const m of this.middlewares) {
      const out = await m.beforeQuery(provider, currentSql, currentParams);
      if (out) {
        currentSql = out.query;
        currentParams = out.params;
      }
    }
    const start = performance.now();
    let results: R[] = [];
    let error: unknown;
    try {
      results = await this.datasource.query<R>(currentSql, currentParams);
      return results;
    } catch (e) {
      error = e;
      throw e;
    } finally {
      const elapsed = performance.now() - start;
      for (const m of this.middlewares) {
        await m.afterQuery(provider, currentSql, currentParams, results, elapsed, error);
      }
    }
  }

  async query<R = unknown>(sql: string, params?: ReadonlyArray<unknown>): Promise<R[]> {
    return this.runQuery<R>(sql, params);
  }
}
