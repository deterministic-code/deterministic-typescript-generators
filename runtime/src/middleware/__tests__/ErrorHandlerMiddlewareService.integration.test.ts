import request from 'supertest';
import express from 'express';
import {
  AppError,
  ConflictError,
  PreconditionFailedError,
  ValidationError,
} from '../../errors/AppError';
import { ErrorHandlerMiddlewareService } from '../ErrorHandlerMiddlewareService';
import { NotFoundMiddlewareService } from '../NotFoundMiddlewareService';

function errorHandledApp(): express.Express {
  const app = express();
  app.get('/matched', (_req, res) => {
    res.status(200).send('hello');
  });
  app.get('/validate', (_req, _res, next) => {
    next(new ValidationError('bad'));
  });
  app.get('/conflict', (_req, _res, next) => {
    next(new ConflictError('dup'));
  });
  app.get('/precondition', (_req, _res, next) => {
    next(new AppError(428, 'PRECONDITION_REQUIRED', 'if-match required'));
  });
  app.get('/precondition-failed', (_req, _res, next) => {
    next(new PreconditionFailedError('stale version'));
  });
  app.get('/untyped', (_req, _res, next) => {
    next(new Error('boom'));
  });
  app.get('/panic', (_req, _res, _next) => {
    throw new Error('panic-like throw');
  });
  app.use(new NotFoundMiddlewareService().handle);
  app.use(new ErrorHandlerMiddlewareService().handle);
  return app;
}

describe('ErrorHandlerMiddlewareService integration', () => {
  let errSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    errSpy.mockRestore();
  });

  it('validation error yields 400 envelope', async () => {
    const res = await request(errorHandledApp()).get('/validate');
    expect(res.status).toBe(400);
    expect(res.body.errors[0].code).toBe('VALIDATION_ERROR');
    expect(res.body.errors[0].message).toBe('bad');
  });

  it('conflict error yields 409 envelope', async () => {
    const res = await request(errorHandledApp()).get('/conflict');
    expect(res.status).toBe(409);
    expect(res.body.errors[0].code).toBe('CONFLICT');
    expect(res.body.errors[0].message).toBe('dup');
  });

  it('precondition error yields 428 envelope', async () => {
    const res = await request(errorHandledApp()).get('/precondition');
    expect(res.status).toBe(428);
    expect(res.body.errors[0].code).toBe('PRECONDITION_REQUIRED');
    expect(res.body.errors[0].message).toBe('if-match required');
  });

  it('stale optimistic-concurrency token yields 412 envelope', async () => {
    const res = await request(errorHandledApp()).get('/precondition-failed');
    expect(res.status).toBe(412);
    expect(res.body.errors[0].code).toBe('PRECONDITION_FAILED');
    expect(res.body.errors[0].message).toBe('stale version');
  });

  it('untyped 500 becomes internal error envelope', async () => {
    const res = await request(errorHandledApp()).get('/untyped');
    expect(res.status).toBe(500);
    expect(res.body.errors[0].code).toBe('INTERNAL_ERROR');
    expect(res.body.errors[0].message).toBe('Internal server error');
  });

  it('two hundred untouched', async () => {
    const res = await request(errorHandledApp()).get('/matched');
    expect(res.status).toBe(200);
    expect(res.text).toBe('hello');
  });

  it('panic becomes 500 envelope via catch panic', async () => {
    const res = await request(errorHandledApp()).get('/panic');
    expect(res.status).toBe(500);
    expect(res.body.errors[0].code).toBe('INTERNAL_ERROR');
    expect(res.body.errors[0].message).toBe('Internal server error');
  });

  it('composed with not found unrouted returns not found', async () => {
    const res = await request(errorHandledApp()).get('/no-such-path');
    expect(res.status).toBe(404);
    expect(res.body.errors[0].code).toBe('NOT_FOUND');
  });

  it('composed with not found routed error returns internal error', async () => {
    const res = await request(errorHandledApp()).get('/untyped');
    expect(res.status).toBe(500);
    expect(res.body.errors[0].code).toBe('INTERNAL_ERROR');
  });
});
