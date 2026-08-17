import { randomUUID } from 'node:crypto';
import type { InMemoryDatasource } from './InMemoryDatasource';
import type { InMemoryTable } from './InMemoryDatasource';
import { nextInMemoryId } from './nextInMemoryId';
import { IStandardCrudRepository } from '../IStandardCrudRepository';
import { PrimaryKey } from '../PrimaryKey';
import type { IPrimaryKeyService } from '../IPrimaryKeyService';
import type { StandardIdType } from '../standardFieldConverting';
import { StandardDataSource } from '../../types/StandardDataSource';
import { columnValueMatches } from './columnValueMatches';

export interface InMemoryStandardRepositoryOptions {
  entityName: string;
  primaryKeys: IPrimaryKeyService;
  withUuidColumn?: boolean;
}

// solid-i-allow: in-memory backend has no raw-SQL surface; query() intentionally refuses until IStandardCrudRepository separates raw-query from CRUD.
export class InMemoryStandardRepository<
  T extends StandardDataSource<TId, TDate>,
  TId = number,
  TDate = string,
> implements IStandardCrudRepository<T, TId, TDate> {
  protected readonly table: InMemoryTable;
  readonly entityName: string;
  readonly primaryKey: PrimaryKey;
  protected readonly idType: StandardIdType;
  protected readonly withUuidColumn: boolean;
  protected readonly nextUuidId: () => string;

  constructor(
    datasource: InMemoryDatasource,
    tableName: string,
    options: InMemoryStandardRepositoryOptions,
  ) {
    this.table = datasource.getTable(tableName);
    this.entityName = options.entityName;
    this.primaryKey = options.primaryKeys.forEntity(options.entityName);
    this.idType = this.primaryKey.idType;
    this.withUuidColumn = options.withUuidColumn ?? true;
    this.nextUuidId = () => randomUUID();
  }

  async query<R = unknown>(_sql: string, _params?: ReadonlyArray<unknown>): Promise<R[]> {
    throw new Error('InMemory backend does not support raw SQL queries');
  }

  async find(id: TId): Promise<T | null> {
    return (this.table.rows.find((r) => (r as T).id === id) ?? null) as T | null;
  }

  async findAll(): Promise<T[]> {
    return [...(this.table.rows as T[])].sort((a, b) => {
      const aId = (a as T).id;
      const bId = (b as T).id;
      if (typeof aId === 'number' && typeof bId === 'number') {
        return aId - bId;
      }
      if (typeof aId === 'bigint' && typeof bId === 'bigint') {
        return Number(aId - bId);
      }
      return 0;
    });
  }

  async findBy(column: string, value: unknown): Promise<T[]> {
    return (this.table.rows as T[])
      .filter((r) => columnValueMatches((r as Record<string, unknown>)[column], value))
      .sort((a, b) => {
        const aId = (a as T).id;
        const bId = (b as T).id;
        if (typeof aId === 'number' && typeof bId === 'number') {
          return aId - bId;
        }
        if (typeof aId === 'bigint' && typeof bId === 'bigint') {
          return Number(aId - bId);
        }
        return 0;
      });
  }

  async findIn(column: string, values: ReadonlyArray<unknown>): Promise<T[]> {
    if (values.length === 0) return [];
    return (this.table.rows as T[])
      .filter((r) =>
        values.some((v) => columnValueMatches((r as Record<string, unknown>)[column], v)),
      )
      .sort((a, b) => {
        const aId = (a as T).id;
        const bId = (b as T).id;
        if (typeof aId === 'number' && typeof bId === 'number') {
          return aId - bId;
        }
        if (typeof aId === 'bigint' && typeof bId === 'bigint') {
          return Number(aId - bId);
        }
        return 0;
      });
  }

  async add(data: Omit<T, keyof StandardDataSource<TId, TDate>>): Promise<T> {
    const now = new Date().toISOString();
    const id = nextInMemoryId(
      this.idType,
      (data as Record<string, unknown>)['id'],
      () => this.table.nextId++,
    ) as TId;

    const row = {
      ...(data as object),
      id,
      ...(this.withUuidColumn && { uuid: randomUUID() }),
      created: now,
      updated: now,
    } as T;
    this.table.rows.push(row);
    return row;
  }

  async update(
    id: TId,
    data: Partial<Omit<T, keyof StandardDataSource<TId, TDate>>>,
  ): Promise<T | null> {
    const idx = this.table.rows.findIndex((r) => (r as T).id === id);
    if (idx === -1) return null;
    this.table.rows[idx] = {
      ...(this.table.rows[idx] as T),
      ...data,
      updated: new Date().toISOString(),
    } as T;
    return this.table.rows[idx] as T;
  }

  async delete(id: TId): Promise<boolean> {
    const idx = this.table.rows.findIndex((r) => (r as T).id === id);
    if (idx === -1) return false;
    this.table.rows.splice(idx, 1);
    return true;
  }

  async updateBy(
    column: string,
    value: unknown,
    data: Partial<Omit<T, keyof StandardDataSource<TId, TDate>>>,
  ): Promise<T[]> {
    const now = new Date().toISOString();
    const updated: T[] = [];
    for (let i = 0; i < this.table.rows.length; i++) {
      const row = this.table.rows[i] as T;
      if (columnValueMatches((row as Record<string, unknown>)[column], value)) {
        const next = { ...row, ...data, updated: now } as T;
        this.table.rows[i] = next;
        updated.push(next);
      }
    }
    return updated.sort((a, b) => {
      const aId = (a as T).id;
      const bId = (b as T).id;
      if (typeof aId === 'number' && typeof bId === 'number') return aId - bId;
      if (typeof aId === 'bigint' && typeof bId === 'bigint') return Number(aId - bId);
      return 0;
    });
  }

  async deleteBy(column: string, value: unknown): Promise<number> {
    const before = this.table.rows.length;
    this.table.rows = this.table.rows.filter(
      (r) => !columnValueMatches((r as Record<string, unknown>)[column], value),
    );
    return before - this.table.rows.length;
  }
}
