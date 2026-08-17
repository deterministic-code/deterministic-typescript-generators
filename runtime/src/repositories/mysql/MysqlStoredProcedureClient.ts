import { MysqlDatasource } from './MysqlDatasource';

export type RowMap = Record<string, unknown>;

export interface IStoredProcedureClient {
  invokeReturningId(procName: string, params: ReadonlyArray<unknown>): Promise<bigint | string>;
  invokeReturningAffected(procName: string, params: ReadonlyArray<unknown>): Promise<number>;
  invokeReturningRows<R = RowMap>(procName: string, params: ReadonlyArray<unknown>): Promise<R[]>;
}

export class MysqlStoredProcedureClient implements IStoredProcedureClient {
  constructor(private readonly datasource: MysqlDatasource) {}

  private buildCallSql(procName: string, paramsLength: number): string {
    const placeholders = Array.from({ length: paramsLength }, () => '?').join(', ');
    return `CALL ${procName}(${placeholders})`;
  }

  private firstRecordset(result: unknown): RowMap[] {
    if (!Array.isArray(result) || result.length === 0) return [];
    const first = result[0];
    if (Array.isArray(first)) return first as RowMap[];
    return result as RowMap[];
  }

  async invokeReturningId(
    procName: string,
    params: ReadonlyArray<unknown>,
  ): Promise<bigint | string> {
    const sql = this.buildCallSql(procName, params.length);
    const result = (await this.datasource.query(sql, params)) as unknown;
    const recordset = this.firstRecordset(result);
    const head = recordset[0];
    if (!head || head['id'] === undefined || head['id'] === null) {
      throw new Error(
        `MysqlStoredProcedureClient.invokeReturningId: ${procName} did not return id in first recordset`,
      );
    }
    const raw = head['id'] as string | number | bigint;
    if (typeof raw === 'string' && !/^-?\d+$/.test(raw)) return raw;
    return BigInt(raw);
  }

  async invokeReturningAffected(procName: string, params: ReadonlyArray<unknown>): Promise<number> {
    const sql = this.buildCallSql(procName, params.length);
    const result = (await this.datasource.query(sql, params)) as unknown;
    const recordset = this.firstRecordset(result);
    const head = recordset[0];
    if (!head || head['affected'] === undefined || head['affected'] === null) {
      throw new Error(
        `MysqlStoredProcedureClient.invokeReturningAffected: ${procName} did not return affected in first recordset`,
      );
    }
    return Number(head['affected']);
  }

  async invokeReturningRows<R = RowMap>(
    procName: string,
    params: ReadonlyArray<unknown>,
  ): Promise<R[]> {
    const sql = this.buildCallSql(procName, params.length);
    const result = (await this.datasource.query(sql, params)) as unknown;
    return this.firstRecordset(result) as unknown as R[];
  }
}
