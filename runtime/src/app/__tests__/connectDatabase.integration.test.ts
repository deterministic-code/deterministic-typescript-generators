import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import Database from 'better-sqlite3';
import { connectDatabase } from '../connectDatabase';
import { SqliteDatasource } from '../../repositories/sqlite/SqliteDatasource';

const ENV_KEYS = ['DATABASE_BACKEND', 'DATABASE_URL'] as const;

describe('connectDatabase', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('returns a memory connection when explicit backend=memory', async () => {
    const conn = await connectDatabase({ backend: 'memory' });
    expect(conn.type).toBe('memory');
    await conn.close();
  });

  it('opens an in-memory sqlite connection by default', async () => {
    const conn = await connectDatabase({ backend: 'sqlite' });
    expect(conn.type).toBe('sqlite');
    await conn.close();
  });

  it('invokes onSqliteFirstOpen when sqlite is fresh', async () => {
    let called = 0;
    const conn = await connectDatabase({
      backend: 'sqlite',
      sqliteFile: ':memory:',
      onSqliteFirstOpen: () => {
        called += 1;
      },
    });
    expect(called).toBe(1);
    await conn.close();
  });

  it('does not invoke onSqliteFirstOpen when isSqliteFresh returns false', async () => {
    let called = 0;
    const conn = await connectDatabase({
      backend: 'sqlite',
      sqliteFile: ':memory:',
      isSqliteFresh: () => false,
      onSqliteFirstOpen: () => {
        called += 1;
      },
    });
    expect(called).toBe(0);
    await conn.close();
  });

  it('rejects an unknown DATABASE_BACKEND env value', async () => {
    process.env.DATABASE_BACKEND = 'cockroachdb';
    await expect(connectDatabase()).rejects.toThrow(/not a supported backend/);
  });

  it('rejects oracle without a database URL', async () => {
    await expect(connectDatabase({ backend: 'oracle' })).rejects.toThrow(
      /oracle requires a database URL/,
    );
  });

  it('rejects postgres without a database URL', async () => {
    await expect(connectDatabase({ backend: 'postgres' })).rejects.toThrow(
      /postgres requires a database URL/,
    );
  });

  it('rejects mysql without a database URL', async () => {
    await expect(connectDatabase({ backend: 'mysql' })).rejects.toThrow(
      /mysql requires a database URL/,
    );
  });

  it('falls back to sqlite when DATABASE_BACKEND is unset', async () => {
    const conn = await connectDatabase();
    expect(conn.type).toBe('sqlite');
    await conn.close();
  });

  it('reads DATABASE_BACKEND from env when no explicit backend is passed', async () => {
    process.env.DATABASE_BACKEND = 'memory';
    const conn = await connectDatabase();
    expect(conn.type).toBe('memory');
    await conn.close();
  });

  it('applies sqlite migrations from migrationsDir before returning the connection', async () => {
    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'connectdb-'));
    const dbFile = path.join(workDir, 'app.db');
    const migrationsDir = path.join(workDir, 'migrations');
    await fs.mkdir(migrationsDir);
    await fs.writeFile(
      path.join(migrationsDir, '1700000001_initial_up.sql'),
      "CREATE TABLE widgets (id INTEGER PRIMARY KEY, name TEXT); INSERT INTO widgets (id, name) VALUES (1, 'alpha');",
    );

    try {
      const conn = await connectDatabase({
        backend: 'sqlite',
        sqliteFile: dbFile,
        migrationsDir,
      });
      await conn.close();

      const db = new Database(dbFile);
      const rows = db.prepare('SELECT id, name FROM widgets ORDER BY id').all();
      expect(rows).toEqual([{ id: 1, name: 'alpha' }]);
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all() as Array<{ name: string }>;
      expect(tables.map((t) => t.name)).toContain('schema_migrations');
      db.close();
    } finally {
      await fs.rm(workDir, { recursive: true, force: true });
    }
  });

  it('applies sqlite migrations on :memory: against the same handle the datasource will use', async () => {
    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'connectdb-mem-'));
    const migrationsDir = path.join(workDir, 'migrations');
    await fs.mkdir(migrationsDir);
    await fs.writeFile(
      path.join(migrationsDir, '1700000001_initial_up.sql'),
      "CREATE TABLE widgets (id INTEGER PRIMARY KEY, name TEXT); INSERT INTO widgets (id, name) VALUES (1, 'alpha');",
    );

    try {
      const conn = await connectDatabase({
        backend: 'sqlite',
        sqliteFile: ':memory:',
        migrationsDir,
      });
      if (conn.type !== 'sqlite') {
        throw new Error(`expected sqlite connection, got ${conn.type}`);
      }
      const datasource = conn.datasource;
      if (!(datasource instanceof SqliteDatasource)) {
        throw new Error('expected SqliteDatasource on sqlite connection');
      }
      const raw = datasource.raw();
      const rows = raw.prepare('SELECT id, name FROM widgets ORDER BY id').all();
      expect(rows).toEqual([{ id: 1, name: 'alpha' }]);
      await conn.close();
    } finally {
      await fs.rm(workDir, { recursive: true, force: true });
    }
  });
});
