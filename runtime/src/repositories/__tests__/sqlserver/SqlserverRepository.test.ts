import type { ConnectionPool } from 'mssql';
import type { IDataSourceMiddleware } from '../../../middleware/IDataSourceMiddleware';
import { SqlserverDatasource } from '../../sqlserver/SqlserverDatasource';
import { SqlserverRepository } from '../../sqlserver/SqlserverRepository';
import { FakeMssqlPool } from './fakeMssqlPool';

describe('SqlserverRepository', () => {
  let pool: FakeMssqlPool;
  let ds: SqlserverDatasource;
  let repo: SqlserverRepository;

  beforeEach(async () => {
    pool = new FakeMssqlPool();
    ds = new SqlserverDatasource({ pool: pool as unknown as ConnectionPool });
    await ds.open();
    await ds.query('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)');
    await ds.query("INSERT INTO t VALUES (1, 'alpha'), (2, 'beta')");
    repo = new SqlserverRepository(ds);
  });

  afterEach(async () => {
    await ds.close();
    await pool.close();
  });

  it('query() runs a SELECT through the datasource', async () => {
    const rows = await repo.query<{ id: number; name: string }>('SELECT * FROM t ORDER BY id');
    expect(rows.map((r) => r.name)).toEqual(['alpha', 'beta']);
  });

  it('query() forwards @pN positional parameters', async () => {
    const rows = await repo.query<{ id: number }>('SELECT id FROM t WHERE name = @p1', ['beta']);
    expect(rows).toEqual([{ id: 2 }]);
  });

  it('query() invokes beforeQuery and afterQuery middleware hooks', async () => {
    const callOrder: string[] = [];
    const m: IDataSourceMiddleware = {
      beforeQuery: async () => {
        callOrder.push('before');
        return undefined;
      },
      afterQuery: async () => {
        callOrder.push('after');
      },
    };

    pool = new FakeMssqlPool();
    ds = new SqlserverDatasource({ pool: pool as unknown as ConnectionPool });
    await ds.open();
    await ds.query('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)');
    repo = new SqlserverRepository(ds, [m]);

    await repo.query('SELECT 1');

    expect(callOrder).toEqual(['before', 'after']);

    await ds.close();
    await pool.close();
  });
});
