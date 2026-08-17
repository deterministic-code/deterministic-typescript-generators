import { ICrudRepository } from '../ICrudRepository';
import { quoteIdentifier } from '../sqlIdentifier';
import {
  AbstractSqlCrudRepository,
  type SqlCrudRepositoryOptions,
} from '../AbstractSqlCrudRepository';
import { updateByReturning } from '../crudUpdateBy';
import { PostgresDatasource } from './PostgresDatasource';

export type PostgresCrudRepositoryOptions = SqlCrudRepositoryOptions;

export class PostgresCrudRepository<
  T extends { id: number | string } = { id: number },
  TId extends number | string = number,
>
  extends AbstractSqlCrudRepository<T, TId>
  implements ICrudRepository<T, TId>
{
  constructor(
    datasource: PostgresDatasource,
    tableName: string,
    options: PostgresCrudRepositoryOptions,
  ) {
    super({
      datasource,
      tableName,
      dialect: 'postgres',
      quote: quoteIdentifier,
      placeholder: (index0) => `$${index0 + 1}`,
      options,
    });
  }

  protected insertReturning(): string {
    return ' RETURNING *';
  }

  protected insertReadsBackInline(): boolean {
    return true;
  }

  protected mutationReturning(): string {
    return ' RETURNING *';
  }

  protected deleteReturning(): string {
    return ` RETURNING ${this.quotedPrimaryKey}`;
  }

  protected affectedOf(raw: unknown[]): number {
    return raw.length;
  }

  protected resolveInsertedRow(raw: unknown[], _source: Record<string, unknown>): Promise<T> {
    return Promise.resolve(this.applyFrom(raw[0] as T));
  }

  protected resolveMutatedRow(raw: unknown[], _id: TId): Promise<T | null> {
    return Promise.resolve(raw[0] ? this.applyFrom(raw[0] as T) : null);
  }

  updateBy(column: string, value: unknown, data: Partial<Omit<T, 'id'>>): Promise<T[]> {
    return updateByReturning<T>(
      {
        readRows: (c, v) => this.findBy(c, v),
        runReturning: async (sql, values) =>
          (await this.runQuery<T>(sql, values)).map((r) => this.applyFrom(r)),
      },
      {
        column,
        value,
        data: data as Record<string, unknown>,
        buildUpdate: (entries) =>
          this.updateByColumnSql({ column, value, returning: ' RETURNING *' }, entries),
      },
    );
  }
}
