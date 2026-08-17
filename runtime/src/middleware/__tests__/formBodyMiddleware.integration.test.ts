import express from 'express';
import request from 'supertest';
import { formBodyMiddleware } from '../formBodyMiddleware';

describe('formBodyMiddleware', () => {
  it('parses an urlencoded body onto req.body', async () => {
    const app = express();
    app.use(formBodyMiddleware);
    app.post('/', (req, res) => res.json(req.body));

    const res = await request(app)
      .post('/')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send('a=1&b=two');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ a: '1', b: 'two' });
  });
});
