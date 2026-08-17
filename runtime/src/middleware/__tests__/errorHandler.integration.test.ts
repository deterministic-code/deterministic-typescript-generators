import request from 'supertest';
import express from 'express';
import { ZodError, z } from 'zod';
import { errorHandler } from '../errorHandler';
import { AppError, ConflictError, NotFoundError, ValidationError } from '../../errors/AppError';

function buildApp(handler: express.RequestHandler): express.Express {
  const app = express();
  app.get('/', handler);
  app.use(errorHandler);
  return app;
}

describe('errorHandler middleware', () => {
  it('returns 500 with generic message for unhandled errors', async () => {
    const app = buildApp((_req, _res, next) => next(new Error('boom')));
    const suppress = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = await request(app).get('/');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      errors: [{ code: 'INTERNAL_ERROR', message: 'Internal server error' }],
    });
    suppress.mockRestore();
  });

  it('maps AppError subclasses to their status and code', async () => {
    const cases: Array<{ err: AppError; status: number; code: string }> = [
      { err: new NotFoundError('missing'), status: 404, code: 'NOT_FOUND' },
      {
        err: new ValidationError('bad'),
        status: 400,
        code: 'VALIDATION_ERROR',
      },
      { err: new ConflictError('dup'), status: 409, code: 'CONFLICT' },
    ];
    for (const { err, status, code } of cases) {
      const app = buildApp((_req, _res, next) => next(err));
      const res = await request(app).get('/');
      expect(res.status).toBe(status);
      expect(res.body.errors[0].code).toBe(code);
    }
  });

  it('formats ZodError as VALIDATION_ERROR with joined path/message', async () => {
    const schema = z.object({ a: z.string() });
    let thrown: ZodError | undefined;
    try {
      schema.parse({ a: 42 });
    } catch (e) {
      thrown = e as ZodError;
    }
    const app = buildApp((_req, _res, next) => next(thrown));

    const res = await request(app).get('/');

    expect(res.status).toBe(400);
    expect(res.body.errors[0].code).toBe('VALIDATION_ERROR');
    expect(res.body.errors[0].message).toContain('a:');
  });

  it('maps SQLITE_CONSTRAINT_UNIQUE to 409 CONFLICT', async () => {
    const app = buildApp((_req, _res, next) => {
      const e = Object.assign(new Error('UNIQUE'), {
        code: 'SQLITE_CONSTRAINT_UNIQUE',
      });
      next(e);
    });
    const res = await request(app).get('/');
    expect(res.status).toBe(409);
    expect(res.body.errors[0].code).toBe('CONFLICT');
  });

  it('uses default message when SQLITE_CONSTRAINT_UNIQUE has no message', async () => {
    const app = buildApp((_req, _res, next) => {
      const e: { code: string; message?: string } = {
        code: 'SQLITE_CONSTRAINT_UNIQUE',
      };
      next(e);
    });
    const res = await request(app).get('/');
    expect(res.status).toBe(409);
    expect(res.body.errors[0].message).toBe('Unique constraint violation');
  });

  it('maps SQLITE_CONSTRAINT_FOREIGNKEY to 400 FOREIGN_KEY', async () => {
    const app = buildApp((_req, _res, next) => {
      const e = Object.assign(new Error('FK'), {
        code: 'SQLITE_CONSTRAINT_FOREIGNKEY',
      });
      next(e);
    });
    const res = await request(app).get('/');
    expect(res.status).toBe(400);
    expect(res.body.errors[0].code).toBe('FOREIGN_KEY');
  });

  it('uses default message when SQLITE_CONSTRAINT_FOREIGNKEY has no message', async () => {
    const app = buildApp((_req, _res, next) => {
      next({ code: 'SQLITE_CONSTRAINT_FOREIGNKEY' });
    });
    const res = await request(app).get('/');
    expect(res.body.errors[0].message).toBe('Foreign key constraint violation');
  });

  it('maps SQLITE_CONSTRAINT_NOTNULL to 400 VALIDATION_ERROR', async () => {
    const app = buildApp((_req, _res, next) => {
      const e = Object.assign(new Error('NN'), {
        code: 'SQLITE_CONSTRAINT_NOTNULL',
      });
      next(e);
    });
    const res = await request(app).get('/');
    expect(res.status).toBe(400);
    expect(res.body.errors[0].code).toBe('VALIDATION_ERROR');
  });

  it('uses default message when SQLITE_CONSTRAINT_NOTNULL has no message', async () => {
    const app = buildApp((_req, _res, next) => {
      next({ code: 'SQLITE_CONSTRAINT_NOTNULL' });
    });
    const res = await request(app).get('/');
    expect(res.body.errors[0].message).toBe('Required field missing');
  });

  it('maps other SQLITE_CONSTRAINT_* to 400 VALIDATION_ERROR', async () => {
    const app = buildApp((_req, _res, next) => {
      const e = Object.assign(new Error('CHK'), {
        code: 'SQLITE_CONSTRAINT_CHECK',
      });
      next(e);
    });
    const res = await request(app).get('/');
    expect(res.status).toBe(400);
    expect(res.body.errors[0].code).toBe('VALIDATION_ERROR');
  });

  it('uses default message when SQLITE_CONSTRAINT_* has no message', async () => {
    const app = buildApp((_req, _res, next) => {
      next({ code: 'SQLITE_CONSTRAINT_CHECK' });
    });
    const res = await request(app).get('/');
    expect(res.body.errors[0].message).toBe('Constraint violation');
  });

  it('falls through to 500 for non-SQLITE_CONSTRAINT code values', async () => {
    const suppress = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const app = buildApp((_req, _res, next) => {
      next({ code: 'NOT_SQLITE', message: 'pg err' });
    });
    const res = await request(app).get('/');
    expect(res.status).toBe(500);
    suppress.mockRestore();
  });

  it('skips writing a response when headers already sent', async () => {
    const app = express();
    app.get('/', (_req, res, next) => {
      res.status(200).json({ ok: true });
      next(new Error('late'));
    });
    app.use(errorHandler);
    const suppress = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    suppress.mockRestore();
  });
});
