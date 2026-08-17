import type { IDataSourceMiddleware } from '../../middleware/IDataSourceMiddleware';
import { ICrudRepository } from '../ICrudRepository';
import { quoteSqlserverIdentifier } from '../sqlIdentifier';
import type { SqlserverDatasource } from './SqlserverDatasource';
import type { IPrimaryKeyService } from '../IPrimaryKeyService';
import { PrimaryKeyBearingRepository } from '../PrimaryKeyBearingRepository';

export interface SqlserverCrudRepositoryOptions {
  middlewares?: readonly IDataSourceMiddleware[];
  entityName: string;
  primaryKeys: IPrimaryKeyService;
}

export class SqlserverCrudRepository<T extends { id: number }>
  extends PrimaryKeyBearingRepository
  implements ICrudRepository<T>
{
  protected readonly tableName: string;
  protected readonly originalTableName: string;
  protected readonly middlewares: readonly IDataSourceMiddleware[];

  constructor(
    protected readonly datasource: SqlserverDatasource,
    tableName: string,
    options: SqlserverCrudRepositoryOptions,
  ) {
    super(options.entityName, options.primaryKeys);
    this.originalTableName = tableName;
    this.tableName = quoteSqlserverIdentifier(tableName);
    this.middlewares = options.middlewares ?? [];
  }

  protected async runQuery<R>(sql: string, params?: ReadonlyArray<unknown>): Promise<R[]> {
    const provider = 'sqlserver' as const;
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

  async find(id: number): Promise<T | null> {
    const rows = await this.runQuery<T>(`SELECT * FROM ${this.tableName} WHERE [id] = @p1`, [id]);
    return rows[0] ?? null;
  }

  async findAll(): Promise<T[]> {
    return this.runQuery<T>(`SELECT * FROM ${this.tableName} ORDER BY [id] ASC`);
  }

  async findBy(column: string, value: unknown): Promise<T[]> {
    return this.runQuery<T>(
      `SELECT * FROM ${this.tableName} WHERE ${quoteSqlserverIdentifier(column)} = @p1 ORDER BY [id] ASC`,
      [value],
    );
  }

  async findIn(column: string, values: ReadonlyArray<unknown>): Promise<T[]> {
    if (values.length === 0) return [];
    const placeholders = values.map((_, i) => `@p${i + 1}`).join(', ');
    return this.runQuery<T>(
      `SELECT * FROM ${this.tableName} WHERE ${quoteSqlserverIdentifier(column)} IN (${placeholders}) ORDER BY [id] ASC`,
      values,
    );
  }

  async add(data: Omit<T, 'id'>): Promise<T> {
    const entries = Object.entries(data as Record<string, unknown>);
    const columns = entries.map(([k]) => quoteSqlserverIdentifier(k));
    const placeholders = entries.map((_, i) => `@p${i + 1}`);
    const values = entries.map(([, v]) => v);

    const sql = `INSERT INTO ${this.tableName} (${columns.join(', ')}) OUTPUT INSERTED.* VALUES (${placeholders.join(', ')})`;
    const rows = await this.runQuery<T>(sql, values);
    return rows[0];
  }

  async update(id: number, data: Partial<Omit<T, 'id'>>): Promise<T | null> {
    const entries = Object.entries(data as Record<string, unknown>);
    if (entries.length === 0) return this.find(id);

    const setClauses = entries.map(([k], i) => `${quoteSqlserverIdentifier(k)} = @p${i + 1}`);
    const values = [...entries.map(([, v]) => v), id];

    const sql = `UPDATE ${this.tableName} SET ${setClauses.join(', ')} OUTPUT INSERTED.* WHERE [id] = @p${values.length}`;
    const rows = await this.runQuery<T>(sql, values);
    return rows[0] ?? null;
  }

  async delete(id: number): Promise<boolean> {
    const sql = `DELETE FROM ${this.tableName} OUTPUT DELETED.[id] WHERE [id] = @p1`;
    const rows = await this.runQuery<{ id: number }>(sql, [id]);
    return rows.length > 0;
  }

  async updateBy(column: string, value: unknown, data: Partial<Omit<T, 'id'>>): Promise<T[]> {
    const entries = Object.entries(data as Record<string, unknown>);
    if (entries.length === 0) return this.findBy(column, value);

    const setClauses = entries.map(([k], i) => `${quoteSqlserverIdentifier(k)} = @p${i + 1}`);
    const values = [...entries.map(([, v]) => v), value];

    const sql = `UPDATE ${this.tableName} SET ${setClauses.join(', ')} OUTPUT INSERTED.* WHERE ${quoteSqlserverIdentifier(column)} = @p${values.length}`;
    return this.runQuery<T>(sql, values);
  }

  async deleteBy(column: string, value: unknown): Promise<number> {
    const sql = `DELETE FROM ${this.tableName} OUTPUT DELETED.[id] WHERE ${quoteSqlserverIdentifier(column)} = @p1`;
    const rows = await this.runQuery<{ id: number }>(sql, [value]);
    return rows.length;
  }
}
