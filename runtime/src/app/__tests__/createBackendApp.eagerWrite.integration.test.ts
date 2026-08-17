import { describe, it, expect } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type { SqliteDatasource } from '../../repositories/sqlite/SqliteDatasource';
import { useDeterministicRootApp } from './_backendAppMocks';

const TABLE_DDL = [
  `CREATE TABLE contact (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     uuid TEXT, name TEXT, email TEXT,
     created TEXT, updated TEXT
   )`,
  `CREATE TABLE address (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     uuid TEXT, contact_id INTEGER, line1 TEXT, city TEXT,
     created TEXT, updated TEXT
   )`,
  `CREATE TABLE phone (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     uuid TEXT, contact_id INTEGER, number TEXT,
     created TEXT, updated TEXT
   )`,
  `CREATE TABLE todo (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     uuid TEXT, title TEXT,
     created TEXT, updated TEXT
   )`,
  `CREATE TABLE task (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     uuid TEXT, todo_id INTEGER, description TEXT,
     created TEXT, updated TEXT
   )`,
  `CREATE TABLE meeting (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     uuid TEXT, todo_id INTEGER, scheduled_at TEXT,
     created TEXT, updated TEXT
   )`,
  `CREATE TABLE post (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     uuid TEXT, author_id INTEGER, title TEXT, body TEXT,
     created TEXT, updated TEXT
   )`,
  `CREATE TABLE "user" (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     uuid TEXT, name TEXT,
     created TEXT, updated TEXT
   )`,
  `CREATE TABLE tag (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     uuid TEXT, name TEXT,
     created TEXT, updated TEXT
   )`,
  `CREATE TABLE post_tag (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     uuid TEXT, post_id INTEGER, tag_id INTEGER,
     created TEXT, updated TEXT
   )`,
  `CREATE TABLE user_tag (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     uuid TEXT, user_id INTEGER, tag_id INTEGER,
     created TEXT, updated TEXT
   )`,
];

const SEED_SQL = [
  `INSERT INTO contact (id, uuid, name, email, created, updated) VALUES
     (1, 'c1', 'Carol', 'carol@example.com', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
     (2, 'c2', 'Dave',  'dave@example.com',  '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`,
  `INSERT INTO address (id, uuid, contact_id, line1, city, created, updated) VALUES
     (31, 'a31', 1, '1 Main St', 'Springfield', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
     (32, 'a32', 1, '2 Oak Ave', 'Shelbyville', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
     (33, 'a33', 2, '99 Other Rd', 'OtherTown',  '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`,
];

