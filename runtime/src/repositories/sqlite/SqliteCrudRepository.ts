import { randomUUID } from 'node:crypto';
import { ICrudRepository } from '../ICrudRepository';
import { quoteIdentifier } from '../sqlIdentifier';
import {
  AbstractSqlCrudRepository,
  type SqlCrudRepositoryOptions,
} from '../AbstractSqlCrudRepository';
import { SqliteDatasource } from './SqliteDatasource';

export type SqliteCrudRepositoryOptions = SqlCrudRepositoryOptions;

export class SqliteCrudRepository<
  T extends { id: number | string } = { id: number },
  TId extends number | string = number,
>
  extends AbstractSqlCrudRepository<T, TId>
  implements ICrudRepository<T, TId>
{
  private hasUuidColumn: boolean | null = null;

  constructor(
    datasource: SqliteDatasource,
    tableName: string,
    options: SqliteCrudRepositoryOptions,
  ) {
    super({
      datasource,
      tableName,
      dialect: 'sqlite',
      quote: quoteIdentifier,
      placeholder: () => '?',
      options,
    });
  }

  private async resolveHasUuidColumn(): Promise<boolean> {
    if (this.hasUuidColumn !== null) return this.hasUuidColumn;
    const info = await this.datasource.query<{ name: string }>(
      `PRAGMA table_info(${this.tableName})`,
    );
    const physicalUuid = this.translator.toPhysical('uuid');
    this.hasUuidColumn = info.some((c) => c.name === physicalUuid);
    return this.hasUuidColumn;
  }

  protected async augmentInsertData(
    data: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if ('uuid' in data || !(await this.resolveHasUuidColumn())) return data;
    return { ...data, uuid: randomUUID() };
  }

  protected convertLastInsert(result: unknown): TId {
    return Number((result as { lastInsertRowid: number | bigint }).lastInsertRowid) as TId;
  }

  protected affectedOf(raw: unknown[]): number {
    return (raw[0] as { changes: number }).changes;
  }
}
