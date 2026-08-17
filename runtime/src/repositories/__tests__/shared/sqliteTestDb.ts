import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathExists } from '../../pathExists';
import { SqliteDatasource } from '../../sqlite/SqliteDatasource';

export interface SqliteTestDb {
  ds: SqliteDatasource;
  teardown: () => Promise<void>;
}

/** A throwaway file-backed sqlite `SqliteDatasource` under `os.tmpdir()`, with a teardown that closes it and unlinks the file. `label` disambiguates the temp filename across suites. */
export async function openSqliteTestDb(label: string): Promise<SqliteTestDb> {
  const dbPath = path.join(os.tmpdir(), `sqlite-${label}-${Date.now()}-${Math.random()}.db`);
  const ds = new SqliteDatasource({ dbPath });
  await ds.open();
  return {
    ds,
    teardown: async () => {
      await ds.close();
      if (await pathExists(dbPath)) await fs.unlink(dbPath);
    },
  };
}
