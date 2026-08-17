import { testPrimaryKeys } from '../testPrimaryKeys';
import { InMemoryCrudRepository } from '../../inmemory/InMemoryCrudRepository';
import { InMemoryDatasource } from '../../inmemory/InMemoryDatasource';

interface TestRow {
  id: number;
  name: string;
}

describe('InMemoryCrudRepository transaction support', () => {
  it('commit case: runInTransaction with successful callback persists rows from both add() calls', async () => {
    const datasource = new InMemoryDatasource();
    const repo = new InMemoryCrudRepository<TestRow>(datasource, 'test_table', {
      entityName: 'test',
      primaryKeys: testPrimaryKeys('integer'),
    });

    await datasource.runInTransaction(async () => {
      await repo.add({ name: 'Alice' });
      await repo.add({ name: 'Bob' });
    });

    const all = await repo.findAll();
    expect(all).toHaveLength(2);
    expect(all[0].name).toBe('Alice');
    expect(all[1].name).toBe('Bob');
  });

  it('rollback case: runInTransaction rolls back when callback throws after adds', async () => {
    const datasource = new InMemoryDatasource();
    const repo = new InMemoryCrudRepository<TestRow>(datasource, 'test_table', {
      entityName: 'test',
      primaryKeys: testPrimaryKeys('integer'),
    });

    await expect(
      datasource.runInTransaction(async () => {
        await repo.add({ name: 'Alice' });
        await repo.add({ name: 'Bob' });
        throw new Error('Simulated error');
      }),
    ).rejects.toThrow('Simulated error');

    const all = await repo.findAll();
    expect(all).toHaveLength(0);
  });

  it('rollback across two repos: rollback affects both contact and address repos sharing same datasource', async () => {
    const datasource = new InMemoryDatasource();
    const contactRepo = new InMemoryCrudRepository<TestRow>(datasource, 'contact', {
      entityName: 'test',
      primaryKeys: testPrimaryKeys('integer'),
    });
    const addressRepo = new InMemoryCrudRepository<TestRow>(datasource, 'address', {
      entityName: 'test',
      primaryKeys: testPrimaryKeys('integer'),
    });

    await expect(
      datasource.runInTransaction(async () => {
        await contactRepo.add({ name: 'Contact1' });
        await addressRepo.add({ name: 'Address1' });
        throw new Error('Simulated error');
      }),
    ).rejects.toThrow('Simulated error');

    const contacts = await contactRepo.findAll();
    const addresses = await addressRepo.findAll();
    expect(contacts).toHaveLength(0);
    expect(addresses).toHaveLength(0);
  });
});
