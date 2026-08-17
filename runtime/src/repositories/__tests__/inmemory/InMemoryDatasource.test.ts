import { describe, it, expect } from 'vitest';
import type { IDatasource } from '../../IDatasource';
import { InMemoryDatasource } from '../../inmemory/InMemoryDatasource';

describe('InMemoryDatasource', () => {
  describe('open()', () => {
    it('is a no-op and does not throw', async () => {
      const ds = new InMemoryDatasource();
      await expect(ds.open()).resolves.toBeUndefined();
    });
  });

  describe('close()', () => {
    it('clears all tables', async () => {
      const ds = new InMemoryDatasource();
      const table1 = ds.getTable('users');
      table1.rows.push({ id: 1, name: 'Alice' });
      const table2 = ds.getTable('posts');
      table2.rows.push({ id: 1, title: 'Hello' });

      await ds.close();

      expect(ds.getTable('users').rows).toEqual([]);
      expect(ds.getTable('posts').rows).toEqual([]);
    });
  });

  describe('query()', () => {
    it('throws with the exact error message used by InMemoryCrudRepository', async () => {
      const ds = new InMemoryDatasource();
      await expect(ds.query('SELECT 1')).rejects.toThrow(
        'InMemory backend does not support raw SQL queries',
      );
    });

    it('throws the same error message for any SQL', async () => {
      const ds = new InMemoryDatasource();
      await expect(ds.query('INSERT INTO foo VALUES (1)', [1])).rejects.toThrow(
        'InMemory backend does not support raw SQL queries',
      );
    });
  });

  describe('getTable()', () => {
    it('returns the same object reference on repeated calls for the same table name', async () => {
      const ds = new InMemoryDatasource();
      const table1 = ds.getTable('users');
      const table2 = ds.getTable('users');
      expect(table1).toBe(table2);
    });

    it('returns different object references for different table names', async () => {
      const ds = new InMemoryDatasource();
      const users = ds.getTable('users');
      const posts = ds.getTable('posts');
      expect(users).not.toBe(posts);
    });

    it('initializes new tables with rows as empty array and nextId as 1', async () => {
      const ds = new InMemoryDatasource();
      const table = ds.getTable('users');
      expect(table.rows).toEqual([]);
      expect(table.nextId).toBe(1);
    });
  });

  describe('runInTransaction()', () => {
    it('executes the callback and returns its result on success', async () => {
      const ds = new InMemoryDatasource();
      const result = await ds.runInTransaction(async (txn) => {
        const table = (txn as InMemoryDatasource).getTable('users');
        table.rows.push({ id: 1, name: 'Alice' });
        return 'success';
      });
      expect(result).toBe('success');
    });

    it('passes the same datasource instance (not a sub-datasource) to the callback', async () => {
      const ds = new InMemoryDatasource();
      let receivedDs: IDatasource | null = null;
      await ds.runInTransaction(async (txn) => {
        receivedDs = txn;
      });
      expect(receivedDs).toBe(ds);
    });

    it('deep-clones tables before invoking the callback using structuredClone', async () => {
      const ds = new InMemoryDatasource();
      const table = ds.getTable('users');
      table.rows.push({ id: 1, name: 'Alice' });
      table.nextId = 2;

      await ds
        .runInTransaction(async (txn) => {
          const txnTable = (txn as InMemoryDatasource).getTable('users');
          txnTable.rows.push({ id: 2, name: 'Bob' });
          txnTable.nextId = 3;
          throw new Error('rollback');
        })
        .catch(() => {});

      const restoredTable = ds.getTable('users');
      expect(restoredTable.rows).toEqual([{ id: 1, name: 'Alice' }]);
      expect(restoredTable.nextId).toBe(2);
    });

    it('discards snapshot and persists changes on callback success', async () => {
      const ds = new InMemoryDatasource();
      const table = ds.getTable('users');
      table.rows.push({ id: 1, name: 'Alice' });

      await ds.runInTransaction(async (txn) => {
        const txnTable = (txn as InMemoryDatasource).getTable('users');
        txnTable.rows.push({ id: 2, name: 'Bob' });
        txnTable.nextId = 3;
      });

      const restoredTable = ds.getTable('users');
      expect(restoredTable.rows).toEqual([
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ]);
      expect(restoredTable.nextId).toBe(3);
    });

    it('restores tables from snapshot on callback throw', async () => {
      const ds = new InMemoryDatasource();
      const table = ds.getTable('users');
      table.rows.push({ id: 1, name: 'Alice' });
      table.nextId = 2;

      await expect(
        ds.runInTransaction(async (txn) => {
          const txnTable = (txn as InMemoryDatasource).getTable('users');
          txnTable.rows.push({ id: 2, name: 'Bob' });
          txnTable.nextId = 3;
          throw new Error('test error');
        }),
      ).rejects.toThrow('test error');

      const restoredTable = ds.getTable('users');
      expect(restoredTable.rows).toEqual([{ id: 1, name: 'Alice' }]);
      expect(restoredTable.nextId).toBe(2);
    });

    it('re-throws the original error after rollback', async () => {
      const ds = new InMemoryDatasource();
      const originalError = new Error('original error message');

      await expect(
        ds.runInTransaction(async () => {
          throw originalError;
        }),
      ).rejects.toBe(originalError);
    });

    it('supports nested transactions where inner rollback does not affect outer state if outer succeeds', async () => {
      const ds = new InMemoryDatasource();
      const users = ds.getTable('users');
      users.rows.push({ id: 1, name: 'Alice' });

      let innerError: Error | null = null;

      await ds.runInTransaction(async (outer) => {
        const outerDs = outer as InMemoryDatasource;
        const outerUsers = outerDs.getTable('users');
        outerUsers.rows.push({ id: 2, name: 'Bob' });

        try {
          await outerDs.runInTransaction(async (inner) => {
            const innerDs = inner as InMemoryDatasource;
            const innerUsers = innerDs.getTable('users');
            innerUsers.rows.push({ id: 3, name: 'Charlie' });
            throw new Error('inner rollback');
          });
        } catch (e) {
          innerError = e instanceof Error ? e : null;
        }
      });

      expect(innerError).toBeTruthy();
      expect(innerError!.message).toBe('inner rollback');
      const final = ds.getTable('users');
      expect(final.rows).toEqual([
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ]);
    });

    it('supports nested transactions where inner succeeds and outer rolls back', async () => {
      const ds = new InMemoryDatasource();
      const users = ds.getTable('users');
      users.rows.push({ id: 1, name: 'Alice' });

      await expect(
        ds.runInTransaction(async (outer) => {
          const outerDs = outer as InMemoryDatasource;
          const outerUsers = outerDs.getTable('users');
          outerUsers.rows.push({ id: 2, name: 'Bob' });

          await outerDs.runInTransaction(async (inner) => {
            const innerDs = inner as InMemoryDatasource;
            const innerUsers = innerDs.getTable('users');
            innerUsers.rows.push({ id: 3, name: 'Charlie' });
          });

          throw new Error('outer rollback');
        }),
      ).rejects.toThrow('outer rollback');

      const final = ds.getTable('users');
      expect(final.rows).toEqual([{ id: 1, name: 'Alice' }]);
    });

    it('persists tables created inside a successful transaction by reference equality', async () => {
      const ds = new InMemoryDatasource();

      let createdTableRef = ds.getTable('__dummy__');

      await ds.runInTransaction(async (txn) => {
        const txnDs = txn as InMemoryDatasource;
        createdTableRef = txnDs.getTable('logs');
        createdTableRef.rows.push({ id: 1, msg: 'test' });
      });

      const retrievedTable = ds.getTable('logs');
      expect(retrievedTable).toBe(createdTableRef);
      expect(retrievedTable.rows).toEqual([{ id: 1, msg: 'test' }]);
    });

    it('restores row contents of existing tables after rollback while preserving object reference', async () => {
      const ds = new InMemoryDatasource();
      const preRollbackTable = ds.getTable('users');
      preRollbackTable.rows.push({ id: 1, name: 'Alice' });

      await expect(
        ds.runInTransaction(async (txn) => {
          const txnTable = (txn as InMemoryDatasource).getTable('users');
          txnTable.rows.push({ id: 2, name: 'Bob' });
          throw new Error('rollback');
        }),
      ).rejects.toThrow('rollback');

      const postRollbackTable = ds.getTable('users');
      expect(postRollbackTable.rows).toEqual([{ id: 1, name: 'Alice' }]);
    });

    it('handles multiple tables in a single transaction with independent snapshots', async () => {
      const ds = new InMemoryDatasource();
      const users = ds.getTable('users');
      users.rows.push({ id: 1, name: 'Alice' });
      const posts = ds.getTable('posts');
      posts.rows.push({ id: 1, title: 'Hello' });

      await expect(
        ds.runInTransaction(async (txn) => {
          const txnDs = txn as InMemoryDatasource;
          const txnUsers = txnDs.getTable('users');
          txnUsers.rows.push({ id: 2, name: 'Bob' });
          const txnPosts = txnDs.getTable('posts');
          txnPosts.rows.push({ id: 2, title: 'World' });
          throw new Error('rollback both');
        }),
      ).rejects.toThrow('rollback both');

      expect(ds.getTable('users').rows).toEqual([{ id: 1, name: 'Alice' }]);
      expect(ds.getTable('posts').rows).toEqual([{ id: 1, title: 'Hello' }]);
    });
  });
});
