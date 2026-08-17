import { testPrimaryKeys } from '../testPrimaryKeys';
import {
  InMemoryCrudRepository,
  type InMemoryCrudOptions,
} from '../../inmemory/InMemoryCrudRepository';
import { InMemoryDatasource } from '../../inmemory/InMemoryDatasource';
import type { StandardIdType } from '../../standardFieldConverting';

interface TestRow {
  id: number | string;
  name: string;
  uuid?: string;
  created?: string;
  updated?: string;
}

function makeCloneFixture(
  extra: Partial<InMemoryCrudOptions> = {},
  idType: StandardIdType = 'integer',
) {
  const datasource = new InMemoryDatasource();
  const original = new InMemoryCrudRepository<TestRow>(datasource, 'test_table', {
    ...extra,
    entityName: 'test',
    primaryKeys: testPrimaryKeys(idType),
  });
  return { datasource, original };
}

describe('InMemoryCrudRepository.cloneOnto', () => {
  it('clone is an instance of InMemoryCrudRepository', () => {
    const { datasource, original } = makeCloneFixture();

    const clone = original.cloneOnto(datasource);

    expect(clone).toBeInstanceOf(InMemoryCrudRepository);
  });

  it('clone preserves middlewares from the original', () => {
    const middleware = { beforeQuery: async () => {}, afterQuery: async () => {} };
    const { datasource, original } = makeCloneFixture({ middlewares: [middleware] });

    const clone = original.cloneOnto(datasource);

    const cloneObj = clone as unknown as Record<string, unknown>;
    const originalObj = original as unknown as Record<string, unknown>;
    expect(cloneObj.middlewares).toBe(originalObj.middlewares);
  });

  it('clone preserves hasStandardColumns from the original', () => {
    const { datasource, original } = makeCloneFixture({ hasStandardColumns: false });

    const clone = original.cloneOnto(datasource);

    const cloneObj = clone as unknown as Record<string, unknown>;
    const originalObj = original as unknown as Record<string, unknown>;
    expect(cloneObj.hasStandardColumns).toBe(originalObj.hasStandardColumns);
  });

  it('clone preserves idType and primaryKeyColumn so a txn-scoped uuid create stays uuid-aware (regression: transaction repo reverted to integer id)', async () => {
    const { datasource, original } = makeCloneFixture({}, 'uuid');

    const clone = original.cloneOnto(datasource);

    const cloneObj = clone as unknown as Record<string, unknown>;
    expect(cloneObj.idType).toBe('uuid');
    expect(cloneObj.primaryKeyColumn).toBe('id');

    const created = await clone.add({ name: 'Alice' } as Omit<TestRow, 'id'>);
    expect(typeof created.id).toBe('string');
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('clone reads/writes against the txn datasource within a transaction, and rolls back on throw', async () => {
    const { datasource, original } = makeCloneFixture({ hasStandardColumns: false });

    await expect(
      datasource.runInTransaction(async (txnDs) => {
        const clone = original.cloneOnto(txnDs as InMemoryDatasource);

        await clone.add({ name: 'Alice' } as Omit<TestRow, 'id'>);
        const rows = await clone.findAll();
        expect(rows).toHaveLength(1);

        throw new Error('Simulated error');
      }),
    ).rejects.toThrow('Simulated error');

    const rows = await original.findAll();
    expect(rows).toHaveLength(0);
  });

  it('clone persists changes on successful transaction completion', async () => {
    const { datasource, original } = makeCloneFixture({ hasStandardColumns: false });

    await datasource.runInTransaction(async (txnDs) => {
      const clone = original.cloneOnto(txnDs as InMemoryDatasource);
      await clone.add({ name: 'Alice' } as Omit<TestRow, 'id'>);
    });

    const rows = await original.findAll();
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Alice');
  });
});
