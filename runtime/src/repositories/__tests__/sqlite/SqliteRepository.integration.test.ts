import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathExists } from '../../pathExists';
import type { IDataSourceMiddleware } from '../../../middleware/IDataSourceMiddleware';
import { SqliteDatasource } from '../../sqlite/SqliteDatasource';
import { SqliteRepository } from '../../sqlite/SqliteRepository';

describe('SqliteRepository', () => {
  let dbPath: string;
  let ds: SqliteDatasource;
  let repo: SqliteRepository;

  beforeEach(async () => {
    dbPath = path.join(os.tmpdir(), `sqlite-repo-${Date.now()}-${Math.random()}.db`);
    ds = new SqliteDatasource({ dbPath });
    await ds.open();
    await ds.query('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)');
    await ds.query("INSERT INTO t (name) VALUES ('alpha'), ('beta')");
    repo = new SqliteRepository(ds);
  });

  afterEach(async () => {
    await ds.close();
    if (await pathExists(dbPath)) await fs.unlink(dbPath);
  });

  it('query() runs a SELECT through the datasource', async () => {
    const rows = await repo.query<{ id: number; name: string }>('SELECT * FROM t ORDER BY id');
    expect(rows.map((r) => r.name)).toEqual(['alpha', 'beta']);
  });

  it('query() forwards parameters', async () => {
    const rows = await repo.query<{ id: number }>('SELECT id FROM t WHERE name = ?', ['beta']);
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

    dbPath = path.join(os.tmpdir(), `sqlite-repo-mw-${Date.now()}-${Math.random()}.db`);
    ds = new SqliteDatasource({ dbPath });
    await ds.open();
    await ds.query('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)');
    repo = new SqliteRepository(ds, [m]);

    await repo.query('SELECT 1');

    expect(callOrder).toEqual(['before', 'after']);

    await ds.close();
    if (await pathExists(dbPath)) await fs.unlink(dbPath);
  });
});
