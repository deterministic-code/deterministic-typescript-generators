import { Buffer } from 'node:buffer';
import { testPrimaryKeys } from '../testPrimaryKeys';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect } from 'vitest';
import { pathExists } from '../../pathExists';
import { SqliteDatasource } from '../../sqlite/SqliteDatasource';
import { SqliteCrudRepository } from '../../sqlite/SqliteCrudRepository';

type MixedRow = {
  id: number;
  name: string;
  flag: boolean;
  when: Date;
  blob: string;
  external_id: string;
};

async function setupMixedTable() {
  const dbPath = path.join(os.tmpdir(), `sqlite-conv-${Date.now()}-${Math.random()}.db`);
  const ds = new SqliteDatasource({ dbPath });
  await ds.open();
  await ds.query(
    `CREATE TABLE mixed (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      flag INTEGER NOT NULL,
      "when" TEXT NOT NULL,
      blob BLOB NOT NULL,
      external_id TEXT NOT NULL
    )`,
  );
  const columnTypes = {
    id: 'integer',
    name: 'string',
    flag: 'boolean',
    when: 'datetime',
    blob: 'binary',
    external_id: 'uuid',
  };
  const repo = new SqliteCrudRepository<MixedRow>(ds, 'mixed', {
    columnTypes,
    entityName: 'test',
    primaryKeys: testPrimaryKeys('integer'),
  });
  return {
    ds,
    repo,
    cleanup: async () => {
      await ds.close();
      if (await pathExists(dbPath)) await fs.unlink(dbPath);
    },
  };
}

describe('SqliteCrudRepository — field type converters', () => {
  it('round-trips boolean / Date / binary / uuid via add() then find()', async () => {
    const { repo, cleanup } = await setupMixedTable();
    try {
      const when = new Date('2026-05-04T10:00:00.000Z');
      const blob = Buffer.from([1, 2, 3, 4, 5]).toString('base64');
      const uuid = '11111111-1111-4111-8111-111111111111';
      const inserted = await repo.add({
        name: 'sample',
        flag: true,
        when,
        blob,
        external_id: uuid,
      } as Omit<MixedRow, 'id'>);

      expect(typeof inserted.flag).toBe('boolean');
      expect(inserted.flag).toBe(true);
      expect(inserted.when).toBeInstanceOf(Date);
      expect((inserted.when as Date).toISOString()).toBe('2026-05-04T10:00:00.000Z');
      expect(inserted.blob).toBe(blob);
      expect(inserted.external_id).toBe(uuid);

      const fetched = await repo.find(inserted.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.flag).toBe(true);
      expect(fetched!.when).toBeInstanceOf(Date);
      expect(fetched!.blob).toBe(blob);
      expect(fetched!.external_id).toBe(uuid);
    } finally {
      await cleanup();
    }
  });

  it('applies converters on findAll() and findBy()', async () => {
    const { repo, cleanup } = await setupMixedTable();
    try {
      const blob = Buffer.from([9, 9]).toString('base64');
      const uuid = '22222222-2222-4222-8222-222222222222';
      await repo.add({
        name: 'one',
        flag: false,
        when: new Date('2026-01-01T00:00:00.000Z'),
        blob,
        external_id: uuid,
      } as Omit<MixedRow, 'id'>);

      const all = await repo.findAll();
      expect(all).toHaveLength(1);
      expect(all[0].flag).toBe(false);
      expect(all[0].when).toBeInstanceOf(Date);

      const byUuid = await repo.findBy('external_id', uuid);
      expect(byUuid).toHaveLength(1);
      expect(byUuid[0].external_id).toBe(uuid);
    } finally {
      await cleanup();
    }
  });

  it('applies to-converter on update() params and from-converter on the returned row', async () => {
    const { repo, cleanup } = await setupMixedTable();
    try {
      const inserted = await repo.add({
        name: 'one',
        flag: false,
        when: new Date('2026-01-01T00:00:00.000Z'),
        blob: Buffer.from([0]).toString('base64'),
        external_id: '33333333-3333-4333-8333-333333333333',
      } as Omit<MixedRow, 'id'>);

      const updated = await repo.update(inserted.id, {
        flag: true,
        when: new Date('2026-12-31T23:59:59.000Z'),
      });
      expect(updated).not.toBeNull();
      expect(updated!.flag).toBe(true);
      expect((updated!.when as Date).toISOString()).toBe('2026-12-31T23:59:59.000Z');
    } finally {
      await cleanup();
    }
  });

  it('without columnTypes, behaves byte-for-byte as before (boolean stays as 0/1, datetime as text)', async () => {
    const dbPath = path.join(os.tmpdir(), `sqlite-noconv-${Date.now()}-${Math.random()}.db`);
    const ds = new SqliteDatasource({ dbPath });
    await ds.open();
    try {
      await ds.query(
        `CREATE TABLE legacy (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          flag INTEGER NOT NULL,
          "when" TEXT NOT NULL
        )`,
      );
      type LegacyRow = { id: number; name: string; flag: number; when: string };
      const repo = new SqliteCrudRepository<LegacyRow>(ds, 'legacy', {
        entityName: 'test',
        primaryKeys: testPrimaryKeys('integer'),
      });
      const inserted = await repo.add({
        name: 'plain',
        flag: true as unknown as number,
        when: new Date('2026-05-04T10:00:00.000Z') as unknown as string,
      } as Omit<LegacyRow, 'id'>);
      // returned via the inline shim — no converter applied; boolean stays 1, Date stays ISO string
      const fetched = await repo.find(inserted.id);
      expect(fetched!.flag).toBe(1);
      expect(typeof fetched!.when).toBe('string');
      expect(fetched!.when).toBe('2026-05-04T10:00:00.000Z');
    } finally {
      await ds.close();
      if (await pathExists(dbPath)) await fs.unlink(dbPath);
    }
  });
});
