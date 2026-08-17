import { PostgresDatasource } from './PostgresDatasource';

export type RowMap = Record<string, unknown>;

export interface IStoredProcedureClient {
  invokeReturningId(procName: string, params: ReadonlyArray<unknown>): Promise<bigint | string>;
  invokeReturningAffected(procName: string, params: ReadonlyArray<unknown>): Promise<number>;
  invokeReturningRows<R = RowMap>(procName: string, params: ReadonlyArray<unknown>): Promise<R[]>;
}

export class PostgresStoredProcedureClient implements IStoredProcedureClient {
  constructor(private readonly datasource: PostgresDatasource) {}

  private buildCallSql(procName: string, paramsLength: number): string {
    const placeholders = Array.from({ length: paramsLength }, (_, i) => `$${i + 1}`).join(', ');
    return `SELECT * FROM ${procName}(${placeholders})`;
  }

  async invokeReturningId(
    procName: string,
    params: ReadonlyArray<unknown>,
  ): Promise<bigint | string> {
    const rows = await this.datasource.query<RowMap>(
      this.buildCallSql(procName, params.length),
      params,
    );
    const head = rows[0];
    if (!head || head[procName] === undefined || head[procName] === null) {
      throw new Error(
        `PostgresStoredProcedureClient.invokeReturningId: ${procName} did not return a scalar id`,
      );
    }
    const raw = head[procName] as string | number | bigint;
    if (typeof raw === 'string' && !/^-?\d+$/.test(raw)) return raw;
    return BigInt(raw);
  }

  async invokeReturningAffected(procName: string, params: ReadonlyArray<unknown>): Promise<number> {
    const rows = await this.datasource.query<RowMap>(
      this.buildCallSql(procName, params.length),
      params,
    );
    const head = rows[0];
    if (!head || head[procName] === undefined || head[procName] === null) {
      throw new Error(
        `PostgresStoredProcedureClient.invokeReturningAffected: ${procName} did not return rows-affected`,
      );
    }
    return Number(head[procName]);
  }

  async invokeReturningRows<R = RowMap>(
    procName: string,
    params: ReadonlyArray<unknown>,
  ): Promise<R[]> {
    return this.datasource.query<R>(this.buildCallSql(procName, params.length), params);
  }
}
