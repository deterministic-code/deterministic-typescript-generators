import express, { type Application, type RequestHandler } from 'express';
import request from 'supertest';
import { z } from 'zod';
import { createGenericRouter, type GenericRouterOptions } from '../genericRouter';
import { errorHandler } from '../../middleware/errorHandler';

function buildApp<TBody, TResult>(options: GenericRouterOptions<TBody, TResult>): Application {
  const app = express();
  app.use(express.json());
  app.use(createGenericRouter(options));
  app.use(errorHandler);
  return app;
}

describe('createGenericRouter', () => {
  describe('responseFormat: "item" (default)', () => {
    it('GET returns handler result with default 200 status', async () => {
      const handler = vi.fn().mockResolvedValue({ ok: true, version: '1.0.0' });
      const app = buildApp({
        method: 'get',
        path: '/api/health',
        handler,
      });

      const res = await request(app).get('/api/health');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, version: '1.0.0' });
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('POST defaults to 201 when responseFormat is "item"', async () => {
      const created = { id: 1, name: 'alpha' };
      const app = buildApp({
        method: 'post',
        path: '/api/things',
        handler: async () => created,
      });

      const res = await request(app).post('/api/things').send({});

      expect(res.status).toBe(201);
      expect(res.body).toEqual(created);
    });

    it('honours an explicit statusCode override', async () => {
      const app = buildApp({
        method: 'post',
        path: '/api/things',
        handler: async () => ({ id: 1 }),
        statusCode: 202,
      });

      const res = await request(app).post('/api/things').send({});

      expect(res.status).toBe(202);
      expect(res.body).toEqual({ id: 1 });
    });
  });

  describe('responseFormat: "items"', () => {
    it('wraps the result in { items: [...] } with default 200', async () => {
      const keys = [{ kid: 'a' }, { kid: 'b' }];
      const app = buildApp({
        method: 'get',
        path: '/oauth/public_keys',
        handler: async () => keys,
        responseFormat: 'items',
      });

      const res = await request(app).get('/oauth/public_keys');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ items: keys });
    });

    it('POST with responseFormat: "items" defaults to 200, not 201', async () => {
      const app = buildApp({
        method: 'post',
        path: '/api/bulk',
        handler: async () => [{ id: 1 }, { id: 2 }],
        responseFormat: 'items',
      });

      const res = await request(app).post('/api/bulk').send([]);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ items: [{ id: 1 }, { id: 2 }] });
    });

    it('honours statusCode override alongside "items"', async () => {
      const app = buildApp({
        method: 'get',
        path: '/api/list',
        handler: async () => [],
        responseFormat: 'items',
        statusCode: 206,
      });

      const res = await request(app).get('/api/list');

      expect(res.status).toBe(206);
      expect(res.body).toEqual({ items: [] });
    });
  });

  describe('responseFormat: "raw"', () => {
    it('does not write a response envelope; handler owns the response', async () => {
      const app = buildApp({
        method: 'get',
        path: '/oauth/redirect',
        handler: async (_req, res) => {
          res.status(302).set('Location', '/after').end();
        },
        responseFormat: 'raw',
      });

      const res = await request(app).get('/oauth/redirect');

      expect(res.status).toBe(302);
      expect(res.header['location']).toBe('/after');
      expect(res.text).toBe('');
    });

    it('ignores the handler return value when raw', async () => {
      const app = buildApp({
        method: 'get',
        path: '/raw',
        handler: async (_req, res) => {
          res.status(200).type('text/plain').send('plain-text');
          return { shouldBeIgnored: true };
        },
        responseFormat: 'raw',
      });

      const res = await request(app).get('/raw');

      expect(res.status).toBe(200);
      expect(res.text).toBe('plain-text');
      expect(res.body).toEqual({});
    });
  });

  describe('requestSchema validation', () => {
    const schema = z.object({ name: z.string().min(1) });

    it('parses and replaces req.body with the schema result', async () => {
      const handler = vi.fn().mockResolvedValue({ ok: true });
      const app = buildApp({
        method: 'post',
        path: '/api/echo',
        handler,
        requestSchema: schema,
      });

      const res = await request(app).post('/api/echo').send({ name: 'alpha', extra: 'dropped' });

      expect(res.status).toBe(201);
      expect(handler).toHaveBeenCalledTimes(1);
      const reqArg = handler.mock.calls[0][0] as { body: unknown };
      expect(reqArg.body).toEqual({ name: 'alpha' });
    });

    it('returns 400 VALIDATION_ERROR when the body fails the schema', async () => {
      const handler = vi.fn();
      const app = buildApp({
        method: 'post',
        path: '/api/echo',
        handler,
        requestSchema: schema,
      });

      const res = await request(app).post('/api/echo').send({ name: '' });

      expect(res.status).toBe(400);
      expect(res.body.errors[0].code).toBe('VALIDATION_ERROR');
      expect(handler).not.toHaveBeenCalled();
    });

    it('skips validation when no requestSchema is provided', async () => {
      const handler = vi.fn().mockResolvedValue({ seen: true });
      const app = buildApp({
        method: 'post',
        path: '/api/free',
        handler,
      });

      const res = await request(app).post('/api/free').send({ anything: 42 });

      expect(res.status).toBe(201);
      const reqArg = handler.mock.calls[0][0] as { body: unknown };
      expect(reqArg.body).toEqual({ anything: 42 });
    });
  });

  describe('middleware', () => {
    it('runs middleware in order before the handler and can short-circuit', async () => {
      const order: string[] = [];
      const mw1: RequestHandler = (_req, _res, next) => {
        order.push('mw1');
        next();
      };
      const mw2: RequestHandler = (_req, res) => {
        order.push('mw2');
        res.status(401).json({ errors: [{ code: 'UNAUTHORIZED', message: 'no' }] });
      };
      const handler = vi.fn();

      const app = buildApp({
        method: 'get',
        path: '/guarded',
        handler,
        middleware: [mw1, mw2],
      });

      const res = await request(app).get('/guarded');

      expect(res.status).toBe(401);
      expect(order).toEqual(['mw1', 'mw2']);
      expect(handler).not.toHaveBeenCalled();
    });

    it('reaches the handler when all middleware call next()', async () => {
      const mw: RequestHandler = (req, _res, next) => {
        (req as unknown as Record<string, unknown>).actor = 'alice';
        next();
      };
      const app = buildApp({
        method: 'get',
        path: '/me',
        handler: async (req) => ({
          actor: (req as unknown as Record<string, unknown>).actor ?? 'anonymous',
        }),
        middleware: [mw],
      });

      const res = await request(app).get('/me');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ actor: 'alice' });
    });
  });

  describe('error propagation', () => {
    it('forwards non-Zod handler errors to the error handler', async () => {
      const suppress = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const app = buildApp({
        method: 'get',
        path: '/boom',
        handler: async () => {
          throw new Error('kaboom');
        },
      });

      const res = await request(app).get('/boom');

      expect(res.status).toBe(500);
      expect(res.body.errors[0].code).toBe('INTERNAL_ERROR');
      suppress.mockRestore();
    });
  });

  describe('supported HTTP verbs', () => {
    const cases: Array<{ method: 'get' | 'post' | 'put' | 'patch' | 'delete' }> = [
      { method: 'get' },
      { method: 'post' },
      { method: 'put' },
      { method: 'patch' },
      { method: 'delete' },
    ];

    it.each(cases)('supports $method', async ({ method }) => {
      const app = buildApp({
        method,
        path: '/verb',
        handler: async () => ({ method }),
      });

      const agent = request(app) as unknown as Record<
        typeof method,
        (p: string) => { send: (b: unknown) => Promise<request.Response> }
      >;
      const res = await agent[method]('/verb').send({});

      // POST defaults to 201 with "item"; everything else defaults to 200.
      expect(res.status).toBe(method === 'post' ? 201 : 200);
      expect(res.body).toEqual({ method });
    });
  });
});
