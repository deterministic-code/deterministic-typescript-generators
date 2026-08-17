import express, { type Request, type Response } from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { authenticateSignin } from '../authenticateSignin';
import { errorHandler } from '../errorHandler';

const SECRET = 'test-secret';

function buildApp() {
  const app = express();
  app.use(authenticateSignin(SECRET));
  app.get('/', (req: Request, res: Response) => {
    res.json({ session: req.signinSession });
  });
  app.use(errorHandler);
  return app;
}

describe('authenticateSignin', () => {
  it('returns 401 when the Authorization header is missing', async () => {
    const res = await request(buildApp()).get('/');
    expect(res.status).toBe(401);
    expect(res.body.errors[0].code).toBe('SIGNIN_SESSION_REQUIRED');
    expect(res.body.errors[0].message).toBe('Authorization header is required');
  });

  it('returns 401 when the Authorization header is not Bearer', async () => {
    const res = await request(buildApp()).get('/').set('Authorization', 'Basic abc');
    expect(res.status).toBe(401);
    expect(res.body.errors[0].code).toBe('SIGNIN_SESSION_REQUIRED');
    expect(res.body.errors[0].message).toBe('Authorization header must use Bearer scheme');
  });

  it('returns 401 when the Bearer token is empty', async () => {
    const { authenticateSignin } = await import('../authenticateSignin');
    const mw = authenticateSignin(SECRET);
    const req = {
      headers: { authorization: 'Bearer    ' },
    } as unknown as import('express').Request;
    const next = vi.fn();
    mw(req, {} as import('express').Response, next);
    const err = next.mock.calls[0][0] as {
      statusCode: number;
      code: string;
      message: string;
    };
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('SIGNIN_SESSION_REQUIRED');
    expect(err.message).toBe('Signin session token is required');
  });

  it('returns 401 when the JWT signature is invalid', async () => {
    const bad = jwt.sign({ type: 'signin', sub: 'uuid' }, 'other-secret');
    const res = await request(buildApp()).get('/').set('Authorization', `Bearer ${bad}`);
    expect(res.status).toBe(401);
    expect(res.body.errors[0].code).toBe('SIGNIN_SESSION_INVALID');
    expect(res.body.errors[0].message).toBe('Invalid signin session token');
  });

  it('returns 401 when the token has the wrong type claim', async () => {
    const token = jwt.sign({ type: 'access', sub: 'uuid' }, SECRET);
    const res = await request(buildApp()).get('/').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.errors[0].code).toBe('SIGNIN_SESSION_INVALID');
    expect(res.body.errors[0].message).toBe('Token is not a signin session token');
  });

  it('returns 401 when the token has no sub claim', async () => {
    const token = jwt.sign({ type: 'signin' }, SECRET);
    const res = await request(buildApp()).get('/').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.errors[0].code).toBe('SIGNIN_SESSION_INVALID');
    expect(res.body.errors[0].message).toBe('Token is missing session identifier');
  });

  it('expired token returns signin session invalid', async () => {
    const past = Math.floor(Date.now() / 1000) - 3600;
    const token = jwt.sign({ type: 'signin', sub: 'session-uuid', session_id: 1, exp: past }, SECRET);
    const res = await request(buildApp()).get('/').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.errors[0].code).toBe('SIGNIN_SESSION_INVALID');
  });

  it('token without exp claim is still accepted', async () => {
    const token = jwt.sign({ type: 'signin', sub: 'session-uuid', session_id: 7 }, SECRET);
    const res = await request(buildApp()).get('/').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('token with future exp claim is accepted', async () => {
    const future = Math.floor(Date.now() / 1000) + 3600;
    const token = jwt.sign({ type: 'signin', sub: 'session-uuid', session_id: 42, exp: future }, SECRET);
    const res = await request(buildApp()).get('/').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('attaches session info on a valid token and calls next', async () => {
    const token = jwt.sign({ type: 'signin', sub: 'session-uuid', session_id: 99 }, SECRET);
    const res = await request(buildApp()).get('/').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.session).toEqual({
      uuid: 'session-uuid',
      session_id: 99,
      token,
    });
  });

  it('forwards unexpected sync errors to the error handler', async () => {
    const spy = vi.spyOn(jwt, 'verify').mockImplementationOnce(() => {
      // Throw a non-verify error (not the JsonWebTokenError path).
      const err: Error & { code?: string } = new Error('boom');
      err.code = 'not_jwt_error';
      throw err;
    });
    const app = buildApp();

    const token = jwt.sign({ type: 'signin', sub: 'u', session_id: 1 }, SECRET);
    const res = await request(app).get('/').set('Authorization', `Bearer ${token}`);

    // jwt.verify threw → middleware's inner try/catch fires SIGNIN_SESSION_INVALID
    expect(res.status).toBe(401);
    expect(res.body.errors[0].code).toBe('SIGNIN_SESSION_INVALID');
    spy.mockRestore();
  });

  it('forwards errors thrown before jwt.verify to next()', async () => {
    const spy = vi.spyOn(String.prototype, 'startsWith').mockImplementationOnce(() => {
      throw new Error('header check blew up');
    });
    const suppress = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await request(buildApp()).get('/').set('Authorization', 'Bearer abc');
    expect(res.status).toBe(500);
    spy.mockRestore();
    suppress.mockRestore();
  });
});
