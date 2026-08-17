import type { IDataSourceMiddleware } from '../../middleware/IDataSourceMiddleware';
import { ICrudRepository } from '../ICrudRepository';
import { quoteIdentifier } from '../sqlIdentifier';
import type { OracleDatasource } from './OracleDatasource';
import type { IPrimaryKeyService } from '../IPrimaryKeyService';
import { PrimaryKeyBearingRepository } from '../PrimaryKeyBearingRepository';

export interface OracleCrudRepositoryOptions {
  middlewares?: readonly IDataSourceMiddleware[];
  entityName: string;
  primaryKeys: IPrimaryKeyService;
}

export class OracleCrudRepository<T extends { id: number }>
  extends PrimaryKeyBearingRepository
  implements ICrudRepository<T>
{
  protected readonly tableName: string;
  protected readonly originalTableName: string;
  protected readonly middlewares: readonly IDataSourceMiddleware[];

  constructor(
    protected readonly datasource: OracleDatasource,
    tableName: string,
    options: OracleCrudRepositoryOptions,
  ) {
    super(options.entityName, options.primaryKeys);
    this.originalTableName = tableName;
    this.tableName = quoteIdentifier(tableName);
    this.middlewares = options.middlewares ?? [];
  }

  protected async runQuery<R>(sql: string, params?: ReadonlyArray<unknown>): Promise<R[]> {
    const provider = 'oracle' as const;
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
    const rows = await this.runQuery<T>(`SELECT * FROM ${this.tableName} WHERE "id" = :1`, [id]);
    return rows[0] ?? null;
  }

  async findAll(): Promise<T[]> {
    return this.runQuery<T>(`SELECT * FROM ${this.tableName} ORDER BY "id" ASC`);
  }

  async findBy(column: string, value: unknown): Promise<T[]> {
    return this.runQuery<T>(
      `SELECT * FROM ${this.tableName} WHERE ${quoteIdentifier(column)} = :1 ORDER BY "id" ASC`,
      [value],
    );
  }

  async findIn(column: string, values: ReadonlyArray<unknown>): Promise<T[]> {
    if (values.length === 0) return [];
    const placeholders = values.map((_, i) => `:${i + 1}`).join(', ');
    return this.runQuery<T>(
      `SELECT * FROM ${this.tableName} WHERE ${quoteIdentifier(column)} IN (${placeholders}) ORDER BY "id" ASC`,
      values,
    );
  }

  async add(data: Omit<T, 'id'>): Promise<T> {
    const entries = Object.entries(data as Record<string, unknown>);
    const columns = entries.map(([k]) => quoteIdentifier(k));
    const placeholders = entries.map((_, i) => `:${i + 1}`);
    const values = entries.map(([, v]) => v);

    const sql = `INSERT INTO ${this.tableName} (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING "id" INTO :${entries.length + 1}`;
    const id = await this.datasource.executeReturningId(sql, values);
    const row = await this.find(id);
    if (!row) throw new Error(`OracleCrudRepository.add(): inserted row id=${id} not found`);
    return row;
  }

  async update(id: number, data: Partial<Omit<T, 'id'>>): Promise<T | null> {
    const entries = Object.entries(data as Record<string, unknown>);
    if (entries.length === 0) return this.find(id);

    const setClauses = entries.map(([k], i) => `${quoteIdentifier(k)} = :${i + 1}`);
    const values = [...entries.map(([, v]) => v), id];

    const sql = `UPDATE ${this.tableName} SET ${setClauses.join(', ')} WHERE "id" = :${values.length}`;
    const [result] = await this.runQuery<{ rowsAffected: number }>(sql, values);
    if (result.rowsAffected === 0) return null;
    return this.find(id);
  }

  async delete(id: number): Promise<boolean> {
    const [result] = await this.runQuery<{ rowsAffected: number }>(
      `DELETE FROM ${this.tableName} WHERE "id" = :1`,
      [id],
    );
    return result.rowsAffected > 0;
  }

  async updateBy(column: string, value: unknown, data: Partial<Omit<T, 'id'>>): Promise<T[]> {
    const matched = await this.findBy(column, value);
    if (matched.length === 0) return [];

    const entries = Object.entries(data as Record<string, unknown>);
    if (entries.length === 0) return matched;

    const setClauses = entries.map(([k], i) => `${quoteIdentifier(k)} = :${i + 1}`);
    const values = [...entries.map(([, v]) => v), value];

    const sql = `UPDATE ${this.tableName} SET ${setClauses.join(', ')} WHERE ${quoteIdentifier(column)} = :${values.length}`;
    await this.runQuery(sql, values);

    const ids = matched.map((r) => (r as { id: number }).id);
    return this.findIn('id', ids);
  }

  async deleteBy(column: string, value: unknown): Promise<number> {
    const [result] = await this.runQuery<{ rowsAffected: number }>(
      `DELETE FROM ${this.tableName} WHERE ${quoteIdentifier(column)} = :1`,
      [value],
    );
    return result.rowsAffected;
  }
}
