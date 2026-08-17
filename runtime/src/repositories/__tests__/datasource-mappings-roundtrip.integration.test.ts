import { testPrimaryKeys } from './testPrimaryKeys';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ITypeFieldConverter } from '../../converters/ITypeFieldConverter';
import { FieldMappingTranslator } from '../FieldMappingTranslator';
import { getEntityFieldMap, parseFieldMappings } from '../parseFieldMappings';
import { SqliteCrudRepository } from '../sqlite/SqliteCrudRepository';
import { SqliteDatasource } from '../sqlite/SqliteDatasource';

interface User {
  id: number;
  email: string;
  name: string;
  createdAt: string;
}

const spec = {
  types: [
    {
      user: {
        fields: [
          { id: { type: 'integer' } },
          { email: { type: 'string', size: 256 } },
          { name: { type: 'string', size: 256 } },
          { createdAt: { type: 'datetime' } },
        ],
      },
    },
  ],
  datasource_mappings: [
    {
      user: {
        source: 'app_user',
        field_mappings: [
          { id: { source: 'USER_ID' } },
          { email: { source: 'EMAIL_ADDRESS' } },
          { name: { source: 'FULL_NAME' } },
          { createdAt: { source: 'RECORD_CREATED_AT' } },
        ],
      },
    },
  ],
};

function makeUserRepo(ds: SqliteDatasource): SqliteCrudRepository<User> {
  const entityMap = getEntityFieldMap(parseFieldMappings(spec), 'user');
  return new SqliteCrudRepository<User>(ds, 'app_user', {
    fieldMappings: entityMap,
    entityName: 'test',
    primaryKeys: testPrimaryKeys('integer'),
  });
}

async function createSchema(ds: SqliteDatasource): Promise<void> {
  await ds.query(
    'CREATE TABLE app_user (USER_ID INTEGER PRIMARY KEY AUTOINCREMENT, EMAIL_ADDRESS TEXT NOT NULL, FULL_NAME TEXT NOT NULL, RECORD_CREATED_AT TEXT NOT NULL)',
  );
}

describe('datasource_mappings roundtrip on SQLite', () => {
  let ds: SqliteDatasource;

  beforeEach(async () => {
    ds = new SqliteDatasource({ dbPath: ':memory:' });
    await ds.open();
    await createSchema(ds);
  });

  afterEach(async () => {
    await ds.close();
  });

  it('parseFieldMappings -> FieldMappingTranslator wires logical-to-physical column names', () => {
    const mappings = parseFieldMappings(spec);
    const entityMap = getEntityFieldMap(mappings, 'user');
    const translator = new FieldMappingTranslator(entityMap);

    expect(translator.toPhysical('email')).toBe('EMAIL_ADDRESS');
    expect(translator.toPhysical('id')).toBe('USER_ID');
    expect(translator.toPhysical('name')).toBe('FULL_NAME');
    expect(translator.toPhysical('createdAt')).toBe('RECORD_CREATED_AT');

    expect(translator.toLogical('FULL_NAME')).toBe('name');
    expect(translator.toLogical('EMAIL_ADDRESS')).toBe('email');

    expect(translator.toPhysical('unknown')).toBe('unknown');
    expect(translator.toLogical('UNKNOWN_COL')).toBe('UNKNOWN_COL');
  });

  it('CRUD insert via logical names populates physical columns', async () => {
    const repo = makeUserRepo(ds);

    const added = await repo.add({
      email: 'alice@a.com',
      name: 'Alice',
      createdAt: '2026-01-01T00:00:00.000Z',
    });

    expect(added).toMatchObject({
      email: 'alice@a.com',
      name: 'Alice',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(typeof added.id).toBe('number');
    expect(Object.keys(added).sort()).toEqual(['createdAt', 'email', 'id', 'name']);

    const raw = await ds.query<{
      USER_ID: number;
      EMAIL_ADDRESS: string;
      FULL_NAME: string;
      RECORD_CREATED_AT: string;
    }>('SELECT USER_ID, EMAIL_ADDRESS, FULL_NAME, RECORD_CREATED_AT FROM app_user');
    expect(raw).toHaveLength(1);
    expect(raw[0]).toEqual({
      USER_ID: added.id,
      EMAIL_ADDRESS: 'alice@a.com',
      FULL_NAME: 'Alice',
      RECORD_CREATED_AT: '2026-01-01T00:00:00.000Z',
    });
  });

  it('find by logical pk returns logical-named row', async () => {
    const repo = makeUserRepo(ds);

    await ds.query(
      'INSERT INTO app_user (EMAIL_ADDRESS, FULL_NAME, RECORD_CREATED_AT) VALUES (?, ?, ?)',
      ['bob@b.com', 'Bob', '2026-02-02T00:00:00.000Z'],
    );
    const [{ USER_ID: seededId }] = await ds.query<{ USER_ID: number }>(
      'SELECT USER_ID FROM app_user',
    );

    const row = await repo.find(seededId);
    expect(row).not.toBeNull();
    expect(Object.keys(row!).sort()).toEqual(['createdAt', 'email', 'id', 'name']);
    expect(row).toEqual({
      id: seededId,
      email: 'bob@b.com',
      name: 'Bob',
      createdAt: '2026-02-02T00:00:00.000Z',
    });
  });

  it('update via logical names writes to physical columns', async () => {
    const repo = makeUserRepo(ds);

    const added = await repo.add({
      email: 'cara@c.com',
      name: 'Cara',
      createdAt: '2026-03-03T00:00:00.000Z',
    });

    const updated = await repo.update(added.id, { email: 'updated@a.com' });
    expect(updated?.email).toBe('updated@a.com');
    expect(updated?.name).toBe('Cara');

    const raw = await ds.query<{ EMAIL_ADDRESS: string; FULL_NAME: string }>(
      'SELECT EMAIL_ADDRESS, FULL_NAME FROM app_user WHERE USER_ID = ?',
      [added.id],
    );
    expect(raw[0]).toEqual({ EMAIL_ADDRESS: 'updated@a.com', FULL_NAME: 'Cara' });
  });

  it('custom converter override applies via the converters option', async () => {
    const entityMap = getEntityFieldMap(parseFieldMappings(spec), 'user');
    const upperConverter: ITypeFieldConverter<string, string> = {
      fromDatasource: 'sqlite',
      toLanguage: 'typescript',
      datasourceType: 'string',
      to: (v) => (typeof v === 'string' ? v.toUpperCase() : v),
      from: (v) => (typeof v === 'string' ? v.toUpperCase() : v),
    };
    const converters = new Map<string, ITypeFieldConverter>([
      ['string', upperConverter as ITypeFieldConverter],
    ]);

    const repo = new SqliteCrudRepository<User>(ds, 'app_user', {
      fieldMappings: entityMap,
      entityName: 'test',
      primaryKeys: testPrimaryKeys('integer'),
      converters,
      columnTypes: { email: 'string', name: 'string' },
    });

    const added = await repo.add({
      email: 'dani@d.com',
      name: 'Dani',
      createdAt: '2026-04-04T00:00:00.000Z',
    });

    expect(added.email).toBe('DANI@D.COM');
    expect(added.name).toBe('DANI');

    const raw = await ds.query<{ EMAIL_ADDRESS: string; FULL_NAME: string }>(
      'SELECT EMAIL_ADDRESS, FULL_NAME FROM app_user WHERE USER_ID = ?',
      [added.id],
    );
    expect(raw[0]).toEqual({ EMAIL_ADDRESS: 'DANI@D.COM', FULL_NAME: 'DANI' });
  });
});
