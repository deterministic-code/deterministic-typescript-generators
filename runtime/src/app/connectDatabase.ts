import {
  MysqlDatasource,
  MysqlSetup,
  PostgresDatasource,
  PostgresSetup,
  SqliteDatasource,
  SqliteSetup,
  type DatabaseConnection,
} from '../repositories';
// SqlserverDatasource / SqlserverSetup / OracleDatasource / OracleSetup live
// behind the `repositories/sqlserver` and `repositories/oracle` subpaths
// rather than the main barrel — their peer deps (mssql, oracledb) are
// optional and pulling them into the default chunk would force every
// consumer to install them. Import directly so the main bundle stays slim.
import { SqlserverDatasource } from '../repositories/sqlserver/SqlserverDatasource';
import { SqlserverSetup } from '../repositories/sqlserver/SqlserverSetup';
import { OracleDatasource } from '../repositories/oracle/OracleDatasource';
import { OracleSetup } from '../repositories/oracle/OracleSetup';

export type SupportedBackend = 'sqlite' | 'postgres' | 'mysql' | 'sqlserver' | 'oracle' | 'memory';

const VALID_BACKENDS: readonly SupportedBackend[] = [
  'sqlite',
  'postgres',
  'mysql',
  'sqlserver',
  'oracle',
  'memory',
];

export type SqliteHandle = ReturnType<SqliteDatasource['raw']>;

export interface ConnectDatabaseOptions {
  backend?: SupportedBackend;
  databaseUrl?: string;
  sqliteFile?: string;
  onSqliteFirstOpen?: (db: SqliteHandle) => void | Promise<void>;
  isSqliteFresh?: (sqliteFile: string) => boolean | Promise<boolean>;
  migrationsDir?: string;
  seedFile?: string;
}

function resolveBackend(explicit: SupportedBackend | undefined): SupportedBackend {
  if (explicit) return explicit;
  const raw = process.env.DATABASE_BACKEND;
  if (!raw) return 'sqlite';
  if (!(VALID_BACKENDS as readonly string[]).includes(raw)) {
    throw new Error(
      `DATABASE_BACKEND=${raw} is not a supported backend. Valid values: ${VALID_BACKENDS.join(', ')}.`,
    );
  }
  return raw as SupportedBackend;
}

