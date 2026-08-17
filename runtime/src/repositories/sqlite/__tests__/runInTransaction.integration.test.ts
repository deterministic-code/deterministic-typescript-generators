import { testPrimaryKeys } from '../../__tests__/testPrimaryKeys';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathExists } from '../../pathExists';
import { SqliteDatasource } from '../SqliteDatasource';
import { SqliteCrudRepository } from '../SqliteCrudRepository';

interface Contact {
  id: number;
  uuid: string;
  name: string;
  created: string;
  updated: string;
}

interface Address {
  id: number;
  uuid: string;
  contact_id: number;
  line1: string;
  created: string;
  updated: string;
}

describe('SqliteDatasource.runInTransaction (integration)', () => {
  let dbPath: string;
  let tempDir: string;
  let ds: SqliteDatasource;

  const makeRepos = () => ({
    contactRepo: new SqliteCrudRepository<Contact>(ds, 'contact', {
      entityName: 'test',
      primaryKeys: testPrimaryKeys('integer'),
    }),
    addressRepo: new SqliteCrudRepository<Address>(ds, 'address', {
      entityName: 'test',
      primaryKeys: testPrimaryKeys('integer'),
    }),
  });

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sqlite-txn-'));
    dbPath = path.join(tempDir, 'test.db');
    ds = new SqliteDatasource({ dbPath });
    await ds.open();
    await ds.query(
      'CREATE TABLE contact (id INTEGER PRIMARY KEY, uuid TEXT, name TEXT, created TEXT, updated TEXT)',
    );
    await ds.query(
      'CREATE TABLE address (id INTEGER PRIMARY KEY, uuid TEXT, contact_id INTEGER, line1 TEXT, created TEXT, updated TEXT)',
    );
  });

  afterEach(async () => {
    await ds.close();
    if (await pathExists(dbPath)) await fs.unlink(dbPath);
    if (await pathExists(tempDir)) await fs.rmdir(tempDir);
  });

  it('should commit rows inserted within transaction', async () => {
    const { contactRepo, addressRepo } = makeRepos();

    await ds.runInTransaction(async (txnDs) => {
      const txnContactRepo = contactRepo.cloneOnto(txnDs);
      const txnAddressRepo = addressRepo.cloneOnto(txnDs);

      await txnContactRepo.add({
        uuid: 'contact-uuid-1',
        name: 'Alice',
        created: '2026-05-07T00:00:00Z',
        updated: '2026-05-07T00:00:00Z',
      });

      await txnAddressRepo.add({
        uuid: 'address-uuid-1',
        contact_id: 1,
        line1: '123 Main St',
        created: '2026-05-07T00:00:00Z',
        updated: '2026-05-07T00:00:00Z',
      });
    });

    const contacts = await contactRepo.findAll();
    const addresses = await addressRepo.findAll();

    expect(contacts).toHaveLength(1);
    expect(contacts[0]?.name).toBe('Alice');
    expect(addresses).toHaveLength(1);
    expect(addresses[0]?.line1).toBe('123 Main St');
  });

  it('should rollback rows on error within transaction', async () => {
    const { contactRepo, addressRepo } = makeRepos();

    const testError = new Error('test rollback error');
    await expect(
      ds.runInTransaction(async (txnDs) => {
        const txnContactRepo = contactRepo.cloneOnto(txnDs);
        const txnAddressRepo = addressRepo.cloneOnto(txnDs);

        await txnContactRepo.add({
          uuid: 'contact-uuid-2',
          name: 'Bob',
          created: '2026-05-07T00:00:00Z',
          updated: '2026-05-07T00:00:00Z',
        });

        await txnAddressRepo.add({
          uuid: 'address-uuid-2',
          contact_id: 1,
          line1: '456 Oak Ave',
          created: '2026-05-07T00:00:00Z',
          updated: '2026-05-07T00:00:00Z',
        });

        throw testError;
      }),
    ).rejects.toBe(testError);

    const contacts = await contactRepo.findAll();
    const addresses = await addressRepo.findAll();

    expect(contacts).toHaveLength(0);
    expect(addresses).toHaveLength(0);
  });
});
