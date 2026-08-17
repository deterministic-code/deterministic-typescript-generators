import { SqliteStandardRepository } from '../../sqlite/SqliteStandardRepository';
import { testPrimaryKeys } from '../testPrimaryKeys';
import {
  describeStandardRepositoryContract,
  type SimpleStandardRow,
} from '../shared/standardRepositoryContract';
import { openSqliteTestDb } from '../shared/sqliteTestDb';

describeStandardRepositoryContract(
  'SqliteStandardRepository',
  async () => {
    const { ds, teardown } = await openSqliteTestDb('std');
    await ds.query(
      `CREATE TABLE simple (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL,
      created TEXT NOT NULL,
      updated TEXT NOT NULL,
      name TEXT NOT NULL,
      value INTEGER NOT NULL
    )`,
    );
    const repo = new SqliteStandardRepository<SimpleStandardRow>(ds, 'simple', {
      entityName: 'simple',
      primaryKeys: testPrimaryKeys('integer'),
    });
    return { repo, teardown };
  },
  { idType: 'integer' },
);

describeStandardRepositoryContract(
  'SqliteStandardRepository',
  async () => {
    const { ds, teardown } = await openSqliteTestDb('std-uuid');
    await ds.query(
      `CREATE TABLE simple (
        id TEXT PRIMARY KEY,
        created TEXT NOT NULL,
        updated TEXT NOT NULL,
        name TEXT NOT NULL,
        value INTEGER NOT NULL
      )`,
    );
    const repo = new SqliteStandardRepository<SimpleStandardRow>(ds, 'simple', {
      entityName: 'simple',
      primaryKeys: testPrimaryKeys('uuid'),
      withUuidColumn: false,
    });
    return { repo, teardown };
  },
  { idType: 'uuid', withUuidColumn: false },
);
