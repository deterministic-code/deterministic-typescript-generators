import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SqliteDatasource } from './SqliteDatasource';
import { SqliteStandardRepository } from './SqliteStandardRepository';
import { testPrimaryKeys } from '../__tests__/testPrimaryKeys';

interface UserRow {
  id: number;
  uuid: string;
  created: string;
  updated: string;
  name: string;
  email: string;
  score: number;
}

const SHOW_SQL = process.env.SHOW_SQL === '1';

function wrap(ds: SqliteDatasource): SqliteDatasource {
  if (!SHOW_SQL) return ds;
  const orig = ds.query.bind(ds);
  ds.query = async <R = unknown>(
    sql: string,
    params: ReadonlyArray<unknown> = [],
  ): Promise<R[]> => {
    // eslint-disable-next-line no-console
    console.log('[SQL]', sql.replace(/\s+/g, ' ').trim(), JSON.stringify(params));
    return orig<R>(sql, params);
  };
  return ds;
}

describe('SqliteStandardRepository.findBy — integration (better-sqlite3 in-memory)', () => {
  let ds: SqliteDatasource;
  let repo: SqliteStandardRepository<UserRow>;

  beforeEach(async () => {
    ds = wrap(new SqliteDatasource({ dbPath: ':memory:' }));
    await ds.open();
    await ds.query(
      `CREATE TABLE "user" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid TEXT NOT NULL,
        created TEXT NOT NULL,
        updated TEXT NOT NULL,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        score INTEGER NOT NULL DEFAULT 0
      )`,
    );
    repo = new SqliteStandardRepository<UserRow>(ds, 'user', {
      entityName: 'user',
      primaryKeys: testPrimaryKeys('integer'),
    });
  });

  afterEach(async () => {
    await ds.close();
  });

  it('findBy("email", "alice@example.com") returns the seeded row with matching id, name, email', async () => {
    const seeded = await repo.add({
      name: 'Alice',
      email: 'alice@example.com',
      score: 0,
    } as never);

    const rows = await repo.findBy('email', 'alice@example.com');

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(seeded.id);
    expect(rows[0].name).toBe('Alice');
    expect(rows[0].email).toBe('alice@example.com');
  });

  // failure-mode: findBy returns T[]; a miss MUST be the empty array, not null/undefined. If a future change conflates "no rows" with `null`, downstream callers iterating .map/.length break silently.
  it('findBy on a miss returns [] (not null, not undefined)', async () => {
    const rows = await repo.findBy('email', 'nobody@nowhere.com');

    expect(rows).toEqual([]);
    expect(Array.isArray(rows)).toBe(true);
    expect(rows).not.toBeNull();
    expect(rows).not.toBeUndefined();
  });

  // failure-mode: locks the case-sensitive contract. sqlite TEXT defaults to BINARY collation; adding COLLATE NOCASE or LOWER() to the emitted SELECT would silently flip semantics for every consumer relying on exact-match.
  it('findBy is case-sensitive: lookup of lowercased value misses a mixed-case row', async () => {
    await repo.add({
      name: 'Alice',
      email: 'Alice@example.com',
      score: 0,
    } as never);

    const rows = await repo.findBy('email', 'alice@example.com');

    expect(rows).toEqual([]);
  });

  // failure-mode: schema has no UNIQUE(email) so duplicates are legal. Contract is "every matching row, ordered by id asc"; rows[0] is the earlier insert. The spec asked about "first match" — pinning to the real T[] API with ordered access.
  it('findBy returns every matching row ordered by id ASC when duplicates exist', async () => {
    const first = await repo.add({
      name: 'Alice One',
      email: 'dup@example.com',
      score: 0,
    } as never);
    const second = await repo.add({
      name: 'Alice Two',
      email: 'dup@example.com',
      score: 0,
    } as never);

    const rows = await repo.findBy('email', 'dup@example.com');

    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe(first.id);
    expect(rows[0].name).toBe('Alice One');
    expect(rows[1].id).toBe(second.id);
    expect(rows[1].name).toBe('Alice Two');
    expect(rows[0].id).toBeLessThan(rows[1].id);
  });

  // failure-mode: numeric path goes through applyTo / parameter binding. A regression that coerces to string ("7") would still match in sqlite's weak typing but break for stricter dialects; pin numeric round-trip here.
  it('findBy with a numeric column round-trips integer values', async () => {
    await repo.add({ name: 'low', email: 'low@x.com', score: 3 } as never);
    const seven = await repo.add({ name: 'mid', email: 'mid@x.com', score: 7 } as never);
    await repo.add({ name: 'high', email: 'high@x.com', score: 11 } as never);

    const rows = await repo.findBy('score', 7);

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(seven.id);
    expect(rows[0].score).toBe(7);
    expect(typeof rows[0].score).toBe('number');
  });
});
