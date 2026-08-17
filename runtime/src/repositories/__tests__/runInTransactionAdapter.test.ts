import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runInTransactionAdapter, type TxnPrimitives } from '../runInTransactionAdapter';
import type { IDatasource } from '../IDatasource';

describe('runInTransactionAdapter', () => {
  let mockPrimitives: TxnPrimitives<{ id: string }>;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockPrimitives = {
      acquireConnection: vi.fn(),
      beginOnConnection: vi.fn(),
      commitOnConnection: vi.fn(),
      rollbackOnConnection: vi.fn(),
      releaseConnection: vi.fn(),
      makeTxnDatasource: vi.fn(),
    };
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('semantic 1: call order on success', () => {
    it('calls acquireConnection, beginOnConnection, makeTxnDatasource, fn, commitOnConnection, releaseConnection in order', async () => {
      const mockConn = { id: 'conn1' };
      const mockTxnDs = { query: vi.fn() } as any as IDatasource;
      const mockFn = vi.fn().mockResolvedValue(42);

      (mockPrimitives.acquireConnection as any).mockResolvedValue(mockConn);
      (mockPrimitives.makeTxnDatasource as any).mockReturnValue(mockTxnDs);

      const result = await runInTransactionAdapter(mockPrimitives, mockFn);

      expect(result).toBe(42);
      expect(mockPrimitives.acquireConnection).toHaveBeenCalledOnce();
      expect(mockPrimitives.beginOnConnection).toHaveBeenCalledOnce();
      expect(mockPrimitives.beginOnConnection).toHaveBeenCalledWith(mockConn);
      expect(mockPrimitives.makeTxnDatasource).toHaveBeenCalledOnce();
      expect(mockPrimitives.makeTxnDatasource).toHaveBeenCalledWith(mockConn);
      expect(mockFn).toHaveBeenCalledOnce();
      expect(mockFn).toHaveBeenCalledWith(mockTxnDs);
      expect(mockPrimitives.commitOnConnection).toHaveBeenCalledOnce();
      expect(mockPrimitives.commitOnConnection).toHaveBeenCalledWith(mockConn);
      expect(mockPrimitives.releaseConnection).toHaveBeenCalledOnce();
      expect(mockPrimitives.releaseConnection).toHaveBeenCalledWith(mockConn);

      const acquireOrder = (mockPrimitives.acquireConnection as any).mock.invocationCallOrder[0];
      const beginOrder = (mockPrimitives.beginOnConnection as any).mock.invocationCallOrder[0];
      const makeTxnOrder = (mockPrimitives.makeTxnDatasource as any).mock.invocationCallOrder[0];
      const fnOrder = (mockFn as any).mock.invocationCallOrder[0];
      const commitOrder = (mockPrimitives.commitOnConnection as any).mock.invocationCallOrder[0];
      const releaseOrder = (mockPrimitives.releaseConnection as any).mock.invocationCallOrder[0];

      expect(acquireOrder).toBeLessThan(beginOrder);
      expect(beginOrder).toBeLessThan(makeTxnOrder);
      expect(makeTxnOrder).toBeLessThan(fnOrder);
      expect(fnOrder).toBeLessThan(commitOrder);
      expect(commitOrder).toBeLessThan(releaseOrder);
    });
  });

  describe('semantic 2: fn success returns value', () => {
    it('returns the value that fn resolves with', async () => {
      const mockConn = { id: 'conn1' };
      const mockTxnDs = { query: vi.fn() } as any as IDatasource;
      const expectedValue = { data: 'result' };
      const mockFn = vi.fn().mockResolvedValue(expectedValue);

      (mockPrimitives.acquireConnection as any).mockResolvedValue(mockConn);
      (mockPrimitives.makeTxnDatasource as any).mockReturnValue(mockTxnDs);

      const result = await runInTransactionAdapter(mockPrimitives, mockFn);

      expect(result).toBe(expectedValue);
    });
  });

  describe('semantic 3: fn throws - rollback then re-throw original error', () => {
    it('calls rollbackOnConnection and releaseConnection, then re-throws the original error unwrapped', async () => {
      const mockConn = { id: 'conn1' };
      const mockTxnDs = { query: vi.fn() } as any as IDatasource;
      const originalError = new Error('fn failed');
      const mockFn = vi.fn().mockRejectedValue(originalError);

      (mockPrimitives.acquireConnection as any).mockResolvedValue(mockConn);
      (mockPrimitives.makeTxnDatasource as any).mockReturnValue(mockTxnDs);

      await expect(runInTransactionAdapter(mockPrimitives, mockFn)).rejects.toThrow(originalError);

      expect(mockPrimitives.rollbackOnConnection).toHaveBeenCalledOnce();
      expect(mockPrimitives.rollbackOnConnection).toHaveBeenCalledWith(mockConn);
      expect(mockPrimitives.releaseConnection).toHaveBeenCalledOnce();
      expect(mockPrimitives.commitOnConnection).not.toHaveBeenCalled();

      const rollbackOrder = (mockPrimitives.rollbackOnConnection as any).mock
        .invocationCallOrder[0];
      const releaseOrder = (mockPrimitives.releaseConnection as any).mock.invocationCallOrder[0];
      expect(rollbackOrder).toBeLessThan(releaseOrder);
    });
  });

  describe('semantic 4: commitOnConnection throws after fn success', () => {
    it('still calls releaseConnection, then propagates the commit error', async () => {
      const mockConn = { id: 'conn1' };
      const mockTxnDs = { query: vi.fn() } as any as IDatasource;
      const commitError = new Error('commit failed');
      const mockFn = vi.fn().mockResolvedValue(42);

      (mockPrimitives.acquireConnection as any).mockResolvedValue(mockConn);
      (mockPrimitives.makeTxnDatasource as any).mockReturnValue(mockTxnDs);
      (mockPrimitives.commitOnConnection as any).mockRejectedValue(commitError);

      await expect(runInTransactionAdapter(mockPrimitives, mockFn)).rejects.toThrow(commitError);

      expect(mockPrimitives.releaseConnection).toHaveBeenCalledOnce();
      expect(mockPrimitives.rollbackOnConnection).not.toHaveBeenCalled();

      const commitOrder = (mockPrimitives.commitOnConnection as any).mock.invocationCallOrder[0];
      const releaseOrder = (mockPrimitives.releaseConnection as any).mock.invocationCallOrder[0];
      expect(commitOrder).toBeLessThan(releaseOrder);
    });
  });

  describe('semantic 5: rollbackOnConnection throws after fn already threw', () => {
    it('still calls releaseConnection, logs rollback error to console.error, but propagates the original fn error', async () => {
      const mockConn = { id: 'conn1' };
      const mockTxnDs = { query: vi.fn() } as any as IDatasource;
      const originalError = new Error('fn failed');
      const rollbackError = new Error('rollback failed');
      const mockFn = vi.fn().mockRejectedValue(originalError);

      (mockPrimitives.acquireConnection as any).mockResolvedValue(mockConn);
      (mockPrimitives.makeTxnDatasource as any).mockReturnValue(mockTxnDs);
      (mockPrimitives.rollbackOnConnection as any).mockRejectedValue(rollbackError);

      await expect(runInTransactionAdapter(mockPrimitives, mockFn)).rejects.toThrow(originalError);

      expect(mockPrimitives.releaseConnection).toHaveBeenCalledOnce();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('rollback'), rollbackError);

      const rollbackOrder = (mockPrimitives.rollbackOnConnection as any).mock
        .invocationCallOrder[0];
      const releaseOrder = (mockPrimitives.releaseConnection as any).mock.invocationCallOrder[0];
      expect(rollbackOrder).toBeLessThan(releaseOrder);
    });
  });

  describe('semantic 6: releaseConnection throws', () => {
    it('propagates release error when no other error is in flight (after fn success)', async () => {
      const mockConn = { id: 'conn1' };
      const mockTxnDs = { query: vi.fn() } as any as IDatasource;
      const releaseError = new Error('release failed');
      const mockFn = vi.fn().mockResolvedValue(42);

      (mockPrimitives.acquireConnection as any).mockResolvedValue(mockConn);
      (mockPrimitives.makeTxnDatasource as any).mockReturnValue(mockTxnDs);
      (mockPrimitives.releaseConnection as any).mockRejectedValue(releaseError);

      await expect(runInTransactionAdapter(mockPrimitives, mockFn)).rejects.toThrow(releaseError);
    });

    it('suppresses release error (logs to console.error) when fn error is in flight', async () => {
      const mockConn = { id: 'conn1' };
      const mockTxnDs = { query: vi.fn() } as any as IDatasource;
      const originalError = new Error('fn failed');
      const releaseError = new Error('release failed');
      const mockFn = vi.fn().mockRejectedValue(originalError);

      (mockPrimitives.acquireConnection as any).mockResolvedValue(mockConn);
      (mockPrimitives.makeTxnDatasource as any).mockReturnValue(mockTxnDs);
      (mockPrimitives.releaseConnection as any).mockRejectedValue(releaseError);

      await expect(runInTransactionAdapter(mockPrimitives, mockFn)).rejects.toThrow(originalError);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('release'), releaseError);
    });

    it('suppresses release error (logs to console.error) when commit error is in flight', async () => {
      const mockConn = { id: 'conn1' };
      const mockTxnDs = { query: vi.fn() } as any as IDatasource;
      const commitError = new Error('commit failed');
      const releaseError = new Error('release failed');
      const mockFn = vi.fn().mockResolvedValue(42);

      (mockPrimitives.acquireConnection as any).mockResolvedValue(mockConn);
      (mockPrimitives.makeTxnDatasource as any).mockReturnValue(mockTxnDs);
      (mockPrimitives.commitOnConnection as any).mockRejectedValue(commitError);
      (mockPrimitives.releaseConnection as any).mockRejectedValue(releaseError);

      await expect(runInTransactionAdapter(mockPrimitives, mockFn)).rejects.toThrow(commitError);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('release'), releaseError);
    });
  });

  describe('semantic 7: acquireConnection failure', () => {
    it('throws acquire error directly without calling begin, makeTxnDatasource, fn, commit, rollback, or release', async () => {
      const acquireError = new Error('acquire failed');
      const mockFn = vi.fn();

      (mockPrimitives.acquireConnection as any).mockRejectedValue(acquireError);

      await expect(runInTransactionAdapter(mockPrimitives, mockFn)).rejects.toThrow(acquireError);

      expect(mockPrimitives.beginOnConnection).not.toHaveBeenCalled();
      expect(mockPrimitives.makeTxnDatasource).not.toHaveBeenCalled();
      expect(mockFn).not.toHaveBeenCalled();
      expect(mockPrimitives.commitOnConnection).not.toHaveBeenCalled();
      expect(mockPrimitives.rollbackOnConnection).not.toHaveBeenCalled();
      expect(mockPrimitives.releaseConnection).not.toHaveBeenCalled();
    });
  });

  describe('semantic 8: beginOnConnection failure', () => {
    it('calls releaseConnection, then throws begin error without calling makeTxnDatasource, fn, commit, or rollback', async () => {
      const mockConn = { id: 'conn1' };
      const beginError = new Error('begin failed');
      const mockFn = vi.fn();

      (mockPrimitives.acquireConnection as any).mockResolvedValue(mockConn);
      (mockPrimitives.beginOnConnection as any).mockRejectedValue(beginError);

      await expect(runInTransactionAdapter(mockPrimitives, mockFn)).rejects.toThrow(beginError);

      expect(mockPrimitives.releaseConnection).toHaveBeenCalledOnce();
      expect(mockPrimitives.releaseConnection).toHaveBeenCalledWith(mockConn);
      expect(mockPrimitives.makeTxnDatasource).not.toHaveBeenCalled();
      expect(mockFn).not.toHaveBeenCalled();
      expect(mockPrimitives.commitOnConnection).not.toHaveBeenCalled();
      expect(mockPrimitives.rollbackOnConnection).not.toHaveBeenCalled();

      const beginOrder = (mockPrimitives.beginOnConnection as any).mock.invocationCallOrder[0];
      const releaseOrder = (mockPrimitives.releaseConnection as any).mock.invocationCallOrder[0];
      expect(beginOrder).toBeLessThan(releaseOrder);
    });
  });

  describe('edge case: release error during begin failure path', () => {
    it('propagates release error when begin failed and release also fails', async () => {
      const mockConn = { id: 'conn1' };
      const beginError = new Error('begin failed');
      const releaseError = new Error('release failed');
      const mockFn = vi.fn();

      (mockPrimitives.acquireConnection as any).mockResolvedValue(mockConn);
      (mockPrimitives.beginOnConnection as any).mockRejectedValue(beginError);
      (mockPrimitives.releaseConnection as any).mockRejectedValue(releaseError);

      await expect(runInTransactionAdapter(mockPrimitives, mockFn)).rejects.toThrow(releaseError);
    });
  });
});
