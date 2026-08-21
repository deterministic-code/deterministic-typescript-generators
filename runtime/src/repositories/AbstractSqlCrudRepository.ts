import type { IDataSourceMiddleware } from '../middleware/IDataSourceMiddleware';
import type { ITypeFieldConverter, SupportedDatasource } from '../converters/ITypeFieldConverter';
import { FieldMappingTranslator } from './FieldMappingTranslator';
import { FieldConverter } from './fieldConverting';
import type { EntityFieldMap } from './parseFieldMappings';
import type { IDatasource } from './IDatasource';
import { placeholderList } from './sqlPlaceholders';
import { updateByMatched } from './crudUpdateBy';
import { randomUUID } from 'node:crypto';
import type { PrimaryKey } from './PrimaryKey';
import type { IPrimaryKeyService } from './IPrimaryKeyService';
import type { OptimisticConcurrencyOptions } from './ICrudRepository';
import { PreconditionFailedError } from '../errors/AppError';

export interface SqlCrudRepositoryOptions {
  middlewares?: readonly IDataSourceMiddleware[];
  columnTypes?: Readonly<Record<string, string>>;
  converters?: ReadonlyMap<string, ITypeFieldConverter>;
  fieldConverters?: ReadonlyMap<string, ITypeFieldConverter>;
  fieldMappings?: EntityFieldMap;
  /** The entity this repository serves — resolves its {@link PrimaryKey} through {@link primaryKeys}. */
  entityName: string;
  /** The one authority that resolves each entity's primary key (column + id_type), injected from the composition root. */
  primaryKeys: IPrimaryKeyService;
}

export interface SqlRepoConfig {
  datasource: IDatasource;
  tableName: string;
  dialect: SupportedDatasource;
  quote: (identifier: string) => string;
  placeholder: (index0: number) => string;
  options: SqlCrudRepositoryOptions;
}

/**
 * The shared CRUD implementation of every `?`-or-`$n`-style dialect `*CrudRepository`
 * (sqlite / mysql / postgres). Subclasses supply the dialect's SQL shape via `super`
 * (`quote`, `placeholder`, `dialect`) plus the write-result hooks that read state off
 * `this`; every SQL-shaping and value-binding decision lives here once.
 */
export abstract class AbstractSqlCrudRepository<
  T extends { id: number | string } = { id: number },
  TId extends number | string = number,
