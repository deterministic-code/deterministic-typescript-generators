import { SqlserverDatasource } from './SqlserverDatasource';

export type RowMap = Record<string, unknown>;

export interface IStoredProcedureClient {
  invokeReturningId(procName: string, params: ReadonlyArray<unknown>): Promise<bigint>;
  invokeReturningAffected(procName: string, params: ReadonlyArray<unknown>): Promise<number>;
  invokeReturningRows<R = RowMap>(procName: string, params: ReadonlyArray<unknown>): Promise<R[]>;
}

interface MssqlRequestLike {
  input(name: string, ...rest: unknown[]): MssqlRequestLike;
  execute(procName: string): Promise<{
    recordset?: Array<Record<string, unknown>>;
    recordsets?: Array<Array<Record<string, unknown>>>;
    rowsAffected?: number[];
  }>;
}

interface MssqlPoolLike {
  request(): MssqlRequestLike;
}

export class SqlserverStoredProcedureClient implements IStoredProcedureClient {
  constructor(private readonly datasource: SqlserverDatasource) {}

  private bindInputs(request: MssqlRequestLike, params: ReadonlyArray<unknown>): MssqlRequestLike {
    params.forEach((v, i) => request.input(`p${i + 1}`, v));
    return request;
  }

  async invokeReturningId(procName: string, params: ReadonlyArray<unknown>): Promise<bigint> {
    const pool = this.datasource.raw() as unknown as MssqlPoolLike;
    const request = this.bindInputs(pool.request(), params);
    const result = await request.execute(procName);
    const recordset = result.recordset ?? [];
    const head = recordset[0];
    if (!head || head['id'] === undefined || head['id'] === null) {
      throw new Error(
        `SqlserverStoredProcedureClient.invokeReturningId: ${procName} did not return id in recordset`,
      );
    }
    return BigInt(head['id'] as string | number | bigint);
  }

  async invokeReturningAffected(procName: string, params: ReadonlyArray<unknown>): Promise<number> {
    const pool = this.datasource.raw() as unknown as MssqlPoolLike;
    const request = this.bindInputs(pool.request(), params);
    const result = await request.execute(procName);
    const recordset = result.recordset ?? [];
    const head = recordset[0];
    if (!head || head['affected'] === undefined || head['affected'] === null) {
      throw new Error(
        `SqlserverStoredProcedureClient.invokeReturningAffected: ${procName} did not return affected in recordset`,
      );
    }
    return Number(head['affected']);
  }

  async invokeReturningRows<R = RowMap>(
    procName: string,
    params: ReadonlyArray<unknown>,
  ): Promise<R[]> {
    const pool = this.datasource.raw() as unknown as MssqlPoolLike;
    const request = this.bindInputs(pool.request(), params);
    const result = await request.execute(procName);
    return (result.recordset ?? []) as R[];
  }
}
