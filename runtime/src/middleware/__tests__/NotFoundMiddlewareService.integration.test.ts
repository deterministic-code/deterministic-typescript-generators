import request from 'supertest';
import express from 'express';
import { NotFoundMiddlewareService } from '../NotFoundMiddlewareService';

function app(): express.Express {
  const a = express();
  a.get('/matched', (_req, res) => {
    res.status(200).send('hello');
  });
  const svc = new NotFoundMiddlewareService();
  a.use(svc.handle);
  return a;
}

describe('NotFoundMiddlewareService integration', () => {
  it('unmatched GET returns 404 with envelope', async () => {
    const res = await request(app()).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      errors: [{ code: 'NOT_FOUND', message: 'Route not found' }],
    });
  });

  it('unmatched POST returns 404 with envelope', async () => {
    const a = express();
    a.post('/matched', (_req, res) => {
      res.status(201).send('created');
    });
    a.use(new NotFoundMiddlewareService().handle);
    const res = await request(a).post('/nope');
    expect(res.status).toBe(404);
    expect(res.body.errors[0].code).toBe('NOT_FOUND');
  });

  it('unmatched PATCH returns 404 with envelope', async () => {
    const a = express();
    a.patch('/matched', (_req, res) => {
      res.status(200).send('patched');
    });
    a.use(new NotFoundMiddlewareService().handle);
    const res = await request(a).patch('/nope');
    expect(res.status).toBe(404);
    expect(res.body.errors[0].code).toBe('NOT_FOUND');
  });

  it('unmatched DELETE returns 404 with envelope', async () => {
    const a = express();
    a.delete('/matched', (_req, res) => {
      res.status(204).send();
    });
    a.use(new NotFoundMiddlewareService().handle);
    const res = await request(a).delete('/nope');
    expect(res.status).toBe(404);
    expect(res.body.errors[0].code).toBe('NOT_FOUND');
  });

  it('matched route still returns 200', async () => {
    const res = await request(app()).get('/matched');
    expect(res.status).toBe(200);
  });

  it('nested path segments 404 through fallback', async () => {
    const res = await request(app()).get('/api/does/not/exist/deeply/nested');
    expect(res.status).toBe(404);
    expect(res.body.errors[0].code).toBe('NOT_FOUND');
  });

  it('query string discarded envelope stays static', async () => {
    const res = await request(app()).get('/nope?foo=bar&x=1');
    expect(res.body).toEqual({
      errors: [{ code: 'NOT_FOUND', message: 'Route not found' }],
    });
  });

  it('envelope has exactly one key errors', async () => {
    const res = await request(app()).get('/nope');
    expect(Object.keys(res.body)).toEqual(['errors']);
  });

  it('envelope errors array has exactly one entry', async () => {
    const res = await request(app()).get('/nope');
    expect(res.body.errors).toHaveLength(1);
  });
});
