import { describe, expect, it } from 'vitest';
import { SqliteDatasource } from './SqliteDatasource';
import { SqliteStandardRepository } from './SqliteStandardRepository';
import { testPrimaryKeys } from '../__tests__/testPrimaryKeys';

describe('SqliteStandardRepository — stored procedures (unsupported)', () => {
  it('throws when constructed with useStoredProcedures: true', () => {
    const ds = new SqliteDatasource({ dbPath: ':memory:' });
    expect(
      () =>
        new SqliteStandardRepository(ds, 'user', {
          entityName: 'user',
          primaryKeys: testPrimaryKeys('integer'),
          useStoredProcedures: true,
        }),
    ).toThrow(/sqlite does not support stored procedures/i);
  });

  it('does not throw when useStoredProcedures is absent or false', () => {
    const ds = new SqliteDatasource({ dbPath: ':memory:' });
    expect(
      () =>
        new SqliteStandardRepository(ds, 'user', {
          entityName: 'user',
          primaryKeys: testPrimaryKeys('integer'),
        }),
    ).not.toThrow();
    expect(
      () =>
        new SqliteStandardRepository(ds, 'user', {
          entityName: 'user',
          primaryKeys: testPrimaryKeys('integer'),
          useStoredProcedures: false,
        }),
    ).not.toThrow();
  });
});
