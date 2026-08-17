import { SqlserverStandardRepository } from '../../sqlserver/SqlserverStandardRepository';
import {
  describeStandardRepositoryContract,
  type SimpleStandardRow,
} from '../shared/standardRepositoryContract';
import { testPrimaryKeys } from '../testPrimaryKeys';
import { openFakeSqlserver } from './openFakeSqlserver';

describeStandardRepositoryContract(
  'SqlserverStandardRepository',
  async () => {
    const { ds, teardown } = await openFakeSqlserver(
      `CREATE TABLE simple (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL,
      created TEXT NOT NULL,
      updated TEXT NOT NULL,
      name TEXT NOT NULL,
      value INTEGER NOT NULL
    )`,
    );
    const repo = new SqlserverStandardRepository<SimpleStandardRow>(ds, 'simple', {
      entityName: 'simple',
      primaryKeys: testPrimaryKeys('integer'),
    });
    return { repo, teardown };
  },
  { idType: 'integer' },
);
