import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ConnectionPool } from 'mssql';
import { SqlserverDatasource } from '../../sqlserver/SqlserverDatasource';
import { SqlserverSetup } from '../../sqlserver/SqlserverSetup';
import { FakeMssqlPool } from './fakeMssqlPool';

async function tempDir(): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), 'mssql-setup-'));
}

describe('SqlserverSetup', () => {
  let pool: FakeMssqlPool;
  let datasource: SqlserverDatasource;

  beforeEach(() => {
    pool = new FakeMssqlPool();
    datasource = new SqlserverDatasource({ pool: pool as unknown as ConnectionPool });
  });

  afterEach(async () => {
    await datasource.close();
    await pool.close();
  });

  it('run() creates schema_migrations table', async () => {
    await new SqlserverSetup({ datasource }).run();
    const rows = await datasource.query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'",
    );
    expect(rows).toHaveLength(1);
  });

  it('run() applies migrations and skips already-applied ones', async () => {
    const dir = await tempDir();
    try {
      await fs.writeFile(
        path.join(dir, 'V001__create_widgets.sql'),
        'CREATE TABLE widgets (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)',
      );
      await fs.writeFile(
        path.join(dir, 'V002__add_color.sql'),
        'ALTER TABLE widgets ADD COLUMN color TEXT',
      );

      await new SqlserverSetup({ datasource, migrationsDir: dir }).run();
      await new SqlserverSetup({ datasource, migrationsDir: dir }).run();

      const versions = await datasource.query<{ version: string }>(
        'SELECT version FROM schema_migrations ORDER BY version',
      );
      expect(versions).toEqual([{ version: 'V001' }, { version: 'V002' }]);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
