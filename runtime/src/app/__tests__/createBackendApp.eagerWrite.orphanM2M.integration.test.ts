import { describe, it, expect } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type { SqliteDatasource } from '../../repositories/sqlite/SqliteDatasource';
import { useDeterministicRootApp } from './_backendAppMocks';
import { DEMO_BACKEND_TABLE_DDL } from './_demoBackendDdl';

const TABLE_DDL = DEMO_BACKEND_TABLE_DDL;

const SEED_SQL = [
  `INSERT INTO user_type (id, uuid, name, description, created, updated) VALUES
     (1, 'ut1', 'Standard', NULL, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
     (2, 'ut2', 'Admin', 'Elevated privileges.', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`,
  `INSERT INTO post_type (id, uuid, name, description, created, updated) VALUES
     (1, 'pt1', 'Article', NULL, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`,
];

describe('createBackendApp eager-write orphan delete (sqlite, FK-enforced)', () => {
  let app: Express;
  let ds: SqliteDatasource;
  useDeterministicRootApp('demo-backend', TABLE_DDL, SEED_SQL, (x) => ({ app, ds } = x));

  it('PATCH eager-write orphan delete clears M2M grandchildren before deleting the orphaned direct-FK child', async () => {
    const post = await request(app)
      .post('/api/users')
      .send({
        user_type_name: 'Standard',
        username: 'orphan-test-user',
        email: 'orphan@example.com',
        password_hash: 'pw',
        posts: [
          {
            post_type_name: 'Article',
            title: 'first',
            body: 'body-first',
            tags: [{ name: 't1' }, { name: 't2' }],
          },
        ],
      });
    expect(post.status).toBe(201);
    const userId = post.body.id as number;
    expect(Array.isArray(post.body.posts)).toBe(true);
    expect(post.body.posts).toHaveLength(1);
    const postId = post.body.posts[0].id as number;

    const seededJunctions = await ds.query<{ count: number }>(
      'SELECT COUNT(*) as count FROM post_tag WHERE post_id = ?',
      [postId],
    );
    expect(Number(seededJunctions[0].count)).toBe(2);

    const patch = await request(app).patch(`/api/users/${userId}`).send({ posts: [] });

    expect(patch.status).toBe(200);
    expect(Array.isArray(patch.body.posts)).toBe(true);
    expect(patch.body.posts).toEqual([]);

    const remainingJunctions = await ds.query<{ count: number }>(
      'SELECT COUNT(*) as count FROM post_tag WHERE post_id = ?',
      [postId],
    );
    expect(Number(remainingJunctions[0].count)).toBe(0);

    const remainingPosts = await ds.query<{ count: number }>(
      'SELECT COUNT(*) as count FROM post WHERE id = ?',
      [postId],
    );
    expect(Number(remainingPosts[0].count)).toBe(0);

    const tagRows = await ds.query<{ name: string }>(
      "SELECT name FROM tag WHERE name IN ('t1', 't2') ORDER BY name",
    );
    expect(tagRows.map((r) => r.name)).toEqual(['t1', 't2']);
  });
});
