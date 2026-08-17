import express from 'express';
import request from 'supertest';
import { jsonBodyMiddleware } from '../jsonBodyMiddleware';

describe('jsonBodyMiddleware', () => {
  it('parses a JSON body onto req.body', async () => {
    const app = express();
    app.use(jsonBodyMiddleware);
    app.post('/', (req, res) => res.json(req.body));

    const res = await request(app)
      .post('/')
      .set('Content-Type', 'application/json')
      .send({ hello: 'world' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ hello: 'world' });
  });

  it('returns 400 BAD_REQUEST for a malformed JSON body instead of a 500', async () => {
    const app = express();
    app.use(jsonBodyMiddleware);
    app.post('/', (_req, res) => res.json({ ok: true }));

    const res = await request(app)
      .post('/')
      .set('Content-Type', 'application/json')
      .send('not-json');

    expect(res.status).toBe(400);
    expect(res.body.errors[0].code).toBe('BAD_REQUEST');
  });

  it('passes non-JSON content through untouched (no error)', async () => {
    const app = express();
    app.use(jsonBodyMiddleware);
    app.post('/', (_req, res) => res.status(204).end());

    const res = await request(app)
      .post('/')
      .set('Content-Type', 'text/plain')
      .send('plain text');

    expect(res.status).toBe(204);
  });
});
