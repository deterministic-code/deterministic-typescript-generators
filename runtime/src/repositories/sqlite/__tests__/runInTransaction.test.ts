import { describe, it, expect, vi } from 'vitest';
import Database from 'better-sqlite3';
import type { IDatasource } from '../../IDatasource';
import { SqliteDatasource } from '../SqliteDatasource';
import { SqliteTxnDatasource } from '../SqliteTxnDatasource';

describe('SqliteDatasource.runInTransaction', () => {
  it('should begin, commit on success, and release connection', async () => {
    const mockDb = {
      prepare: vi.fn(),
    } as unknown as Database.Database;

    const beginStmt = { run: vi.fn() };
    const commitStmt = { run: vi.fn() };
    const endTransactionStmt = { run: vi.fn() };

    let prepareCallCount = 0;
    vi.mocked(mockDb.prepare).mockImplementation((sql: string) => {
      prepareCallCount++;
      if (sql === 'BEGIN IMMEDIATE') return beginStmt as unknown as Database.Statement;
      if (sql === 'COMMIT') return commitStmt as unknown as Database.Statement;
      if (sql === 'ROLLBACK') return endTransactionStmt as unknown as Database.Statement;
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const ds = new SqliteDatasource({ dbPath: ':memory:' });
    Object.defineProperty(ds, 'db', {
      get: () => mockDb,
      configurable: true,
    });

    let fnCalled = false;
    await ds.runInTransaction(async (txn: IDatasource) => {
      fnCalled = true;
      expect(txn).toBeInstanceOf(SqliteTxnDatasource);
    });

    expect(fnCalled).toBe(true);
    expect(beginStmt.run).toHaveBeenCalled();
    expect(commitStmt.run).toHaveBeenCalled();
  });

  it('should rollback and re-throw on error', async () => {
    const mockDb = {
      prepare: vi.fn(),
    } as unknown as Database.Database;

    const beginStmt = { run: vi.fn() };
    const rollbackStmt = { run: vi.fn() };

    vi.mocked(mockDb.prepare).mockImplementation((sql: string) => {
      if (sql === 'BEGIN IMMEDIATE') return beginStmt as unknown as Database.Statement;
      if (sql === 'ROLLBACK') return rollbackStmt as unknown as Database.Statement;
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const ds = new SqliteDatasource({ dbPath: ':memory:' });
    Object.defineProperty(ds, 'db', {
      get: () => mockDb,
      configurable: true,
    });

    const testError = new Error('test error');
    await expect(
      ds.runInTransaction(async () => {
        throw testError;
      }),
    ).rejects.toBe(testError);

    expect(beginStmt.run).toHaveBeenCalled();
    expect(rollbackStmt.run).toHaveBeenCalled();
  });
});

describe('SqliteTxnDatasource', () => {
  it('should query using the provided database connection', async () => {
    const mockDb = {
      prepare: vi.fn(),
    } as unknown as Database.Database;

    const queryStmt = {
      reader: true,
      all: vi.fn().mockReturnValue([{ id: 1 }]),
    };

    vi.mocked(mockDb.prepare).mockReturnValue(queryStmt as unknown as Database.Statement);

    const txnDs = new SqliteTxnDatasource(mockDb);
    const result = await txnDs.query('SELECT * FROM users WHERE id = ?', [1]);

    expect(result).toEqual([{ id: 1 }]);
    expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM users WHERE id = ?');
  });

  it('should handle write queries', async () => {
    const mockDb = {
      prepare: vi.fn(),
    } as unknown as Database.Database;

    const writeStmt = {
      reader: false,
      run: vi.fn().mockReturnValue({ changes: 1, lastInsertRowid: 42 }),
    };

    vi.mocked(mockDb.prepare).mockReturnValue(writeStmt as unknown as Database.Statement);

    const txnDs = new SqliteTxnDatasource(mockDb);
    const result = await txnDs.query('INSERT INTO users (name) VALUES (?)', ['Alice']);

    expect(result).toEqual([{ changes: 1, lastInsertRowid: 42 }]);
    expect(mockDb.prepare).toHaveBeenCalledWith('INSERT INTO users (name) VALUES (?)');
  });

  it('open() and close() are no-ops', async () => {
    const mockDb = {
      prepare: vi.fn(),
    } as unknown as Database.Database;

    const txnDs = new SqliteTxnDatasource(mockDb);
    await expect(txnDs.open()).resolves.toBeUndefined();
    await expect(txnDs.close()).resolves.toBeUndefined();
  });

  it('nested runInTransaction uses SAVEPOINT', async () => {
    const mockDb = {
      prepare: vi.fn(),
    } as unknown as Database.Database;

    const savepointStmt = { run: vi.fn() };
    const releaseSavepointStmt = { run: vi.fn() };

    vi.mocked(mockDb.prepare).mockImplementation((sql: string) => {
      if (sql.startsWith('SAVEPOINT')) return savepointStmt as unknown as Database.Statement;
      if (sql.startsWith('RELEASE SAVEPOINT'))
        return releaseSavepointStmt as unknown as Database.Statement;
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const txnDs = new SqliteTxnDatasource(mockDb);
    let nestedCallCount = 0;
    await txnDs.runInTransaction(async () => {
      nestedCallCount++;
    });

    expect(nestedCallCount).toBe(1);
    expect(savepointStmt.run).toHaveBeenCalled();
    expect(releaseSavepointStmt.run).toHaveBeenCalled();
  });

  it('nested runInTransaction rolls back to SAVEPOINT on error', async () => {
    const mockDb = {
      prepare: vi.fn(),
    } as unknown as Database.Database;

    const savepointStmt = { run: vi.fn() };
    const rollbackToSavepointStmt = { run: vi.fn() };
    const releaseSavepointStmt = { run: vi.fn() };

    vi.mocked(mockDb.prepare).mockImplementation((sql: string) => {
      if (sql.startsWith('SAVEPOINT')) return savepointStmt as unknown as Database.Statement;
      if (sql.startsWith('ROLLBACK TO SAVEPOINT'))
        return rollbackToSavepointStmt as unknown as Database.Statement;
      if (sql.startsWith('RELEASE SAVEPOINT'))
        return releaseSavepointStmt as unknown as Database.Statement;
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const txnDs = new SqliteTxnDatasource(mockDb);
    const testError = new Error('nested test error');

    await expect(
      txnDs.runInTransaction(async () => {
        throw testError;
      }),
    ).rejects.toBe(testError);

    expect(savepointStmt.run).toHaveBeenCalled();
    expect(rollbackToSavepointStmt.run).toHaveBeenCalled();
    expect(releaseSavepointStmt.run).toHaveBeenCalled();
  });
});