> {
  protected readonly datasource: IDatasource;
  protected readonly tableName: string;
  protected readonly originalTableName: string;
  protected readonly fieldConverter: FieldConverter;
  readonly entityName: string;
  readonly primaryKey: PrimaryKey;
  readonly primaryKeyColumn: string;
  protected readonly idType: 'integer' | 'biginteger' | 'uuid' | 'string';
  protected readonly physicalPrimaryKeyColumn: string;
  protected readonly quotedPrimaryKey: string;
  protected readonly translator: FieldMappingTranslator;
  protected readonly middlewares: readonly IDataSourceMiddleware[];
  protected readonly dialect: SupportedDatasource;
  protected readonly quote: (identifier: string) => string;
  protected readonly placeholder: (index0: number) => string;
  private readonly buildOptions: SqlCrudRepositoryOptions;

  constructor(config: SqlRepoConfig) {
    const { datasource, tableName, dialect, quote, placeholder, options } = config;
    this.datasource = datasource;
    this.dialect = dialect;
    this.quote = quote;
    this.placeholder = placeholder;
    this.originalTableName = tableName;
    this.tableName = quote(tableName);
    this.buildOptions = options;
    this.middlewares = options.middlewares ?? [];
    this.translator = new FieldMappingTranslator(options.fieldMappings);
    this.fieldConverter = new FieldConverter(dialect, this.translator, options);
    this.entityName = options.entityName;
    this.primaryKey = options.primaryKeys.forEntity(options.entityName);
    this.primaryKeyColumn = this.primaryKey.column;
    this.idType = this.primaryKey.idType;
    this.physicalPrimaryKeyColumn = this.translator.toPhysical(this.primaryKeyColumn);
    this.quotedPrimaryKey = quote(this.physicalPrimaryKeyColumn);
  }

  /** Rebuild this repository on a different datasource (e.g. a transaction-scoped connection) with the identical options — id_type, primary key, converters, field mappings and middlewares — so a create/update inside a transaction stays uuid-aware instead of reverting to the integer defaults. */
  cloneOnto(datasource: IDatasource): this {
    const Ctor = this.constructor as new (
      datasource: IDatasource,
      tableName: string,
      options: SqlCrudRepositoryOptions,
    ) => this;
    return new Ctor(datasource, this.originalTableName, this.buildOptions);
  }

  protected applyTo(column: string, value: unknown): unknown {
    return this.fieldConverter.toStorage(column, value);
  }

  protected applyFrom<R>(row: R): R {
    return this.fieldConverter.fromStorageRow(row);
  }

  protected quotedColumn(column: string): string {
    return this.quote(this.translator.toPhysical(column));
  }

  protected convertLastInsert(_result: unknown): TId {
    throw new Error(
      `invariant: ${this.dialect} reads inserts via RETURNING and never calls convertLastInsert`,
    );
  }

  protected insertReturning(): string {
    return '';
  }

  /** Whether the INSERT itself returns the stored row (true on `RETURNING *` dialects), so a custom primary key needs no follow-up `find`. */
  protected insertReadsBackInline(): boolean {
    return false;
  }

  protected mutationReturning(): string {
    return '';
  }

  protected deleteReturning(): string {
    return '';
  }

  protected augmentInsertData(data: Record<string, unknown>): Promise<Record<string, unknown>> {
    return Promise.resolve(data);
  }

  protected abstract affectedOf(raw: unknown[]): number;

  protected async resolveInsertedRow(raw: unknown[], source: Record<string, unknown>): Promise<T> {
    // A uuid PK is generated client-side, so read it back by the value we inserted rather than a (non-existent) auto-increment rowid.
    const id =
      this.idType === 'uuid' && this.primaryKeyColumn === 'id'
        ? (source[this.primaryKeyColumn] as TId)
        : this.convertLastInsert(raw[0]);
    const row = await this.find(id);
    if (!row) {
      throw new Error(`${this.originalTableName} insert: row id=${String(id)} not found`);
    }
    return row;
  }

  protected resolveMutatedRow(raw: unknown[], id: TId): Promise<T | null> {
    if (this.affectedOf(raw) === 0) return Promise.resolve(null);
    return this.find(id);
  }

  private async rewriteViaMiddleware(
    sql: string,
    params: ReadonlyArray<unknown> | undefined,
  ): Promise<{ sql: string; params?: ReadonlyArray<unknown> }> {
    let wire: { sql: string; params?: ReadonlyArray<unknown> } = { sql, params };
    for (const m of this.middlewares) {
      const out = await m.beforeQuery(this.dialect, wire.sql, wire.params);
      if (out) wire = { sql: out.query, params: out.params };
    }
    return wire;
  }

  private async notifyAfter(
    pending: { wire: { sql: string; params?: ReadonlyArray<unknown> }; startedAt: number },
    results: unknown[],
    error?: unknown,
  ): Promise<void> {
    const elapsed = performance.now() - pending.startedAt;
    for (const m of this.middlewares) {
      await m.afterQuery(
        this.dialect,
        pending.wire.sql,
        pending.wire.params,
        results,
        elapsed,
        error,
      );
    }
  }

  protected async runQuery<R>(sql: string, params?: ReadonlyArray<unknown>): Promise<R[]> {
    const wire = await this.rewriteViaMiddleware(sql, params);
    const pending = { wire, startedAt: performance.now() };
    return this.datasource.query<R>(wire.sql, wire.params).then(
      (results) => this.notifyAfter(pending, results).then(() => results),
      (error) => this.notifyAfter(pending, [], error).then(() => Promise.reject(error)),
    );
  }

  async query<R = unknown>(sql: string, params?: ReadonlyArray<unknown>): Promise<R[]> {
    return this.runQuery<R>(sql, params);
  }

  private orderedSelect(where: string, params: ReadonlyArray<unknown>): Promise<T[]> {
    const tail = `${where} ORDER BY ${this.quotedPrimaryKey} ASC`.trimStart();
    return this.selectRows(tail, params);
  }

  private async selectRows(tail: string, params?: ReadonlyArray<unknown>): Promise<T[]> {
    const rows = await this.runQuery<T>(`SELECT * FROM ${this.tableName} ${tail}`, params);
    return rows.map((r) => this.applyFrom(r));
  }

  async find(id: TId): Promise<T | null> {
    const rows = await this.selectRows(`WHERE ${this.quotedPrimaryKey} = ${this.placeholder(0)}`, [
      this.applyTo(this.primaryKeyColumn, id),
    ]);
    return rows[0] ?? null;
  }

  async findAll(): Promise<T[]> {
    return this.orderedSelect('', []);
  }

  async findBy(column: string, value: unknown): Promise<T[]> {
    return this.orderedSelect(`WHERE ${this.quotedColumn(column)} = ${this.placeholder(0)}`, [
      this.applyTo(column, value),
    ]);
  }

  async findIn(column: string, values: ReadonlyArray<unknown>): Promise<T[]> {
    if (values.length === 0) return [];
    return this.orderedSelect(
      `WHERE ${this.quotedColumn(column)} IN (${placeholderList(this.placeholder, values.length)})`,
      values.map((v) => this.applyTo(column, v)),
    );
  }

  protected mutationSet(entries: Array<[string, unknown]>): {
    setClauses: string[];
    boundValues: unknown[];
  } {
    return {
      setClauses: entries.map(([k], i) => `${this.quotedColumn(k)} = ${this.placeholder(i)}`),
      boundValues: entries.map(([k, v]) => this.applyTo(k, v)),
    };
  }

  protected async findByCustomPk(source: Record<string, unknown>): Promise<T> {
    const customPk = source[this.primaryKeyColumn];
    if (customPk === undefined || customPk === null) {
      throw new Error(
        `${this.originalTableName} uses primary key '${this.primaryKeyColumn}' but the insert payload did not include a value for that column`,
      );
    }
    const row = await this.find(customPk as TId);
    if (!row) {
      throw new Error(
        `inserted row not found by ${this.primaryKeyColumn}=${String(customPk)} in ${this.originalTableName}`,
      );
    }
    return row;
  }

  /** A uuid implicit `id` has no auto-increment to read back, so the repository generates it client-side (all dialects agree on the value) unless the caller supplied one. */
  private generatesUuidPrimaryKey(source: Record<string, unknown>): boolean {
    return (
      this.idType === 'uuid' &&
      this.primaryKeyColumn === 'id' &&
      source[this.primaryKeyColumn] === undefined
    );
  }

  async add(data: Omit<T, 'id'>): Promise<T> {
    const source = await this.augmentInsertData(data as Record<string, unknown>);
    if (this.generatesUuidPrimaryKey(source)) {
      source[this.primaryKeyColumn] = randomUUID();
    }
    const entries = Object.entries(source);
    const columns = entries.map(([k]) => this.quotedColumn(k));
    const values = entries.map(([k, v]) => this.applyTo(k, v));

    const sql = `INSERT INTO ${this.tableName} (${columns.join(', ')}) VALUES (${placeholderList(this.placeholder, entries.length)})${this.insertReturning()}`;
    const raw = await this.runQuery<unknown>(sql, values);
    if (this.primaryKeyColumn !== 'id' && !this.insertReadsBackInline()) {
      return this.findByCustomPk(source);
    }
    return this.resolveInsertedRow(raw, source);
  }

  async update(
    id: TId,
    data: Partial<Omit<T, 'id'>>,
    opts?: OptimisticConcurrencyOptions,
  ): Promise<T | null> {
    const entries = Object.entries(data as Record<string, unknown>);
    if (entries.length === 0) return this.find(id);

    const { setClauses, boundValues } = this.mutationSet(entries);
    const expectedUpdated = opts?.expectedUpdated;
    const values =
      expectedUpdated === undefined
        ? [...boundValues, this.applyTo(this.primaryKeyColumn, id)]
        : [
            ...boundValues,
            this.applyTo(this.primaryKeyColumn, id),
            expectedUpdated,
          ];
    const idPlaceholder = this.placeholder(
      expectedUpdated === undefined ? values.length - 1 : values.length - 2,
    );
    const where =
      expectedUpdated === undefined
        ? `WHERE ${this.quotedPrimaryKey} = ${idPlaceholder}`
        : `WHERE ${this.quotedPrimaryKey} = ${idPlaceholder} AND ${this.quotedColumn('updated')} = ${this.placeholder(values.length - 1)}`;
    const sql = `UPDATE ${this.tableName} SET ${setClauses.join(', ')} ${where}${this.mutationReturning()}`;
    const raw = await this.runQuery<unknown>(sql, values);
    if (expectedUpdated !== undefined && this.affectedOf(raw) === 0) {
      throw new PreconditionFailedError(
        `optimistic concurrency conflict on update for ${this.entityName}`,
      );
    }
    return this.resolveMutatedRow(raw, id);
  }

  async delete(id: TId, opts?: OptimisticConcurrencyOptions): Promise<boolean> {
    const expectedUpdated = opts?.expectedUpdated;
    const values =
      expectedUpdated === undefined
        ? [this.applyTo(this.primaryKeyColumn, id)]
        : [this.applyTo(this.primaryKeyColumn, id), expectedUpdated];
    const where =
      expectedUpdated === undefined
        ? `WHERE ${this.quotedPrimaryKey} = ${this.placeholder(0)}`
        : `WHERE ${this.quotedPrimaryKey} = ${this.placeholder(0)} AND ${this.quotedColumn('updated')} = ${this.placeholder(1)}`;
    const sql = `DELETE FROM ${this.tableName} ${where}${this.deleteReturning()}`;
    const raw = await this.runQuery<unknown>(sql, values);
    if (expectedUpdated !== undefined && this.affectedOf(raw) === 0) {
      throw new PreconditionFailedError(
        `optimistic concurrency conflict on delete for ${this.entityName}`,
      );
    }
    return this.affectedOf(raw) > 0;
  }

  runUpdate(sql: string, values: unknown[]): Promise<unknown> {
    return this.runQuery(sql, values);
  }

  protected updateByColumnSql(
    match: { column: string; value: unknown; returning?: string },
    entries: Array<[string, unknown]>,
  ): { sql: string; values: unknown[] } {
    const { setClauses, boundValues } = this.mutationSet(entries);
    const values = [...boundValues, this.applyTo(match.column, match.value)];
    const sql = `UPDATE ${this.tableName} SET ${setClauses.join(', ')} WHERE ${this.quotedColumn(match.column)} = ${this.placeholder(values.length - 1)}${match.returning ?? ''}`;
    return { sql, values };
  }

  updateBy(column: string, value: unknown, data: Partial<Omit<T, 'id'>>): Promise<T[]> {
    return updateByMatched<T>(this, {
      column,
      value,
      data: data as Record<string, unknown>,
      buildUpdate: (entries) => this.updateByColumnSql({ column, value }, entries),
    });
  }

  async deleteBy(column: string, value: unknown): Promise<number> {
    const sql = `DELETE FROM ${this.tableName} WHERE ${this.quotedColumn(column)} = ${this.placeholder(0)}${this.deleteReturning()}`;
    const raw = await this.runQuery<unknown>(sql, [this.applyTo(column, value)]);
    return this.affectedOf(raw);
  }
}
