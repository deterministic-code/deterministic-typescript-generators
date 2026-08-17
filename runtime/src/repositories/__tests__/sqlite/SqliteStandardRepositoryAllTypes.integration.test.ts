import { Buffer } from 'node:buffer';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteStandardRepository } from '../../sqlite/SqliteStandardRepository';
import { testPrimaryKeys } from '../testPrimaryKeys';
import { openSqliteTestDb, type SqliteTestDb } from '../shared/sqliteTestDb';

interface AllTypesRow {
  id: number;
  uuid?: string;
  created: string;
  updated: string;
  s_text: string;
  s_uuid: string;
  s_number: number;
  s_integer: number;
  s_smallinteger: number;
  s_biginteger: number;
  s_float: number;
  s_boolean: boolean;
  s_datetime: Date;
  s_binary: string;
}

const COLUMN_TYPES = {
  s_text: 'string',
  s_uuid: 'uuid',
  s_number: 'number',
  s_integer: 'integer',
  s_smallinteger: 'smallinteger',
  s_biginteger: 'biginteger',
  s_float: 'float',
  s_boolean: 'boolean',
  s_datetime: 'datetime',
  s_binary: 'binary',
} as const;

const SAMPLE_UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const SAMPLE_DATE = new Date('2024-03-14T09:26:53.000Z');

describe('SqliteStandardRepository round-trips every sql type via columnTypes converters', () => {
  let db: SqliteTestDb;

  const makeRepo = () =>
    new SqliteStandardRepository<AllTypesRow>(db.ds, 'thing', {
      columnTypes: COLUMN_TYPES,
      entityName: 'thing',
      primaryKeys: testPrimaryKeys('integer'),
    });

  beforeEach(async () => {
    db = await openSqliteTestDb('alltypes');
    await db.ds.query(
      `CREATE TABLE thing (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid TEXT NOT NULL,
        created TEXT NOT NULL,
        updated TEXT NOT NULL,
        s_text TEXT NOT NULL,
        s_uuid TEXT NOT NULL,
        s_number REAL NOT NULL,
        s_integer INTEGER NOT NULL,
        s_smallinteger INTEGER NOT NULL,
        s_biginteger INTEGER NOT NULL,
        s_float REAL NOT NULL,
        s_boolean INTEGER NOT NULL,
        s_datetime TEXT NOT NULL,
        s_binary BLOB NOT NULL
      )`,
    );
  });

  afterEach(async () => {
    await db.teardown();
  });

  it('add() then find() returns each type in its round-tripped language form', async () => {
    const repo = makeRepo();
    const created = await repo.add({
      s_text: 'hello',
      s_uuid: SAMPLE_UUID,
      s_number: 42,
      s_integer: 7,
      s_smallinteger: 3,
      s_biginteger: 9007199254740991,
      s_float: 3.5,
      s_boolean: true,
      s_datetime: SAMPLE_DATE,
      s_binary: Buffer.from([10, 20, 30, 40]).toString('base64'),
    });

    const found = await repo.find(created.id);
    expect(found).not.toBeNull();
    const row = found!;

    expect(row.s_text).toBe('hello');
    expect(row.s_uuid).toBe(SAMPLE_UUID);
    expect(row.s_number).toBe(42);
    expect(row.s_integer).toBe(7);
    expect(row.s_smallinteger).toBe(3);
    expect(row.s_biginteger).toBe(9007199254740991);
    expect(row.s_float).toBeCloseTo(3.5);

    expect(typeof row.s_boolean).toBe('boolean');
    expect(row.s_boolean).toBe(true);

    expect(row.s_datetime).toBeInstanceOf(Date);
    expect(row.s_datetime.toISOString()).toBe(SAMPLE_DATE.toISOString());

    expect(row.s_binary).toBe(Buffer.from([10, 20, 30, 40]).toString('base64'));
  });

  it('round-trips a false boolean as stored 0 back to boolean', async () => {
    const repo = makeRepo();
    const created = await repo.add({
      s_text: 'x',
      s_uuid: SAMPLE_UUID,
      s_number: 0,
      s_integer: 0,
      s_smallinteger: 0,
      s_biginteger: 0,
      s_float: 0,
      s_boolean: false,
      s_datetime: SAMPLE_DATE,
      s_binary: '',
    });
    const found = await repo.find(created.id);
    expect(found!.s_boolean).toBe(false);
    expect(found!.s_binary).toBe('');
  });

  it('boolean stored value is the integer 0/1 the sqlite converter produces', async () => {
    const repo = makeRepo();
    const created = await repo.add({
      s_text: 'x',
      s_uuid: SAMPLE_UUID,
      s_number: 1,
      s_integer: 1,
      s_smallinteger: 1,
      s_biginteger: 1,
      s_float: 1,
      s_boolean: true,
      s_datetime: SAMPLE_DATE,
      s_binary: Buffer.from([1]).toString('base64'),
    });
    const raw = await db.ds.query<{ s_boolean: number; s_datetime: string }>(
      'SELECT s_boolean, s_datetime FROM thing WHERE id = ?',
      [created.id],
    );
    expect(raw[0].s_boolean).toBe(1);
    expect(raw[0].s_datetime).toBe(SAMPLE_DATE.toISOString());
  });

  it('findBy on a converter-backed column binds the converted value', async () => {
    const repo = makeRepo();
    const created = await repo.add({
      s_text: 'findme',
      s_uuid: SAMPLE_UUID,
      s_number: 5,
      s_integer: 5,
      s_smallinteger: 5,
      s_biginteger: 5,
      s_float: 5,
      s_boolean: true,
      s_datetime: SAMPLE_DATE,
      s_binary: Buffer.from([9]).toString('base64'),
    });
    const matches = await repo.findBy('s_boolean', true);
    expect(matches.map((r) => r.id)).toContain(created.id);
    const noMatches = await repo.findBy('s_boolean', false);
    expect(noMatches.map((r) => r.id)).not.toContain(created.id);
  });
});
