/** Subpath entry for `deterministic/migrate` — runtime impl is the canonical scripts/lib/datasource-migrate.ts which vite bundles into typescript/dist/migrate.js for tarball consumers (fixes #670 ERR_PACKAGE_PATH_NOT_EXPORTED on docker_up). */
import * as impl from './datasource-migrate.ts';

export type Dialect = 'sqlite' | 'postgres' | 'mysql' | 'sqlserver' | 'oracle';

export interface MigrationDescriptor {
  name: string;
  upPath: string;
  downPath: string | null;
}

export interface MigrateClient {
  provider: Dialect;
  exec(sql: string): Promise<void>;
  query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

export interface RunResult {
  applied: boolean;
  name?: string;
}

export const normalizeDialect: (raw: string | null | undefined) => Dialect | null =
  impl.normalizeDialect;

export const discoverMigrations: (args: {
  migratePath: string;
  dialect: Dialect;
}) => Promise<MigrationDescriptor[]> = impl.discoverMigrations;

export const setupSql: (dialect: Dialect) => string[] = impl.setupSql;

export const checksum: (text: string) => string = impl.checksum;

export const readSqlStatements: (filePath: string) => Promise<string[]> = impl.readSqlStatements;

export const parseSqlStatements: (text: string) => string[] = impl.parseSqlStatements;

export const createClient: (args: {
  provider: string;
  connection: string;
}) => Promise<MigrateClient> = impl.createClient;

export const applyMysqlDdlViaTextProtocol: (conn: unknown, sql: string) => Promise<void> =
  impl.applyMysqlDdlViaTextProtocol;

export const runUp: (args: {
  client: MigrateClient;
  migrations: MigrationDescriptor[];
}) => Promise<RunResult> = impl.runUp;

export const runDown: (args: {
  client: MigrateClient;
  migrations: MigrationDescriptor[];
}) => Promise<RunResult> = impl.runDown;
