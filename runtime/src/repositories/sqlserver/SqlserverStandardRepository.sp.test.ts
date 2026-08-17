import { describe, expect, it, test, vi } from 'vitest';
import { SqlserverDatasource } from './SqlserverDatasource';
import { SqlserverStandardRepository } from './SqlserverStandardRepository';
import { testPrimaryKeys } from '../__tests__/testPrimaryKeys';

function makeStubPool(records: Array<{ recordset: unknown[]; rowsAffected?: number[] }>): {
  pool: unknown;
  inputs: Array<Array<[string, unknown]>>;
  queries: string[];
  executed: string[];
  outputCalls: string[];
} {
  const inputs: Array<Array<[string, unknown]>> = [];
  const queries: string[] = [];
  const executed: string[] = [];
  const outputCalls: string[] = [];
  let callIdx = 0;

  function makeRequest(): unknown {
    const localInputs: Array<[string, unknown]> = [];
    const req = {
      input: (name: string, ...rest: unknown[]) => {
        const value = rest.length === 2 ? rest[1] : rest[0];
        localInputs.push([name, value]);
        return req;
      },
      output: (name: string) => {
        outputCalls.push(name);
        return req;
      },
      query: vi.fn(async (text: string) => {
        inputs.push(localInputs);
        queries.push(text);
        const rec = records[callIdx++] ?? { recordset: [] };
        return { recordset: rec.recordset, rowsAffected: rec.rowsAffected ?? [0] };
      }),
      execute: vi.fn(async (procName: string) => {
        inputs.push(localInputs);
        executed.push(procName);
        const rec = records[callIdx++] ?? { recordset: [] };
        return {
          recordset: rec.recordset,
          recordsets: [rec.recordset],
          rowsAffected: rec.rowsAffected ?? [0],
        };
      }),
    };
    return req;
  }

  const pool = {
    connect: vi.fn(async () => pool),
    close: vi.fn(),
    request: () => makeRequest(),
    transaction: vi.fn(),
  };
  return { pool, inputs, queries, executed, outputCalls };
}

function spRepo(records: Array<{ recordset: unknown[]; rowsAffected?: number[] }>) {
  const stub = makeStubPool(records);
  const ds = new SqlserverDatasource({ pool: stub.pool as never });
  const repo = new SqlserverStandardRepository(ds, 'user', {
    entityName: 'user',
    primaryKeys: testPrimaryKeys('integer'),
    useStoredProcedures: true,
  });
  return { repo, ...stub };
}

describe('SqlserverStandardRepository — stored procedures (stub spies)', () => {
  it('without useStoredProcedures, add() issues INSERT INTO', async () => {
    const { pool, queries } = makeStubPool([
      {
        recordset: [{ id: 1, name: 'Alice', email: 'a@b.c', created: 't', updated: 't' }],
      },
    ]);
    const ds = new SqlserverDatasource({ pool: pool as never });
    const repo = new SqlserverStandardRepository(ds, 'user', {
      entityName: 'user',
      primaryKeys: testPrimaryKeys('integer'),
    });
    await repo.add({ name: 'Alice', email: 'a@b.c' } as never);
    expect(queries[0]).toMatch(/INSERT INTO \[user\]/);
    expect(queries.some((q) => /create_user/i.test(q))).toBe(false);
  });

  it('with useStoredProcedures, add() routes through proc create_user via execute() and reads id from recordset', async () => {
    const { repo, executed, outputCalls } = spRepo([
      { recordset: [{ id: 42 }] },
      { recordset: [{ id: 42, name: 'Alice', email: 'a@b.c', created: 't', updated: 't' }] },
    ]);
    await repo.add({ name: 'Alice', email: 'a@b.c' } as never);
    expect(executed).toContain('create_user');
    expect(outputCalls).toEqual([]);
  });

  it('with useStoredProcedures, findBy routes through find_user_by_<field>', async () => {
    const { repo, executed } = spRepo([{ recordset: [{ id: 1, email: 'a@b.c' }] }]);
    await repo.findBy('email', 'a@b.c');
    expect(executed).toContain('find_user_by_email');
  });

  it('with useStoredProcedures, find() routes through find_user proc', async () => {
    const { repo, executed } = spRepo([{ recordset: [{ id: 1 }] }]);
    await repo.find(1);
    expect(executed).toContain('find_user');
  });

  it('with useStoredProcedures, findAll() routes through find_users proc', async () => {
    const { repo, executed } = spRepo([{ recordset: [] }]);
    await repo.findAll();
    expect(executed).toContain('find_users');
  });

  it('useOptimisticConcurrency + useStoredProcedures=false constructs (inline OCC supported)', () => {
    const { pool } = makeStubPool([]);
    const ds = new SqlserverDatasource({ pool: pool as never });
    expect(
      () =>
        new SqlserverStandardRepository(ds, 'user', {
          entityName: 'user',
          primaryKeys: testPrimaryKeys('integer'),
          useOptimisticConcurrency: true,
          useStoredProcedures: false,
        }),
    ).not.toThrow();
  });

  it('inline update appends AND [updated] = @pN when OCC + expectedUpdated', async () => {
    const { pool, queries } = makeStubPool([
      { recordset: [{ id: 1, name: 'Alice2', updated: 'new-stamp' }], rowsAffected: [1] },
    ]);
    const ds = new SqlserverDatasource({ pool: pool as never });
    const repo = new SqlserverStandardRepository(ds, 'user', {
      entityName: 'user',
      primaryKeys: testPrimaryKeys('integer'),
      useOptimisticConcurrency: true,
      useStoredProcedures: false,
    });
    await repo.update(1 as never, { name: 'Alice2' } as never, { expectedUpdated: 'old-stamp' });
    expect(queries[0]).toMatch(/AND \[updated\] = @p\d+/);
  });

  function staleInlineOccRepo() {
    const { pool } = makeStubPool([{ recordset: [], rowsAffected: [0] }]);
    const ds = new SqlserverDatasource({ pool: pool as never });
    return new SqlserverStandardRepository(ds, 'user', {
      entityName: 'user',
      primaryKeys: testPrimaryKeys('integer'),
      useOptimisticConcurrency: true,
      useStoredProcedures: false,
    });
  }

  it('inline update throws PreconditionFailedError when 0 rows returned (stale token)', async () => {
    const repo = staleInlineOccRepo();
    await expect(
      repo.update(1 as never, { name: 'Alice2' } as never, { expectedUpdated: 'stale' }),
    ).rejects.toMatchObject({ name: 'PreconditionFailedError' });
  });

  it('inline delete throws PreconditionFailedError when 0 rows returned (stale token)', async () => {
    const repo = staleInlineOccRepo();
    await expect(repo.delete(1 as never, { expectedUpdated: 'stale' })).rejects.toMatchObject({
      name: 'PreconditionFailedError',
    });
  });

  test.todo(
    'SP lifecycle parity against real sqlserver testcontainer — no harness exists in repo yet',
  );
  test.todo(
    'OCC update conflict against real sqlserver — testcontainer harness pending GATE 15 TODO',
  );
  test.todo(
    'OCC delete conflict against real sqlserver — testcontainer harness pending GATE 15 TODO',
  );
  test.todo('findBy proc path against real sqlserver — testcontainer harness pending GATE 15 TODO');
});
