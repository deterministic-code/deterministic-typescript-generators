import { Buffer } from 'node:buffer';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteStandardRepository } from '../../sqlite/SqliteStandardRepository';
import { testPrimaryKeys } from '../testPrimaryKeys';
import { openSqliteTestDb, type SqliteTestDb } from '../shared/sqliteTestDb';

interface BinaryRow {
  id: number;
  uuid?: string;
  created: string;
  updated: string;
  label: string;
  avatar: string;
}

const b64 = (bytes: number[]) => Buffer.from(bytes).toString('base64');

describe('SqliteStandardRepository binary binding', () => {
  let db: SqliteTestDb;

  const binaryRepo = () =>
    new SqliteStandardRepository<BinaryRow>(db.ds, 'pic', {
      columnTypes: { avatar: 'binary' },
      entityName: 'pic',
      primaryKeys: testPrimaryKeys('integer'),
    });

  beforeEach(async () => {
    db = await openSqliteTestDb('bin');
    await db.ds.query(
      `CREATE TABLE pic (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid TEXT NOT NULL,
        created TEXT NOT NULL,
        updated TEXT NOT NULL,
        label TEXT NOT NULL,
        avatar BLOB
      )`,
    );
  });

  afterEach(async () => {
    await db.teardown();
  });

  it('round-trips a base64 string and decodes it to real bytes in the BLOB when columnTypes routes it through binaryFieldConverter', async () => {
    const repo = binaryRepo();
    const created = await repo.add({ label: 'with-converter', avatar: b64([1, 2, 3, 4]) });
    expect(created.avatar).toBe(b64([1, 2, 3, 4]));

    const found = await repo.find(created.id);
    expect(found!.avatar).toBe(b64([1, 2, 3, 4]));

    const raw = (await db.ds.query('SELECT avatar FROM pic WHERE id = ?', [created.id])) as Array<{
      avatar: Buffer;
    }>;
    expect(Buffer.isBuffer(raw[0].avatar)).toBe(true);
    expect(Array.from(raw[0].avatar)).toEqual([1, 2, 3, 4]);
  });

  it('binds an empty base64 string (the codegen fixture sample) as an empty blob', async () => {
    const repo = binaryRepo();
    const created = await repo.add({ label: 'empty', avatar: '' });
    expect(created.avatar).toBe('');
  });
});
