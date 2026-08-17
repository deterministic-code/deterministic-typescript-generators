import { describe, it, expect } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type { SqliteDatasource } from '../../repositories/sqlite/SqliteDatasource';
import { useDeterministicRootApp } from './_backendAppMocks';
import { DEMO_BACKEND_TABLE_DDL } from './_demoBackendDdl';

const TABLE_DDL = [
  ...DEMO_BACKEND_TABLE_DDL,
  `CREATE UNIQUE INDEX post_tag_unique ON post_tag(post_id, tag_id)`,
];

const SEED_SQL = [
  `INSERT INTO user_type (id, uuid, name, created, updated) VALUES
     (1, 'ut1', 'Standard', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`,
  `INSERT INTO post_type (id, uuid, name, created, updated) VALUES
     (1, 'pt1', 'Article', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`,
  `INSERT INTO "user" (id, uuid, user_type_id, username, email, password_hash, created, updated) VALUES
     (1, 'u1', 1, 'author', 'a@example.com', 'pw', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`,
  `INSERT INTO post (id, uuid, post_type_id, author_id, title, body, created, updated) VALUES
     (1, 'p1', 1, 1, 'first', 'b1', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
     (2, 'p2', 1, 1, 'second', 'b2', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`,
  `INSERT INTO tag (id, uuid, name, created, updated) VALUES
     (1, 'tg1', 'alpha', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
     (2, 'tg2', 'beta', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`,
];

async function junctionRow(
  ds: SqliteDatasource,
  id: number,
): Promise<{ post_id: number; tag_id: number } | undefined> {
  const rows = await ds.query<{ post_id: number; tag_id: number }>(
    'SELECT post_id, tag_id FROM post_tag WHERE id = ?',
    [id],
  );
  return rows[0];
}

describe('createBackendApp mounts standalone CRUD for an m2m junction (sqlite)', () => {
  let app: Express;
  let ds: SqliteDatasource;
  useDeterministicRootApp('demo-backend', TABLE_DDL, SEED_SQL, (x) => ({ app, ds } = x));

  it('POST/GET/PUT/PATCH/DELETE /api/post-tags behaves as normal CRUD over the junction', async () => {
    const created = await request(app).post('/api/post-tags').send({ post_id: 1, tag_id: 1 });
    expect(created.status).toBe(201);
    const id = created.body.id as number;
    expect(typeof id).toBe('number');
    expect(created.body.post_id).toBe(1);
    expect(created.body.tag_name).toBe('alpha');
    expect(await junctionRow(ds, id)).toEqual({ post_id: 1, tag_id: 1 });

    const list = await request(app).get('/api/post-tags');
    expect(list.status).toBe(200);
    const rows = Array.isArray(list.body) ? list.body : list.body.items;
    expect(rows.some((r: { id: number }) => r.id === id)).toBe(true);

    const one = await request(app).get(`/api/post-tags/${id}`);
    expect(one.status).toBe(200);
    expect(one.body.post_id).toBe(1);
    expect(one.body.tag_name).toBe('alpha');

    const put = await request(app).put(`/api/post-tags/${id}`).send({ post_id: 2, tag_id: 2 });
    expect(put.status).toBe(200);
    expect(put.body.post_id).toBe(2);
    expect(put.body.tag_name).toBe('beta');
    expect(await junctionRow(ds, id)).toEqual({ post_id: 2, tag_id: 2 });

    const patch = await request(app).patch(`/api/post-tags/${id}`).send({ tag_id: 1 });
    expect(patch.status).toBe(200);
    expect(patch.body.tag_name).toBe('alpha');
    expect(await junctionRow(ds, id)).toEqual({ post_id: 2, tag_id: 1 });

    const del = await request(app).delete(`/api/post-tags/${id}`);
    expect([200, 204]).toContain(del.status);
    expect(await junctionRow(ds, id)).toBeUndefined();

    const gone = await request(app).get(`/api/post-tags/${id}`);
    expect(gone.status).toBe(404);
  });

  it('rejects a duplicate (post_id, tag_id) pair via the unique index', async () => {
    const first = await request(app).post('/api/post-tags').send({ post_id: 1, tag_id: 2 });
    expect(first.status).toBe(201);

    const dup = await request(app).post('/api/post-tags').send({ post_id: 1, tag_id: 2 });
    expect(dup.status).toBeGreaterThanOrEqual(400);
    expect(dup.status).not.toBe(201);
  });
});
