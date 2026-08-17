import request from 'supertest';
import express, { Request, Response } from 'express';
import { authenticate } from '../authenticate';
import { IAuthenticationService } from '../../services/IAuthenticationService';
import { UserInfoResult } from '../../services/ISigninService';
import { BusinessError } from '../../errors/BusinessError';
import { errorHandler } from '../errorHandler';

function createMockAuthenticationService(): jest.Mocked<IAuthenticationService> {
  return {
    authenticate: jest.fn(),
  };
}

function buildApp(authService: jest.Mocked<IAuthenticationService>) {
  const app = express();

  // Protected route that uses the middleware
  app.get('/protected', authenticate(authService), (req: Request, res: Response) => {
    res.json({ user: (req as any).user });
  });

  app.use(errorHandler);
  return app;
}

describe('authenticate middleware', () => {
  let authService: jest.Mocked<IAuthenticationService>;
  let app: express.Application;

  const validUserInfo: UserInfoResult = {
    user_id: 1,
    username: 'testuser',
    roles: [],
    scopes: [],
    iat: 1000000,
    exp: 2000000,
  };

  beforeEach(() => {
    authService = createMockAuthenticationService();
    app = buildApp(authService);
  });

  describe('successful authentication', () => {
    it('should call next and attach user to request when token is valid', async () => {
      authService.authenticate.mockResolvedValue(validUserInfo);

      const res = await request(app).get('/protected').set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.user).toEqual(validUserInfo);
      expect(authService.authenticate).toHaveBeenCalledWith('valid-token');
    });

    it('should trim whitespace from the token', async () => {
      authService.authenticate.mockResolvedValue(validUserInfo);

      const res = await request(app)
        .get('/protected')
        .set('Authorization', 'Bearer   valid-token  ');

      expect(res.status).toBe(200);
      expect(authService.authenticate).toHaveBeenCalledWith('valid-token');
    });
  });

  describe('missing Authorization header', () => {
    it('should return 401 when Authorization header is absent', async () => {
      const res = await request(app).get('/protected');

      expect(res.status).toBe(401);
      expect(res.body).toEqual({
        errors: [
          {
            code: 'BUSINESS_ERROR',
            message: 'Authorization header is required',
          },
        ],
      });
      expect(authService.authenticate).not.toHaveBeenCalled();
    });
  });

  describe('invalid Authorization header format', () => {
    it('should return 401 when Authorization header does not start with Bearer', async () => {
      const res = await request(app).get('/protected').set('Authorization', 'Basic sometoken');

      expect(res.status).toBe(401);
      expect(res.body).toEqual({
        errors: [
          {
            code: 'BUSINESS_ERROR',
            message: 'Authorization header must use Bearer scheme',
          },
        ],
      });
      expect(authService.authenticate).not.toHaveBeenCalled();
    });

    it('should return 401 when token is empty after Bearer prefix', async () => {
      const res = await request(app).get('/protected').set('Authorization', 'Bearer ');

      expect(res.status).toBe(401);
      expect(res.body).toEqual({
        errors: [
          {
            code: 'BUSINESS_ERROR',
            message: 'Token is required',
          },
        ],
      });
      expect(authService.authenticate).not.toHaveBeenCalled();
    });

    it('should return 401 when Bearer prefix has only whitespace after it', async () => {
      const res = await request(app).get('/protected').set('Authorization', 'Bearer    ');

      expect(res.status).toBe(401);
      expect(res.body).toEqual({
        errors: [
          {
            code: 'BUSINESS_ERROR',
            message: 'Token is required',
          },
        ],
      });
      expect(authService.authenticate).not.toHaveBeenCalled();
    });
  });

  describe('invalid token', () => {
    it('should return 401 when authService.authenticate throws BusinessError', async () => {
      authService.authenticate.mockRejectedValue(
        new BusinessError(401, 'Invalid or expired token'),
      );

      const res = await request(app).get('/protected').set('Authorization', 'Bearer bad-token');

      expect(res.status).toBe(401);
      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].message).toBe('Invalid or expired token');
    });
  });

  describe('unexpected errors', () => {
    it('should pass unexpected errors to next for error handler', async () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      authService.authenticate.mockRejectedValue(new Error('Unexpected failure'));

      const res = await request(app).get('/protected').set('Authorization', 'Bearer some-token');

      expect(res.status).toBe(500);
      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].message).toBe('Internal server error');
      errSpy.mockRestore();
    });
  });
});
