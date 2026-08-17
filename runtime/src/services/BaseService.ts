import { ICrudRepository } from '../repositories/ICrudRepository';
import type { PrimaryKey } from '../repositories/PrimaryKey';
import type { IDatasource } from '../repositories/IDatasource';
import { IStandardCrudService } from './interfaces/IStandardCrudService';
import { NameValue } from './interfaces/NameValue';

export class BaseService<
  T extends {
    id: number | string;
    uuid?: string;
    created?: string | Date;
    updated?: string | Date;
  },
  TMutate = Omit<T, 'id' | 'uuid' | 'created' | 'updated'>,
> implements IStandardCrudService<T, TMutate> {
  readonly primaryKey: PrimaryKey;
  protected readonly primaryKeyColumn: string;
  protected readonly hasCustomPrimaryKey: boolean;
  protected readonly idIsUuid: boolean;
  /** True when the incoming id IS the row's key — a custom PK ("cnt-001") or a uuid `id` — so lookups/mutations go straight to the id column, never the `findBy('uuid', …)` / `resolveId` detour that targets a separate integer key. */
  protected readonly idIsRowKey: boolean;

  constructor(protected readonly repository: ICrudRepository<T & { id: number | string }>) {
    const pk = repository.primaryKey;
    this.primaryKey = pk;
    this.primaryKeyColumn = pk.column;
    this.hasCustomPrimaryKey = pk.column !== 'id';
    this.idIsUuid = pk.idType === 'uuid';
    this.idIsRowKey = this.hasCustomPrimaryKey || this.idIsUuid;
  }

  async query(command: string, args: NameValue[]): Promise<T[]> {
    return (await this.repository.query<T>(
      command,
      args.map((a) => a.value),
    )) as T[];
  }

  async findAll(): Promise<T[]> {
    return this.repository.findAll();
  }

  async create(data: TMutate): Promise<T> {
    return this.repository.add(data as unknown as Omit<T, 'id'>);
  }

  async find(query: string, args: NameValue[]): Promise<T[]> {
    return (await this.repository.query<T>(
      query,
      args.map((a) => a.value),
    )) as T[];
  }

  async findById(id: number | string): Promise<T | null> {
    if (this.idIsRowKey) {
      return this.repository.find(id as number);
    }
    if (typeof id === 'number') {
      return this.repository.find(id);
    }
    const rows = await this.repository.findBy('uuid', id);
    return rows[0] ?? null;
  }

  async findBy(whereArgs: NameValue[]): Promise<T[]> {
    return this.findByInternal(whereArgs);
  }

  async update(
    id: number | string,
    data: Partial<TMutate>,
    opts?: { expectedUpdated?: string },
  ): Promise<T | null> {
    const payload = data as Partial<Omit<T, 'id'>>;
    if (this.idIsRowKey) {
      return opts === undefined
        ? this.repository.update(id as number, payload)
        : this.repository.update(id as number, payload, opts);
    }
    const numericId = await this.resolveId(id);
    if (numericId === null) return null;
    return opts === undefined
      ? this.repository.update(numericId, payload)
      : this.repository.update(numericId, payload, opts);
  }

  async patch(
    id: number | string,
    data: Partial<TMutate>,
    opts?: { expectedUpdated?: string },
  ): Promise<T | null> {
    return this.update(id, data, opts);
  }

  async delete(id: number | string, opts?: { expectedUpdated?: string }): Promise<boolean> {
    if (this.idIsRowKey) {
      return opts === undefined
        ? this.repository.delete(id as number)
        : this.repository.delete(id as number, opts);
    }
    const numericId = await this.resolveId(id);
    if (numericId === null) return false;
    return opts === undefined
      ? this.repository.delete(numericId)
      : this.repository.delete(numericId, opts);
  }

  async updateBy(whereArgs: NameValue[], data: Partial<TMutate>): Promise<number> {
    if (whereArgs.length === 1) {
      const { name, value } = whereArgs[0];
      const updated = await this.repository.updateBy(name, value, data as Partial<Omit<T, 'id'>>);
      return updated.length;
    }
    const matches = await this.findByInternal(whereArgs);
    let count = 0;
    for (const row of matches) {
      const updated = await this.repository.update(
        (row as { id: number }).id,
        data as Partial<Omit<T, 'id'>>,
      );
      if (updated !== null) count++;
    }
    return count;
  }

  async deleteBy(whereArgs: NameValue[]): Promise<number> {
    if (whereArgs.length === 1) {
      const { name, value } = whereArgs[0];
      return this.repository.deleteBy(name, value);
    }
    const matches = await this.findByInternal(whereArgs);
    let count = 0;
    for (const row of matches) {
      if (await this.repository.delete((row as { id: number }).id)) count++;
    }
    return count;
  }

  async runInTransaction<R>(
    datasource: IDatasource,
    withTxnRepoFn: (
      repo: ICrudRepository<T & { id: number | string }>,
      txn: IDatasource,
    ) => ICrudRepository<T & { id: number | string }>,
    fn: (txnService: this) => Promise<R>,
  ): Promise<R> {
    return datasource.runInTransaction(async (txn) => {
      const txnRepo = withTxnRepoFn(this.repository, txn);
      const clone = Object.create(Object.getPrototypeOf(this));
      Object.assign(clone, this, { repository: txnRepo });
      return fn(clone as this);
    });
  }

  private async findByInternal(whereArgs: NameValue[]): Promise<T[]> {
    if (whereArgs.length === 0) return this.repository.findAll();

    const byName = new Map<string, unknown[]>();
    for (const { name, value } of whereArgs) {
      const existing = byName.get(name);
      if (existing) existing.push(value);
      else byName.set(name, [value]);
    }

    const entries = Array.from(byName.entries());
    const [firstName, firstValues] = entries[0];
    let rows: T[] =
      firstValues.length === 1
        ? await this.repository.findBy(firstName, firstValues[0])
        : await this.repository.findIn(firstName, firstValues);

    for (let i = 1; i < entries.length; i++) {
      const [name, values] = entries[i];
      rows = rows.filter((r) => values.includes((r as Record<string, unknown>)[name]));
    }
    return rows;
  }

  private async resolveId(id: number | string): Promise<number | null> {
    if (typeof id === 'number') return id;
    const row = await this.findById(id);
    return row ? (row as { id: number }).id : null;
  }
}
