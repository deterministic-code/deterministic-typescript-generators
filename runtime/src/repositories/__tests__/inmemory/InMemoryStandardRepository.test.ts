import { InMemoryStandardRepository } from '../../inmemory/InMemoryStandardRepository';
import { InMemoryDatasource } from '../../inmemory/InMemoryDatasource';
import { testPrimaryKeys } from '../testPrimaryKeys';
import {
  describeStandardRepositoryContract,
  type SimpleStandardRow,
} from '../shared/standardRepositoryContract';

describeStandardRepositoryContract(
  'InMemoryStandardRepository',
  async () => {
    const datasource = new InMemoryDatasource();
    const repo = new InMemoryStandardRepository<SimpleStandardRow>(datasource, 'test_table', {
      entityName: 'test_table',
      primaryKeys: testPrimaryKeys('integer'),
    });
    return {
      repo,
      teardown: async () => {},
    };
  },
  { idType: 'integer' },
);

describeStandardRepositoryContract(
  'InMemoryStandardRepository',
  async () => {
    const datasource = new InMemoryDatasource();
    const repo = new InMemoryStandardRepository<SimpleStandardRow>(datasource, 'test_table', {
      entityName: 'test_table',
      primaryKeys: testPrimaryKeys('uuid'),
      withUuidColumn: false,
    });
    return {
      repo,
      teardown: async () => {},
    };
  },
  { idType: 'uuid', withUuidColumn: false },
);

describe('InMemoryStandardRepository extras', () => {
  it('query() inherits the no-SQL behavior', async () => {
    const datasource = new InMemoryDatasource();
    const repo = new InMemoryStandardRepository<SimpleStandardRow>(datasource, 'test_table', {
      entityName: 'test_table',
      primaryKeys: testPrimaryKeys('integer'),
    });
    await expect(repo.query('SELECT 1')).rejects.toThrow(
      'InMemory backend does not support raw SQL queries',
    );
  });
});

describe('InMemoryStandardRepository ordering, findIn, and edge cases', () => {
  function makeRepo(idType: 'integer' | 'biginteger' | 'uuid') {
    const datasource = new InMemoryDatasource();
    return new InMemoryStandardRepository<SimpleStandardRow>(datasource, 'test_table', {
      entityName: 'test_table',
      primaryKeys: testPrimaryKeys(idType),
    });
  }

  async function seedThree(repo: InMemoryStandardRepository<SimpleStandardRow>) {
    await repo.add({ name: 'x', value: 1 });
    await repo.add({ name: 'x', value: 2 });
    await repo.add({ name: 'y', value: 3 });
  }

  function idsAscending(rows: ReadonlyArray<{ id: number | bigint | string }>): boolean {
    for (let i = 1; i < rows.length; i++) {
      if (rows[i].id <= rows[i - 1].id) return false;
    }
    return true;
  }

  async function updateBothXsTo99(repo: InMemoryStandardRepository<SimpleStandardRow>) {
    const updated = await repo.updateBy('name', 'x', { value: 99 });
    expect(updated).toHaveLength(2);
    expect(updated.every((r) => r.value === 99)).toBe(true);
    return updated;
  }

  for (const idType of ['integer', 'biginteger'] as const) {
    it(`findAll sorts ascending by id for ${idType} keys`, async () => {
      const repo = makeRepo(idType);
      await seedThree(repo);
      const all = await repo.findAll();
      expect(all).toHaveLength(3);
      expect(idsAscending(all)).toBe(true);
    });

    it(`findBy sorts the matching rows ascending by id for ${idType} keys`, async () => {
      const repo = makeRepo(idType);
      await seedThree(repo);
      const xs = await repo.findBy('name', 'x');
      expect(xs).toHaveLength(2);
      expect(idsAscending(xs)).toBe(true);
    });

    it(`findIn matches multiple values and sorts ascending by id for ${idType} keys`, async () => {
      const repo = makeRepo(idType);
      await seedThree(repo);
      const matched = await repo.findIn('value', [1, 3]);
      expect(matched.map((r) => r.value).sort((a, b) => a - b)).toEqual([1, 3]);
      expect(idsAscending(matched)).toBe(true);
    });

    it(`updateBy returns the updated rows sorted ascending by id for ${idType} keys`, async () => {
      const repo = makeRepo(idType);
      await seedThree(repo);
      const updated = await updateBothXsTo99(repo);
      expect(idsAscending(updated)).toBe(true);
    });
  }

  it('sort comparators hold order when ids are neither number nor bigint (uuid keys)', async () => {
    const repo = makeRepo('uuid');
    await seedThree(repo);

    expect(await repo.findAll()).toHaveLength(3);
    expect(await repo.findIn('value', [1, 3])).toHaveLength(2);
    await updateBothXsTo99(repo);
  });

  it('findIn short-circuits to [] for an empty value list', async () => {
    const repo = makeRepo('integer');
    await seedThree(repo);
    expect(await repo.findIn('value', [])).toEqual([]);
  });

  it('update returns null when no row carries the id', async () => {
    const repo = makeRepo('integer');
    await repo.add({ name: 'x', value: 1 });
    expect(await repo.update(9999, { value: 5 })).toBeNull();
  });

  it('delete returns false when no row carries the id', async () => {
    const repo = makeRepo('integer');
    await repo.add({ name: 'x', value: 1 });
    expect(await repo.delete(9999)).toBe(false);
  });

  it('nextUuidId generates a fresh uuid each call', () => {
    const repo = makeRepo('integer');
    const generate = (repo as unknown as { nextUuidId: () => string }).nextUuidId;
    const first = generate();
    const second = generate();
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(first).not.toBe(second);
  });
});
