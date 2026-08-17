import type { ConnectionPool } from 'mssql';
import { SqlserverDatasource } from '../../sqlserver/SqlserverDatasource';
import { FakeMssqlPool } from './fakeMssqlPool';

describe('SqlserverDatasource', () => {
  let pool: FakeMssqlPool;
  let ds: SqlserverDatasource;

  beforeEach(async () => {
    pool = new FakeMssqlPool();
    ds = new SqlserverDatasource({ pool: pool as unknown as ConnectionPool });
    await ds.open();
  });

  afterEach(async () => {
    await ds.close();
    await pool.close();
  });

  it('open() is idempotent', async () => {
    await ds.open();
    const rows = await ds.query<{ one: number }>('SELECT 1 AS one');
    expect(rows).toEqual([{ one: 1 }]);
  });

  it('query() converts positional params to @p1..@pN inputs', async () => {
    await ds.query('CREATE TABLE t (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)');
    await ds.query('INSERT INTO t (name) VALUES (@p1)', ['alpha']);
    const rows = await ds.query<{ id: number; name: string }>('SELECT * FROM t');
    expect(rows).toEqual([{ id: 1, name: 'alpha' }]);
  });

  it('throws when constructed without pool or poolConfig', () => {
    expect(() => new SqlserverDatasource({})).toThrow('requires either pool or poolConfig');
  });

  it('query() throws when called after close()', async () => {
    await ds.close();
    await expect(ds.query('SELECT 1')).rejects.toThrow('not open');
  });
});
