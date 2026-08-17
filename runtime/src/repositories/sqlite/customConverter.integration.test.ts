import { testPrimaryKeys } from '../__tests__/testPrimaryKeys';
import { describe, expect, it } from 'vitest';
import type { ITypeFieldConverter } from '../../converters/ITypeFieldConverter';
import { buildRepoForBackend } from '../buildRepoForBackend';
import { SqliteDatasource } from './SqliteDatasource';

const noopClose = () => Promise.resolve();

const secretConverter: ITypeFieldConverter<string, string> = {
  fromDatasource: 'sqlite',
  toLanguage: 'typescript',
  datasourceType: 'string',
  to: (value) => (value == null ? value : `ENC:${value}`),
  from: (value) => (value == null ? value : String(value).replace(/^ENC:/, '')),
};

interface SecretRow {
  id: number;
  token: string;
}

async function withRepo(
  fieldConverters: ReadonlyMap<string, ITypeFieldConverter> | undefined,
  run: (
    repo: ReturnType<typeof buildRepoForBackend<SecretRow>>,
    ds: SqliteDatasource,
  ) => Promise<void>,
): Promise<void> {
  const datasource = new SqliteDatasource({ dbPath: ':memory:' });
  await datasource.open();
  try {
    await datasource.query('CREATE TABLE secret (id INTEGER PRIMARY KEY, token TEXT)');
    const repo = buildRepoForBackend<SecretRow>(
      { type: 'sqlite', datasource, close: noopClose },
      'secret',
      { fieldConverters, entityName: 'test', primaryKeys: testPrimaryKeys('integer') },
    );
    await run(repo, datasource);
  } finally {
    await datasource.close();
  }
}

describe('SqliteCrudRepository per-field type_converter', () => {
  it('applies to() on write and from() on read so the round trip is transparent', async () => {
    await withRepo(new Map([['token', secretConverter]]), async (repo, datasource) => {
      const added = await repo.add({ token: 'hunter2' });
      expect(added.token).toBe('hunter2');

      const raw = await datasource.query<{ token: string }>(
        'SELECT token FROM secret WHERE id = 1',
      );
      expect(raw[0].token).toBe('ENC:hunter2');

      const found = await repo.find(1);
      expect(found?.token).toBe('hunter2');
    });
  });

  it('stores the raw value verbatim when no per-field converter is configured', async () => {
    await withRepo(undefined, async (repo, datasource) => {
      await repo.add({ token: 'hunter2' });
      const raw = await datasource.query<{ token: string }>(
        'SELECT token FROM secret WHERE id = 1',
      );
      expect(raw[0].token).toBe('hunter2');
    });
  });
});
