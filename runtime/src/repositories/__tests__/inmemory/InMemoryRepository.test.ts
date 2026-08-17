import { InMemoryRepository } from '../../inmemory/InMemoryRepository';
import { InMemoryDatasource } from '../../inmemory/InMemoryDatasource';

describe('InMemoryRepository', () => {
  it('throws when query() is called — InMemory backend has no SQL', async () => {
    const datasource = new InMemoryDatasource();
    const repo = new InMemoryRepository(datasource);
    await expect(repo.query('SELECT 1')).rejects.toThrow(
      'InMemory backend does not support raw SQL queries',
    );
  });
});
