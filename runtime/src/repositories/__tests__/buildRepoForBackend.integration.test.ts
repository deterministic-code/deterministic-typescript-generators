import { describe, expect, it, vi } from 'vitest';
import { Pool as PgPool } from 'pg';

import { buildRepoForBackend } from '../buildRepoForBackend';
import { InMemoryCrudRepository } from '../inmemory/InMemoryCrudRepository';
import { MysqlCrudRepository } from '../mysql/MysqlCrudRepository';
import { MysqlDatasource } from '../mysql/MysqlDatasource';
import { FakeMysqlPool } from './mysql/fakeMysqlPool';
import { PostgresCrudRepository } from '../postgres/PostgresCrudRepository';
import { PostgresDatasource } from '../postgres/PostgresDatasource';
import { SqliteCrudRepository } from '../sqlite/SqliteCrudRepository';
import { SqliteDatasource } from '../sqlite/SqliteDatasource';
import { SqlserverCrudRepository } from '../sqlserver/SqlserverCrudRepository';
import { SqlserverDatasource } from '../sqlserver/SqlserverDatasource';
import { OracleCrudRepository } from '../oracle/OracleCrudRepository';
import { OracleDatasource } from '../oracle/OracleDatasource';
import { testPrimaryKeys } from './testPrimaryKeys';

const noopClose = () => Promise.resolve();

async function assertBooleanColumnsForwarded(
  conn: Parameters<typeof buildRepoForBackend>[0],
): Promise<void> {
  const repo = buildRepoForBackend<{
    id: number;
    name: string;
    is_enabled: boolean;
    is_builtin: boolean;
  }>(conn, 'permission', {
    entityName: 'permission',
    primaryKeys: testPrimaryKeys('integer'),
    columnTypes: { is_enabled: 'boolean', is_builtin: 'boolean' },
  });
  const row = await repo.find(1);
  expect(row?.is_enabled).toBe(true);
  expect(row?.is_builtin).toBe(false);
}

describe('buildRepoForBackend', () => {
  it('returns an InMemoryCrudRepository for type=memory', () => {
    const repo = buildRepoForBackend({ type: 'memory', close: noopClose }, 'application', {
      entityName: 'application',
      primaryKeys: testPrimaryKeys('integer'),
    });
    expect(repo).toBeInstanceOf(InMemoryCrudRepository);
  });

  it('returns a SqliteCrudRepository for type=sqlite', async () => {
    const datasource = new SqliteDatasource({ dbPath: ':memory:' });
    await datasource.open();
    try {
      const repo = buildRepoForBackend(
        { type: 'sqlite', datasource, close: noopClose },
        'application',
        { entityName: 'application', primaryKeys: testPrimaryKeys('integer') },
      );
      expect(repo).toBeInstanceOf(SqliteCrudRepository);
    } finally {
      await datasource.close();
    }
  });

  it('forwards columnTypes to SqliteCrudRepository so INTEGER 0/1 reads as JS boolean', async () => {
    const datasource = new SqliteDatasource({ dbPath: ':memory:' });
    await datasource.open();
    try {
      await datasource.query(
        'CREATE TABLE permission (id INTEGER PRIMARY KEY, name TEXT, is_enabled INTEGER, is_builtin INTEGER)',
      );
      await datasource.query(
        'INSERT INTO permission (id, name, is_enabled, is_builtin) VALUES (1, ?, 1, 0)',
        ['read'],
      );
      await assertBooleanColumnsForwarded({ type: 'sqlite', datasource, close: noopClose });
    } finally {
      await datasource.close();
    }
  });

  it('returns a PostgresCrudRepository for type=postgres', async () => {
    const pool = new PgPool({ connectionString: 'postgres://user:pass@localhost:5432/test' });
    const datasource = new PostgresDatasource({ pool });
    try {
      const repo = buildRepoForBackend(
        { type: 'postgres', datasource, close: noopClose },
        'application',
        { entityName: 'application', primaryKeys: testPrimaryKeys('integer') },
      );
      expect(repo).toBeInstanceOf(PostgresCrudRepository);
    } finally {
      await pool.end();
    }
  });

  it('returns a MysqlCrudRepository for type=mysql', () => {
    const fakePool = { query: vi.fn(), end: vi.fn() } as never;
    const datasource = new MysqlDatasource({ pool: fakePool });
    const repo = buildRepoForBackend(
      { type: 'mysql', datasource, close: noopClose },
      'application',
      { entityName: 'application', primaryKeys: testPrimaryKeys('integer') },
    );
    expect(repo).toBeInstanceOf(MysqlCrudRepository);
  });

  it('forwards columnTypes to MysqlCrudRepository so TINYINT 0/1 reads as JS boolean', async () => {
    const pool = new FakeMysqlPool();
    const datasource = new MysqlDatasource({ pool: pool.asPool() });
    await datasource.open();
    try {
      await datasource.query(
        'CREATE TABLE permission (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, is_enabled INTEGER, is_builtin INTEGER)',
      );
      await datasource.query(
        'INSERT INTO permission (id, name, is_enabled, is_builtin) VALUES (1, ?, 1, 0)',
        ['read'],
      );
      await assertBooleanColumnsForwarded({ type: 'mysql', datasource, close: noopClose });
    } finally {
      await datasource.close();
      await pool.end();
    }
  });

  it('returns a SqlserverCrudRepository for type=sqlserver', () => {
    const fakePool = { request: vi.fn(), close: vi.fn() } as never;
    const datasource = new SqlserverDatasource({ pool: fakePool });
    const repo = buildRepoForBackend(
      { type: 'sqlserver', datasource, close: noopClose },
      'application',
      { entityName: 'application', primaryKeys: testPrimaryKeys('integer') },
    );
    expect(repo).toBeInstanceOf(SqlserverCrudRepository);
  });

  it('returns an OracleCrudRepository for type=oracle', () => {
    const fakePool = { getConnection: vi.fn(), close: vi.fn() } as never;
    const datasource = new OracleDatasource({ pool: fakePool });
    const repo = buildRepoForBackend(
      { type: 'oracle', datasource, close: noopClose },
      'application',
      { entityName: 'application', primaryKeys: testPrimaryKeys('integer') },
    );
    expect(repo).toBeInstanceOf(OracleCrudRepository);
  });
});
