import request from 'supertest';
import express from 'express';
import { z } from 'zod';
import { validateBody, validateParams } from '../validateRequest';

describe('validateBody middleware', () => {
  const schema = z.object({
    name: z.string().min(1),
  });

  function buildApp() {
    const app = express();
    app.use(express.json());
    app.post('/test', validateBody(schema), (req, res) => {
      res.json(req.body);
    });
    return app;
  }

  it('passes valid body through to handler', async () => {
    const app = buildApp();

    const res = await request(app).post('/test').send({ name: 'valid' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('valid');
  });

  it('returns 400 for invalid body', async () => {
    const app = buildApp();

    const res = await request(app).post('/test').send({});

    expect(res.status).toBe(400);
    expect(res.body.errors[0].code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for empty string name', async () => {
    const app = buildApp();

    const res = await request(app).post('/test').send({ name: '' });

    expect(res.status).toBe(400);
    expect(res.body.errors[0].code).toBe('VALIDATION_ERROR');
  });
});

describe('validateParams middleware', () => {
  const schema = z.object({
    id: z.string().regex(/^\d+$/),
  });

  function buildApp() {
    const app = express();
    app.get('/test/:id', validateParams(schema), (req, res) => {
      res.json({ id: req.params.id });
    });
    return app;
  }

  it('passes valid params through to handler', async () => {
    const app = buildApp();

    const res = await request(app).get('/test/123');

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('123');
  });

  it('returns 400 for invalid params', async () => {
    const app = buildApp();

    const res = await request(app).get('/test/abc');

    expect(res.status).toBe(400);
    expect(res.body.errors[0].code).toBe('VALIDATION_ERROR');
  });
});

describe('non-Zod error propagation', () => {
  function buildErrorHandlingApp(
    middleware: ReturnType<typeof validateBody | typeof validateParams>,
    method: 'post' | 'get',
  ) {
    const app = express();
    app.use(express.json());
    if (method === 'post') {
      app.post('/test', middleware, (_req, res) => {
        res.json({ ok: true });
      });
    } else {
      app.get('/test/:id', middleware, (_req, res) => {
        res.json({ ok: true });
      });
    }
    app.use(
      (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
        res.status(500).json({ errors: [{ code: 'INTERNAL_ERROR', message: err.message }] });
      },
    );
    return app;
  }

  it('validateBody calls next(err) when schema.parse throws a non-Zod error', async () => {
    const throwingSchema = {
      parse: () => {
        throw new Error('unexpected failure');
      },
    } as unknown as z.ZodSchema;

    const app = buildErrorHandlingApp(validateBody(throwingSchema), 'post');

    const res = await request(app).post('/test').send({ name: 'test' });

    expect(res.status).toBe(500);
    expect(res.body.errors[0].code).toBe('INTERNAL_ERROR');
    expect(res.body.errors[0].message).toBe('unexpected failure');
  });

  it('validateParams calls next(err) when schema.parse throws a non-Zod error', async () => {
    const throwingSchema = {
      parse: () => {
        throw new Error('param failure');
      },
    } as unknown as z.ZodSchema;

    const app = buildErrorHandlingApp(validateParams(throwingSchema), 'get');

    const res = await request(app).get('/test/123');

    expect(res.status).toBe(500);
    expect(res.body.errors[0].code).toBe('INTERNAL_ERROR');
    expect(res.body.errors[0].message).toBe('param failure');
  });
});
