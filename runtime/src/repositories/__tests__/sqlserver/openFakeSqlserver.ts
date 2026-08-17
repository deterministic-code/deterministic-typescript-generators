import type { ConnectionPool } from 'mssql';
import { SqlserverDatasource } from '../../sqlserver/SqlserverDatasource';
import { FakeMssqlPool } from './fakeMssqlPool';

/** Open a {@link SqlserverDatasource} over a {@link FakeMssqlPool}, exec `ddl`, and return the datasource plus a teardown that closes both — the shared setup for the sqlserver repository contract suites. */
export async function openFakeSqlserver(
  ddl: string,
): Promise<{ ds: SqlserverDatasource; teardown: () => Promise<void> }> {
  const pool = new FakeMssqlPool();
  const ds = new SqlserverDatasource({ pool: pool as unknown as ConnectionPool });
  await ds.open();
  await ds.query(ddl);
  return {
    ds,
    teardown: async () => {
      await ds.close();
      await pool.close();
    },
  };
}
