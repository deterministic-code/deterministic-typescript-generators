import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathExists } from '../../pathExists';
import { SqliteDatasource } from '../../sqlite/SqliteDatasource';

function tempDbPath(): string {
  return path.join(
    os.tmpdir(),
    `sqlite-ds-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
  );
}

describe('SqliteDatasource', () => {
  let dbPath: string;
  let ds: SqliteDatasource;

  beforeEach(() => {
    dbPath = tempDbPath();
    ds = new SqliteDatasource({ dbPath });
  });

  afterEach(async () => {
    await ds.close();
    if (await pathExists(dbPath)) await fs.unlink(dbPath);
  });

  it('open() creates the file and applies default pragmas', async () => {
    await ds.open();
    expect(await pathExists(dbPath)).toBe(true);
    const [row] = await ds.query<{ journal_mode: string }>('PRAGMA journal_mode');
    expect(row.journal_mode).toBe('wal');
  });

  it('open() is idempotent', async () => {
    await ds.open();
    await ds.open();
    const result = await ds.query('SELECT 1 AS one');
    expect(result).toHaveLength(1);
  });

  it('query() runs SELECT and returns rows', async () => {
    await ds.open();
    const rows = await ds.query<{ value: number }>('SELECT 42 AS value');
    expect(rows).toEqual([{ value: 42 }]);
  });

  it('query() runs INSERT and returns changes/lastInsertRowid', async () => {
    await ds.open();
    await ds.query('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)');
    const [result] = await ds.query<{ changes: number; lastInsertRowid: number | bigint }>(
      'INSERT INTO t (name) VALUES (?)',
      ['x'],
    );
    expect(result.changes).toBe(1);
    expect(Number(result.lastInsertRowid)).toBe(1);
  });

  it('query() throws when called before open()', async () => {
    await expect(ds.query('SELECT 1')).rejects.toThrow('not open');
  });

  it('close() releases the handle and is safe to call twice', async () => {
    await ds.open();
    await ds.close();
    await ds.close();
    await expect(ds.query('SELECT 1')).rejects.toThrow('not open');
  });

  it('runInTransaction() issues BEGIN IMMEDIATE so write txns lock upfront instead of risking SQLITE_BUSY_SNAPSHOT under future multi-connection use', async () => {
    await ds.open();
    await ds.query('CREATE TABLE t (id INTEGER PRIMARY KEY, n INTEGER NOT NULL)');
    await ds.query('INSERT INTO t (id, n) VALUES (1, 0)');
    const db = ds.raw();
    const originalPrepare = db.prepare.bind(db);
    const prepared: string[] = [];
    (db as { prepare: typeof db.prepare }).prepare = ((sql: string) => {
      prepared.push(sql);
      return originalPrepare(sql);
    }) as typeof db.prepare;
    try {
      await ds.runInTransaction(async (txn) => {
        const rows = await txn.query<{ n: number }>('SELECT n FROM t WHERE id = 1');
        const next = rows[0].n + 1;
        await txn.query('UPDATE t SET n = ? WHERE id = 1', [next]);
      });
    } finally {
      (db as { prepare: typeof db.prepare }).prepare = originalPrepare;
    }
    expect(prepared[0]).toBe('BEGIN IMMEDIATE');
    expect(prepared).toContain('COMMIT');
    const [row] = await ds.query<{ n: number }>('SELECT n FROM t WHERE id = 1');
    expect(row.n).toBe(1);
  });
});
