import type { ConnectionPool } from 'mssql';
import { SqlserverDatasource } from '../../sqlserver/SqlserverDatasource';
import { SqlserverCrudRepository } from '../../sqlserver/SqlserverCrudRepository';
import { describeCrudRepositoryContract, type SimpleRow } from '../shared/crudRepositoryContract';
import { FakeMssqlPool } from './fakeMssqlPool';
import { openFakeSqlserver } from './openFakeSqlserver';
import { testPrimaryKeys } from '../testPrimaryKeys';

describeCrudRepositoryContract('SqlserverCrudRepository', async () => {
  const { ds, teardown } = await openFakeSqlserver(
    'CREATE TABLE simple (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, value INTEGER NOT NULL)',
  );
  const repo = new SqlserverCrudRepository<SimpleRow>(ds, 'simple', {
    entityName: 'simple',
    primaryKeys: testPrimaryKeys('integer'),
  });
  return { repo, teardown };
});

describe('SqlserverCrudRepository identifier validation', () => {
  it('rejects invalid table name', () => {
    const ds = new SqlserverDatasource({
      pool: new FakeMssqlPool() as unknown as ConnectionPool,
    });
    expect(
      () =>
        new SqlserverCrudRepository<SimpleRow>(ds, 'bad name', {
          entityName: 'bad',
          primaryKeys: testPrimaryKeys('integer'),
        }),
    ).toThrow('Invalid SQL identifier');
  });
});