export async function connectDatabase(
  options: ConnectDatabaseOptions = {},
): Promise<DatabaseConnection> {
  const backend = resolveBackend(options.backend);

  switch (backend) {
    case 'memory':
      return { type: 'memory', close: () => Promise.resolve() };

    case 'sqlite': {
      const dbFile = options.sqliteFile ?? ':memory:';
      const fresh = options.isSqliteFresh
        ? await options.isSqliteFresh(dbFile)
        : dbFile === ':memory:';
      const datasource = new SqliteDatasource({ dbPath: dbFile });
      await datasource.open();
      // Apply migrations against the datasource's live handle so `:memory:`
      // (which dies when its connection closes) ends up with the schema
      // the caller's repos will then query. For file-backed DBs the
      // behavior is unchanged — same handle, same effect.
      if (options.migrationsDir) {
        await new SqliteSetup({
          dbPath: dbFile,
          migrationsDir: options.migrationsDir,
          seedFile: options.seedFile,
          database: datasource.raw(),
        }).run();
      }
      if (fresh && options.onSqliteFirstOpen) {
        await options.onSqliteFirstOpen(datasource.raw());
      }
      return { type: 'sqlite', datasource, close: () => datasource.close() };
    }

    case 'postgres': {
      const url = options.databaseUrl ?? process.env.DATABASE_URL;
      if (!url) {
        throw new Error(
          'DATABASE_BACKEND=postgres requires a database URL (options.databaseUrl or DATABASE_URL env).',
        );
      }
      // /* @vite-ignore */ keeps Vitest's dep optimizer from pre-bundling
      // the optional `pg` peer dep. Without it, the static scan walks
      // every `await import(...)` call (including this `case "postgres":`
      // branch) and crashes consumers who installed sqlite-only with
      // "Cannot find package 'pg' imported from .../loadServiceSpecs-*.js"
      // at suite-load time. The same applies to mysql2 / mssql / oracledb
      // below.
      const { Pool: PgPool } = await import(/* @vite-ignore */ 'pg');
      const pool = new PgPool({ connectionString: url });
      const datasource = new PostgresDatasource({ pool });
      // Apply migrations against the SAME pool the caller's repos will
      // use — same model as the sqlite branch above. Without this, a
      // fresh run against postgres would boot against an empty
      // database and the first INSERT would fail with "relation does
      // not exist".
      if (options.migrationsDir) {
        await new PostgresSetup({
          datasource,
          migrationsDir: options.migrationsDir,
          seedFile: options.seedFile,
        }).run();
      }
      return { type: 'postgres', datasource, close: () => pool.end() };
    }

    case 'sqlserver': {
      const url = options.databaseUrl ?? process.env.DATABASE_URL;
      if (!url) {
        throw new Error(
          'DATABASE_BACKEND=sqlserver requires a database URL (options.databaseUrl or DATABASE_URL env).',
        );
      }
      // Accept `mssql://user:pass@host:port/db` so the URL contract
      // stays symmetric with postgres/mysql. The mssql driver itself
      // wants a config object — parse the URL into one here. Encrypt
      // is off for the test-container case; users can pass a config
      // object directly via options.databaseUrl if they need
      // production TLS / DSN options.
      const parsed = new URL(url);
      const datasource = new SqlserverDatasource({
        poolConfig: {
          server: parsed.hostname,
          port: parsed.port ? Number(parsed.port) : 1433,
          database: parsed.pathname.replace(/^\//, '') || 'master',
          user: decodeURIComponent(parsed.username),
          password: decodeURIComponent(parsed.password),
          options: {
            encrypt: false,
            trustServerCertificate: true,
          },
        },
      });
      if (options.migrationsDir) {
        await new SqlserverSetup({
          datasource,
          migrationsDir: options.migrationsDir,
          seedFile: options.seedFile,
        }).run();
      } else {
        await datasource.open();
      }
      return {
        type: 'sqlserver',
        datasource,
        close: () => datasource.close(),
      };
    }

    case 'oracle': {
      const url = options.databaseUrl ?? process.env.DATABASE_URL;
      if (!url) {
        throw new Error(
          'DATABASE_BACKEND=oracle requires a database URL (options.databaseUrl or DATABASE_URL env).',
        );
      }
      // Accept `oracle://user:pass@host:port/SERVICE` so the URL contract
      // stays symmetric with the other dialects. The oracledb driver
      // wants `connectString` in EZCONNECT form
      // (host:port/service-name), so we reassemble from the parsed URL.
      const parsed = new URL(url);
      const service = parsed.pathname.replace(/^\//, '') || 'FREEPDB1';
      const port = parsed.port || '1521';
      const datasource = new OracleDatasource({
        poolConfig: {
          user: decodeURIComponent(parsed.username),
          password: decodeURIComponent(parsed.password),
          connectString: `${parsed.hostname}:${port}/${service}`,
        },
      });
      if (options.migrationsDir) {
        await new OracleSetup({
          datasource,
          migrationsDir: options.migrationsDir,
          seedFile: options.seedFile,
        }).run();
      } else {
        await datasource.open();
      }
      return { type: 'oracle', datasource, close: () => datasource.close() };
    }

    case 'mysql': {
      const url = options.databaseUrl ?? process.env.DATABASE_URL;
      if (!url) {
        throw new Error(
          'DATABASE_BACKEND=mysql requires a database URL (options.databaseUrl or DATABASE_URL env).',
        );
      }
      const mysql = await import(/* @vite-ignore */ 'mysql2/promise');
      const mysqlPool = mysql.createPool(url);
      const datasource = new MysqlDatasource({ pool: mysqlPool });
      // Apply migrations against the same pool the repos will use —
      // same model as the sqlite and postgres branches. Without this,
      // a fresh run against MySQL would hit "Table doesn't exist".
      if (options.migrationsDir) {
        await new MysqlSetup({
          datasource,
          migrationsDir: options.migrationsDir,
          seedFile: options.seedFile,
        }).run();
      }
      return { type: 'mysql', datasource, close: () => mysqlPool.end() };
    }
  }
}
