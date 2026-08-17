import { testPrimaryKeys } from './testPrimaryKeys';
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathExists } from '../pathExists';
import type { IDataSourceMiddleware } from '../../middleware/IDataSourceMiddleware';
import { SqliteCrudRepository } from '../sqlite/SqliteCrudRepository';
import { SqliteDatasource } from '../sqlite/SqliteDatasource';

function makeQueryObserver(): { observedQueries: string[]; middleware: IDataSourceMiddleware } {
  const observedQueries: string[] = [];
  const middleware: IDataSourceMiddleware = {
    beforeQuery: async (_provider, query) => {
      observedQueries.push(query);
      return undefined;
    },
    afterQuery: async () => {},
  };
  return { observedQueries, middleware };
}

async function makeDummyRepo(label: string, middlewares: IDataSourceMiddleware[]) {
  const dbPath = path.join(os.tmpdir(), `sqlite-${label}-${Date.now()}-${Math.random()}.db`);
  const ds = new SqliteDatasource({ dbPath });
  await ds.open();
  const repo = new SqliteCrudRepository(ds, 'dummy', {
    middlewares,
    entityName: 'test',
    primaryKeys: testPrimaryKeys('integer'),
  });
  return { ds, repo, dbPath };
}

describe('datasourceMiddlewareHooks', () => {
  it('executes middlewares in order: before chain, then query, then after chain reversed', async () => {
    const callOrder: string[] = [];
    const m1: IDataSourceMiddleware = {
      beforeQuery: async () => {
        callOrder.push('m1.before');
      },
      afterQuery: async () => {
        callOrder.push('m1.after');
      },
    };
    const m2: IDataSourceMiddleware = {
      beforeQuery: async () => {
        callOrder.push('m2.before');
      },
      afterQuery: async () => {
        callOrder.push('m2.after');
      },
    };

    const dbPath = path.join(os.tmpdir(), `sqlite-middleware-${Date.now()}-${Math.random()}.db`);
    const ds = new SqliteDatasource({ dbPath });
    await ds.open();
    await ds.query('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
    const repo = new SqliteCrudRepository(ds, 'test', {
      middlewares: [m1, m2],
      entityName: 'test',
      primaryKeys: testPrimaryKeys('integer'),
    });

    await repo.query('SELECT 1');

    expect(callOrder).toEqual(['m1.before', 'm2.before', 'm1.after', 'm2.after']);

    await ds.close();
    if (await pathExists(dbPath)) await fs.unlink(dbPath);
  });

  it('propagates beforeQuery mutations through the chain', async () => {
    const m1: IDataSourceMiddleware = {
      beforeQuery: async () => {
        return { query: 'SELECT 42 as value', params: undefined };
      },
      afterQuery: async () => {},
    };
    const { observedQueries, middleware: m2 } = makeQueryObserver();

    const { ds, repo, dbPath } = await makeDummyRepo('mutation', [m1, m2]);

    await repo.query('SELECT 1 as value');

    expect(observedQueries).toEqual(['SELECT 42 as value']);

    await ds.close();
    if (await pathExists(dbPath)) await fs.unlink(dbPath);
  });

  it('returns undefined from beforeQuery means no change', async () => {
    const m1: IDataSourceMiddleware = {
      beforeQuery: async () => undefined,
      afterQuery: async () => {},
    };
    const { observedQueries, middleware: m2 } = makeQueryObserver();

    const { ds, repo, dbPath } = await makeDummyRepo('nochange', [m1, m2]);

    await repo.query('SELECT 1 as value');

    expect(observedQueries).toEqual(['SELECT 1 as value']);

    await ds.close();
    if (await pathExists(dbPath)) await fs.unlink(dbPath);
  });

  it('afterQuery receives results and elapsed ms on success', async () => {
    const afterQueryCalls: Array<{
      query: string;
      resultsLength: number;
      elapsedMs: number;
      error?: unknown;
    }> = [];
    const m: IDataSourceMiddleware = {
      beforeQuery: async () => undefined,
      afterQuery: async (_provider, query, _params, results, elapsedMs, error) => {
        afterQueryCalls.push({
          query,
          resultsLength: results.length,
          elapsedMs,
          error,
        });
      },
    };

    const dbPath = path.join(os.tmpdir(), `sqlite-success-${Date.now()}-${Math.random()}.db`);
    const ds = new SqliteDatasource({ dbPath });
    await ds.open();
    await ds.query('CREATE TABLE test (id INTEGER PRIMARY KEY)');
    await ds.query('INSERT INTO test VALUES (1), (2)');
    const repo = new SqliteCrudRepository(ds, 'test', {
      middlewares: [m],
      entityName: 'test',
      primaryKeys: testPrimaryKeys('integer'),
    });

    await repo.query('SELECT * FROM test');

    expect(afterQueryCalls).toHaveLength(1);
    expect(afterQueryCalls[0]?.resultsLength).toBe(2);
    expect(afterQueryCalls[0]?.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(afterQueryCalls[0]?.error).toBeUndefined();

    await ds.close();
    if (await pathExists(dbPath)) await fs.unlink(dbPath);
  });

  it('afterQuery receives error on query failure, results is empty', async () => {
    const afterQueryCalls: Array<{
      resultsLength: number;
      error?: unknown;
    }> = [];
    const m: IDataSourceMiddleware = {
      beforeQuery: async () => undefined,
      afterQuery: async (_provider, _query, _params, results, _elapsedMs, error) => {
        afterQueryCalls.push({
          resultsLength: results.length,
          error,
        });
      },
    };

    const dbPath = path.join(os.tmpdir(), `sqlite-error-${Date.now()}-${Math.random()}.db`);
    const ds = new SqliteDatasource({ dbPath });
    await ds.open();
    const repo = new SqliteCrudRepository(ds, 'test', {
      middlewares: [m],
      entityName: 'test',
      primaryKeys: testPrimaryKeys('integer'),
    });

    await expect(repo.query('INVALID SQL HERE')).rejects.toThrow();

    expect(afterQueryCalls).toHaveLength(1);
    expect(afterQueryCalls[0]?.resultsLength).toBe(0);
    expect(afterQueryCalls[0]?.error).toBeDefined();

    await ds.close();
    if (await pathExists(dbPath)) await fs.unlink(dbPath);
  });

  it('CRUD methods route through the middleware chain', async () => {
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

    const dbPath = path.join(os.tmpdir(), `sqlite-crud-${Date.now()}-${Math.random()}.db`);
    const ds = new SqliteDatasource({ dbPath });
    await ds.open();
    await ds.query('CREATE TABLE test (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)');
    const repo = new SqliteCrudRepository(ds, 'test', {
      middlewares: [m],
      entityName: 'test',
      primaryKeys: testPrimaryKeys('integer'),
    });

    callOrder.length = 0;
    await repo.findAll();
    expect(callOrder).toEqual(['before', 'after']);

    callOrder.length = 0;
    await repo.add({ name: 'test' });
    expect(callOrder.length).toBeGreaterThan(0);
    expect(callOrder.some((c) => c === 'before')).toBe(true);
    expect(callOrder.some((c) => c === 'after')).toBe(true);

    await ds.close();
    if (await pathExists(dbPath)) await fs.unlink(dbPath);
  });
});
