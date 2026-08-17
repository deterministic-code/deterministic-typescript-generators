import { ICrudRepository } from '../ICrudRepository';
import { quoteMysqlIdentifier } from '../sqlIdentifier';
import {
  AbstractSqlCrudRepository,
  type SqlCrudRepositoryOptions,
} from '../AbstractSqlCrudRepository';
import { MysqlDatasource } from './MysqlDatasource';

export type MysqlCrudRepositoryOptions = SqlCrudRepositoryOptions;

export class MysqlCrudRepository<
  T extends { id: number | string } = { id: number },
  TId extends number | string = number,
>
  extends AbstractSqlCrudRepository<T, TId>
  implements ICrudRepository<T, TId>
{
  constructor(datasource: MysqlDatasource, tableName: string, options: MysqlCrudRepositoryOptions) {
    super({
      datasource,
      tableName,
      dialect: 'mysql',
      quote: quoteMysqlIdentifier,
      placeholder: () => '?',
      options,
    });
  }

  protected convertLastInsert(result: unknown): TId {
    return Number((result as { insertId: number }).insertId) as TId;
  }

  protected affectedOf(raw: unknown[]): number {
    return (raw[0] as { affectedRows: number }).affectedRows;
  }
}
