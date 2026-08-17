import { describe, it, expect, vi } from 'vitest';
import type { IDatasource } from '../../IDatasource';
import { SqlserverDatasource } from '../SqlserverDatasource';
import { SqlserverTxnDatasource } from '../SqlserverTxnDatasource';

describe('SqlserverDatasource.runInTransaction', () => {
  it('should begin, commit on success, and release connection', async () => {
    const mockRequest = {
      input: vi.fn().mockReturnThis(),
      query: vi.fn(),
    };

    const mockTxn = {
      begin: vi.fn(),
      commit: vi.fn(),
      request: vi.fn().mockReturnValue(mockRequest),
    };

    const mockPool = {
      transaction: vi.fn().mockReturnValue(mockTxn),
      request: vi.fn(),
      connect: vi.fn(),
      close: vi.fn(),
    };

    const ds = new SqlserverDatasource({ pool: mockPool as unknown as any });

    let fnCalled = false;
    await ds.runInTransaction(async (txn: IDatasource) => {
      fnCalled = true;
      expect(txn).toBeInstanceOf(SqlserverTxnDatasource);
    });

    expect(fnCalled).toBe(true);
    expect(mockTxn.begin).toHaveBeenCalled();
    expect(mockTxn.commit).toHaveBeenCalled();
  });

  it('should rollback and re-throw on error', async () => {
    const mockRequest = {
      input: vi.fn().mockReturnThis(),
      query: vi.fn(),
    };

    const mockTxn = {
      begin: vi.fn(),
      rollback: vi.fn(),
      request: vi.fn().mockReturnValue(mockRequest),
    };

    const mockPool = {
      transaction: vi.fn().mockReturnValue(mockTxn),
      request: vi.fn(),
      connect: vi.fn(),
      close: vi.fn(),
    };

    const ds = new SqlserverDatasource({ pool: mockPool as unknown as any });

    const testError = new Error('test error');
    await expect(
      ds.runInTransaction(async () => {
        throw testError;
      }),
    ).rejects.toBe(testError);

    expect(mockTxn.begin).toHaveBeenCalled();
    expect(mockTxn.rollback).toHaveBeenCalled();
  });
});

describe('SqlserverTxnDatasource', () => {
  it('should query using the provided transaction', async () => {
    const mockRequest = {
      input: vi.fn().mockReturnThis(),
      query: vi.fn().mockResolvedValue({ recordset: [{ id: 1 }], rowsAffected: [0] }),
    };

    const mockTxn = {
      request: vi.fn().mockReturnValue(mockRequest),
    };

    const txnDs = new SqlserverTxnDatasource(mockTxn as unknown as any);
    const result = await txnDs.query('SELECT * FROM users WHERE id = @p1', [1]);

    expect(result).toEqual([{ id: 1 }]);
    expect(mockTxn.request).toHaveBeenCalled();
    expect(mockRequest.input).toHaveBeenCalledWith('p1', 1);
    expect(mockRequest.query).toHaveBeenCalledWith('SELECT * FROM users WHERE id = @p1');
  });

  it('should handle write queries', async () => {
    const mockRequest = {
      input: vi.fn().mockReturnThis(),
      query: vi.fn().mockResolvedValue({ recordset: [], rowsAffected: [1] }),
    };

    const mockTxn = {
      request: vi.fn().mockReturnValue(mockRequest),
    };

    const txnDs = new SqlserverTxnDatasource(mockTxn as unknown as any);
    const result = await txnDs.query('INSERT INTO users (name) VALUES (@p1)', ['Alice']);

    expect(result).toEqual([]);
    expect(mockTxn.request).toHaveBeenCalled();
    expect(mockRequest.input).toHaveBeenCalledWith('p1', 'Alice');
  });

  it('open() and close() are no-ops', async () => {
    const mockTxn = {
      request: vi.fn(),
    };

    const txnDs = new SqlserverTxnDatasource(mockTxn as unknown as any);
    await expect(txnDs.open()).resolves.toBeUndefined();
    await expect(txnDs.close()).resolves.toBeUndefined();
  });

  it('nested runInTransaction uses SAVE TRANSACTION', async () => {
    const mockRequest = {
      input: vi.fn().mockReturnThis(),
      query: vi.fn().mockResolvedValue({ recordset: [], rowsAffected: [0] }),
    };

    const mockTxn = {
      request: vi.fn().mockReturnValue(mockRequest),
    };

    const txnDs = new SqlserverTxnDatasource(mockTxn as unknown as any);
    let nestedCallCount = 0;
    await txnDs.runInTransaction(async () => {
      nestedCallCount++;
    });

    expect(nestedCallCount).toBe(1);
    expect(mockRequest.query).toHaveBeenCalledWith(expect.stringMatching(/^SAVE TRANSACTION/));
  });

  it('nested runInTransaction rolls back to SAVE TRANSACTION on error', async () => {
    const mockRequest = {
      input: vi.fn().mockReturnThis(),
      query: vi.fn().mockResolvedValue({ recordset: [], rowsAffected: [0] }),
    };

    const mockTxn = {
      request: vi.fn().mockReturnValue(mockRequest),
    };

    const txnDs = new SqlserverTxnDatasource(mockTxn as unknown as any);
    const testError = new Error('nested test error');

    await expect(
      txnDs.runInTransaction(async () => {
        throw testError;
      }),
    ).rejects.toBe(testError);

    expect(mockRequest.query).toHaveBeenCalledWith(expect.stringMatching(/^SAVE TRANSACTION/));
    expect(mockRequest.query).toHaveBeenCalledWith(expect.stringMatching(/^ROLLBACK TRANSACTION/));
  });
});