describe('createBackendApp eager-write end-to-end (sqlite on disk)', () => {
  let app: Express;
  let ds: SqliteDatasource;
  useDeterministicRootApp('demo-backend', TABLE_DDL, SEED_SQL, (x) => ({ app, ds } = x));

  it('POST /api/contacts persists parent and children to disk', async () => {
    const res = await request(app)
      .post('/api/contacts')
      .send({
        name: 'Alice',
        email: 'alice@x.com',
        addresses: [
          { line1: '123 Main', city: 'NYC' },
          { line1: '456 Elm', city: 'LA' },
        ],
      });

    expect(res.status).toBe(201);
    const newId = res.body.id as number;

    const contactRows = await ds.query<{ id: number; name: string }>(
      'SELECT id, name FROM contact WHERE id = ?',
      [newId],
    );
    expect(contactRows).toHaveLength(1);
    expect(contactRows[0].name).toBe('Alice');

    const addressRows = await ds.query<{ id: number; contact_id: number; line1: string }>(
      'SELECT id, contact_id, line1 FROM address WHERE contact_id = ? ORDER BY id',
      [newId],
    );
    expect(addressRows).toHaveLength(2);
    expect(addressRows.map((r) => r.line1)).toEqual(['123 Main', '456 Elm']);
    expect(addressRows.every((r) => r.contact_id === newId)).toBe(true);
  });

  it('PUT /api/contacts/:id replace-set deletes missing children on disk', async () => {
    const res = await request(app)
      .put('/api/contacts/1')
      .send({
        name: 'Carol Updated',
        email: 'carol.updated@example.com',
        addresses: [
          { id: 31, line1: '1 Main St Updated', city: 'Springfield' },
          { line1: '999 New St', city: 'NewCity' },
        ],
      });

    expect(res.status).toBe(200);

    const after = await ds.query<{ id: number; line1: string }>(
      'SELECT id, line1 FROM address WHERE contact_id = 1 ORDER BY id',
    );
    expect(after).toHaveLength(2);
    expect(after.find((r) => r.id === 31)?.line1).toBe('1 Main St Updated');
    expect(after.find((r) => r.id === 32)).toBeUndefined();
    const inserted = after.find((r) => r.id !== 31);
    expect(inserted?.line1).toBe('999 New St');
  });

  it('PATCH /api/contacts/:id merges omission-deletion, updates, and inserts on disk', async () => {
    const res = await request(app)
      .patch('/api/contacts/1')
      .send({
        addresses: [
          { id: 32, line1: '2 Oak Ave Updated', city: 'Shelbyville' },
          { line1: 'brand new', city: 'NewPlace' },
        ],
      });

    expect(res.status).toBe(200);

    const after = await ds.query<{ id: number; line1: string }>(
      'SELECT id, line1 FROM address WHERE contact_id = 1 ORDER BY id',
    );
    expect(after).toHaveLength(2);
    expect(after.find((r) => r.id === 31)).toBeUndefined();
    expect(after.find((r) => r.id === 32)?.line1).toBe('2 Oak Ave Updated');
    const inserted = after.find((r) => r.id !== 31 && r.id !== 32);
    expect(inserted?.line1).toBe('brand new');
  });

  it('PUT cross-parent guard rolls back parent update on disk', async () => {
    const res = await request(app)
      .put('/api/contacts/1')
      .send({
        name: 'Carol Hacked',
        email: 'hacked@example.com',
        addresses: [{ id: 33, line1: 'stolen', city: 'X' }],
      });

    expect(res.status).toBe(400);

    const contactRows = await ds.query<{ id: number; name: string; email: string }>(
      'SELECT id, name, email FROM contact WHERE id = 1',
    );
    expect(contactRows[0].name).toBe('Carol');
    expect(contactRows[0].email).toBe('carol@example.com');

    const addressRows = await ds.query<{ id: number; contact_id: number; line1: string }>(
      'SELECT id, contact_id, line1 FROM address ORDER BY id',
    );
    expect(addressRows.map((r) => ({ id: r.id, contact_id: r.contact_id }))).toEqual([
      { id: 31, contact_id: 1 },
      { id: 32, contact_id: 1 },
      { id: 33, contact_id: 2 },
    ]);
    expect(addressRows.find((r) => r.id === 33)?.line1).toBe('99 Other Rd');
  });

  it('POST atomicity: invalid nested row rejects without persisting parent', async () => {
    const before = await ds.query<{ count: number }>('SELECT COUNT(*) as count FROM contact');
    const beforeCount = Number(before[0].count);

    const res = await request(app)
      .post('/api/contacts')
      .send({
        name: 'Eve',
        email: 'eve@x.com',
        addresses: [{ id: 999, line1: 'has-id-which-is-rejected', city: 'Nowhere' }],
      });

    expect(res.status).toBe(400);

    const after = await ds.query<{ count: number }>('SELECT COUNT(*) as count FROM contact');
    expect(Number(after[0].count)).toBe(beforeCount);
  });

  it('PATCH cross-parent guard rolls back parent update on disk', async () => {
    const res = await request(app)
      .patch('/api/contacts/1')
      .send({
        email: 'patched@example.com',
        addresses: [{ id: 33, line1: 'stolen-by-patch', city: 'X' }],
      });

    expect(res.status).toBe(400);

    const rows = await ds.query<{ id: number; email: string }>(
      'SELECT id, email FROM contact WHERE id = 1',
    );
    expect(rows[0].email).toBe('carol@example.com');
  });

  it('PUT with empty addresses array deletes ALL existing children of contact 1 on disk', async () => {
    const res = await request(app)
      .put('/api/contacts/1')
      .send({ name: 'Carol', email: 'carol@example.com', addresses: [] });

    expect(res.status).toBe(200);

    const remaining = await ds.query<{ id: number }>('SELECT id FROM address WHERE contact_id = 1');
    expect(remaining).toHaveLength(0);

    const otherParent = await ds.query<{ id: number }>(
      'SELECT id FROM address WHERE contact_id = 2',
    );
    expect(otherParent.map((r) => r.id)).toEqual([33]);
  });

  it('Multi-table mixed PATCH applies both child-table mutations atomically on disk', async () => {
    const res = await request(app)
      .patch('/api/contacts/1')
      .send({
        addresses: [{ id: 32 }],
        phones: [{ number: 'patched-phone' }],
      });

    expect(res.status).toBe(200);

    const addr = await ds.query<{ id: number }>('SELECT id FROM address WHERE contact_id = 1');
    expect(addr.map((r) => r.id).sort((a, b) => a - b)).toEqual([32]);

    const phones = await ds.query<{ id: number; number: string }>(
      'SELECT id, number FROM phone WHERE contact_id = 1 ORDER BY id',
    );
    const numbers = phones.map((p) => p.number);
    expect(numbers).toContain('patched-phone');
  });

  it('FK column in nested row is rejected at the HTTP layer with no DB writes', async () => {
    const beforeContacts = await ds.query<{ count: number }>(
      'SELECT COUNT(*) as count FROM contact',
    );
    const beforeAddresses = await ds.query<{ count: number }>(
      'SELECT COUNT(*) as count FROM address',
    );

    const res = await request(app)
      .post('/api/contacts')
      .send({
        name: 'Sneaky',
        email: 's@x.com',
        addresses: [{ contact_id: 99, line1: 'fk-leak', city: 'Bad' }],
      });

    expect(res.status).toBe(400);

    const afterContacts = await ds.query<{ count: number }>(
      'SELECT COUNT(*) as count FROM contact',
    );
    const afterAddresses = await ds.query<{ count: number }>(
      'SELECT COUNT(*) as count FROM address',
    );
    expect(Number(afterContacts[0].count)).toBe(Number(beforeContacts[0].count));
    expect(Number(afterAddresses[0].count)).toBe(Number(beforeAddresses[0].count));
  });

  it('PUT 404 on non-existent parent does not create or modify any rows on disk', async () => {
    const beforeContacts = await ds.query<{ count: number }>(
      'SELECT COUNT(*) as count FROM contact',
    );
    const beforeAddresses = await ds.query<{ count: number }>(
      'SELECT COUNT(*) as count FROM address',
    );

    const res = await request(app)
      .put('/api/contacts/9999')
      .send({
        name: 'Ghost',
        email: 'g@x.com',
        addresses: [{ line1: 'should-not-land', city: 'Nowhere' }],
      });

    expect(res.status).toBe(404);

    const afterContacts = await ds.query<{ count: number }>(
      'SELECT COUNT(*) as count FROM contact',
    );
    const afterAddresses = await ds.query<{ count: number }>(
      'SELECT COUNT(*) as count FROM address',
    );
    expect(Number(afterContacts[0].count)).toBe(Number(beforeContacts[0].count));
    expect(Number(afterAddresses[0].count)).toBe(Number(beforeAddresses[0].count));
  });

  it('contact full lifecycle on disk: POST → GET → PUT → GET → PATCH → GET → DELETE → GET', async () => {
    const post = await request(app)
      .post('/api/contacts')
      .send({
        name: 'DiskLifecycle',
        email: 'd@x.com',
        addresses: [
          { line1: 'a-init', city: 'AI' },
          { line1: 'a-init-2', city: 'AI2' },
        ],
        phones: [{ number: 'p-init' }],
      });
    expect(post.status).toBe(201);
    const id = post.body.id;
    const initialAddrIds = post.body.addresses.map((a: { id: number }) => a.id);

    let parent = await ds.query<{ id: number; name: string; email: string }>(
      'SELECT id, name, email FROM contact WHERE id = ?',
      [id],
    );
    expect(parent[0].name).toBe('DiskLifecycle');
    let kids = await ds.query<{ id: number }>('SELECT id FROM address WHERE contact_id = ?', [id]);
    expect(kids).toHaveLength(2);

    const put = await request(app)
      .put(`/api/contacts/${id}`)
      .send({
        name: 'DiskLifecycle Updated',
        email: 'du@x.com',
        addresses: [
          { id: initialAddrIds[0], line1: 'a-put-updated', city: 'AP' },
          { line1: 'a-put-new', city: 'APN' },
        ],
      });
    expect(put.status).toBe(200);

    parent = await ds.query<{ id: number; name: string; email: string }>(
      'SELECT id, name, email FROM contact WHERE id = ?',
      [id],
    );
    expect(parent[0].name).toBe('DiskLifecycle Updated');
    kids = await ds.query<{ id: number }>(
      'SELECT id FROM address WHERE contact_id = ? ORDER BY id',
      [id],
    );
    expect(kids).toHaveLength(2);
    expect(kids.find((k) => k.id === initialAddrIds[0])).toBeDefined();
    expect(kids.find((k) => k.id === initialAddrIds[1])).toBeUndefined();

    const patch = await request(app)
      .patch(`/api/contacts/${id}`)
      .send({
        addresses: [
          { id: initialAddrIds[0], line1: 'a-patch-updated', city: 'APatch' },
          { line1: 'a-patch-new', city: 'NewAPatch' },
        ],
      });
    expect(patch.status).toBe(200);

    kids = await ds.query<{ id: number; line1: string }>(
      'SELECT id, line1 FROM address WHERE contact_id = ? ORDER BY id',
      [id],
    );
    expect(kids).toHaveLength(2);
    const updated = kids.find((k) => k.id === initialAddrIds[0]) as
      | { id: number; line1: string }
      | undefined;
    expect(updated).toBeDefined();
    expect(updated!.line1).toBe('a-patch-updated');

    const del = await request(app).delete(`/api/contacts/${id}`);
    expect(del.status).toBe(200);

    parent = await ds.query<{ id: number; name: string; email: string }>(
      'SELECT id, name, email FROM contact WHERE id = ?',
      [id],
    );
    expect(parent).toHaveLength(0);

    // cascade — child rows are removed with the parent in the same transaction
    const survivors = await ds.query<{ id: number }>(
      'SELECT id FROM address WHERE contact_id = ?',
      [id],
    );
    expect(survivors).toHaveLength(0);
    const phoneSurvivors = await ds.query<{ id: number }>(
      'SELECT id FROM phone WHERE contact_id = ?',
      [id],
    );
    expect(phoneSurvivors).toHaveLength(0);
  });

  it('sequential PUT/PATCH/PUT/PATCH series with disk-side verification at every step', async () => {
    // Step 1: PUT — keep both seeded children, add a new one.
    await request(app)
      .put('/api/contacts/1')
      .send({
        name: 'Carol',
        email: 'carol@example.com',
        addresses: [
          { id: 31, line1: '1 Main St', city: 'Springfield' },
          { id: 32, line1: '2 Oak Ave', city: 'Shelbyville' },
          { line1: 'fresh', city: 'F' },
        ],
      });
    let kids = await ds.query<{ id: number; line1: string }>(
      'SELECT id, line1 FROM address WHERE contact_id = 1 ORDER BY id',
    );
    expect(kids).toHaveLength(3);
    const freshId = kids.find((k) => k.line1 === 'fresh')!.id;

    // Step 2: PATCH — omit id 31 from the addresses array, leaving 32 and the fresh row.
    await request(app)
      .patch('/api/contacts/1')
      .send({ addresses: [{ id: 32 }, { id: freshId }] });
    kids = await ds.query<{ id: number; line1: string }>(
      'SELECT id, line1 FROM address WHERE contact_id = 1 ORDER BY id',
    );
    expect(kids.map((k) => k.id)).toEqual([32, freshId]);

    // Step 3: PUT — replace everything.
    await request(app)
      .put('/api/contacts/1')
      .send({
        name: 'Carol',
        email: 'carol@example.com',
        addresses: [{ line1: 'replaced', city: 'R' }],
      });
    kids = await ds.query<{ id: number; line1: string }>(
      'SELECT id, line1 FROM address WHERE contact_id = 1 ORDER BY id',
    );
    expect(kids).toHaveLength(1);
    expect(kids[0].line1).toBe('replaced');

    // Step 4: PATCH — keep replaced, add two more.
    const replacedId = kids[0].id;
    await request(app)
      .patch('/api/contacts/1')
      .send({
        addresses: [
          { id: replacedId, line1: 'replaced', city: 'R' },
          { line1: 'extra-1', city: 'E1' },
          { line1: 'extra-2', city: 'E2' },
        ],
      });
    kids = await ds.query<{ id: number; line1: string }>(
      'SELECT id, line1 FROM address WHERE contact_id = 1 ORDER BY id',
    );
    expect(kids).toHaveLength(3);
    const lines = kids.map((k) => k.line1).sort();
    expect(lines).toEqual(['extra-1', 'extra-2', 'replaced']);
  });

  it('5 parallel POSTs against sqlite WAL: all land on disk with correct FKs', async () => {
    const responses = await Promise.all(
      Array.from({ length: 5 }, (_unused, i) =>
        request(app)
          .post('/api/contacts')
          .send({
            name: `Concurrent-${i}`,
            email: `c${i}@x.com`,
            addresses: [{ line1: `addr-${i}`, city: 'X' }],
          }),
      ),
    );

    for (const res of responses) {
      expect(res.status).toBe(201);
    }

    const ids = responses.map((r) => r.body.id);
    expect(new Set(ids).size).toBe(5);

    const placeholders = ids.map(() => '?').join(', ');
    const parents = await ds.query<{ id: number; name: string }>(
      `SELECT id, name FROM contact WHERE id IN (${placeholders}) ORDER BY id`,
      ids,
    );
    expect(parents).toHaveLength(5);

    for (const parent of parents) {
      const kids = await ds.query<{ id: number; contact_id: number; line1: string }>(
        'SELECT id, contact_id, line1 FROM address WHERE contact_id = ?',
        [parent.id],
      );
      expect(kids).toHaveLength(1);
      expect(kids[0].contact_id).toBe(parent.id);
    }
  });
});
