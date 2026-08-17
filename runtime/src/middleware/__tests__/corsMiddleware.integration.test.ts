import express from 'express';
import request from 'supertest';
import { corsMiddleware } from '../corsMiddleware';

describe('corsMiddleware', () => {
  it('adds Access-Control-Allow-Origin header', async () => {
    const app = express();
    app.use(corsMiddleware);
    app.get('/', (_req, res) => res.json({ ok: true }));

    const res = await request(app).get('/').set('Origin', 'https://example.com');

    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.status).toBe(200);
  });
});
