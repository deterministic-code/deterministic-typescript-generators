import { testPrimaryKeys } from '../testPrimaryKeys';
import { MysqlCrudRepository } from '../../mysql/MysqlCrudRepository';
import { MysqlDatasource } from '../../mysql/MysqlDatasource';
import { FakeMysqlPool } from './fakeMysqlPool';

interface TestRow {
  id: number | string;
  name: string;
}

describe('MysqlCrudRepository.cloneOnto', () => {
  let pool: FakeMysqlPool;
  let ds: MysqlDatasource;

  beforeEach(async () => {
    pool = new FakeMysqlPool();
    ds = new MysqlDatasource({ pool: pool.asPool() });
    await ds.open();
  });

  afterEach(async () => {
    await ds.close();
    await pool.end();
  });

  it('clones without re-quoting the already-quoted tableName (regression: `Invalid SQL identifier: `users``)', () => {
    const original = new MysqlCrudRepository<TestRow>(ds, 'users', {
      entityName: 'test',
      primaryKeys: testPrimaryKeys('integer'),
    });

    expect(() => original.cloneOnto(ds)).not.toThrow();
  });

  it('clone is an instance of MysqlCrudRepository', () => {
    const original = new MysqlCrudRepository<TestRow>(ds, 'users', {
      entityName: 'test',
      primaryKeys: testPrimaryKeys('integer'),
    });

    const clone = original.cloneOnto(ds);

    expect(clone).toBeInstanceOf(MysqlCrudRepository);
  });

  it('clone preserves middlewares from the original', () => {
    const middleware = { beforeQuery: async () => undefined, afterQuery: async () => undefined };
    const original = new MysqlCrudRepository<TestRow>(ds, 'users', {
      middlewares: [middleware],
      entityName: 'test',
      primaryKeys: testPrimaryKeys('integer'),
    });

    const clone = original.cloneOnto(ds);

    const cloneObj = clone as unknown as Record<string, unknown>;
    const originalObj = original as unknown as Record<string, unknown>;
    expect(cloneObj.middlewares).toBe(originalObj.middlewares);
  });

  it('clone preserves idType and primaryKeyColumn so a txn-scoped uuid create stays uuid-aware (regression: transaction repo reverted to integer id → "insert: row id=1 not found")', () => {
    const original = new MysqlCrudRepository<TestRow>(ds, 'users', {
      entityName: 'test',
      primaryKeys: testPrimaryKeys('uuid'),
    });

    const clone = original.cloneOnto(ds);

    const cloneObj = clone as unknown as Record<string, unknown>;
    expect(cloneObj.idType).toBe('uuid');
    expect(cloneObj.primaryKeyColumn).toBe('id');
  });

  it('clone re-quotes the original table name so SQL stays well-formed', async () => {
    const original = new MysqlCrudRepository<TestRow>(ds, 'users', {
      entityName: 'test',
      primaryKeys: testPrimaryKeys('integer'),
    });
    await ds.query('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)');

    const clone = original.cloneOnto(ds);
    await clone.add({ name: 'Alice' } as Omit<TestRow, 'id'>);
    const rows = await clone.findAll();

    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Alice');
  });
});
