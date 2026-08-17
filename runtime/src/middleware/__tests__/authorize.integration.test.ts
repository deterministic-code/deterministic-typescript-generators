import request from 'supertest';
import express, { Request, Response } from 'express';
import { authorize } from '../authorize';
import { IAuthorizationService } from '../../services/IAuthorizationService';
import { errorHandler } from '../errorHandler';

function createMockAuthorizationService(): jest.Mocked<IAuthorizationService> {
  return {
    canAccessPermission: jest.fn(),
  };
}

function buildApp(authzService: jest.Mocked<IAuthorizationService>) {
  const app = express();

  // Apply authorize middleware globally
  app.use(authorize(authzService));

  // A test route
  app.get('/api/projects', (_req: Request, res: Response) => {
    res.json({ items: [] });
  });

  app.post('/api/users', (_req: Request, res: Response) => {
    res.json({ created: true });
  });

  app.delete('/api/tokens/:id', (_req: Request, res: Response) => {
    res.json({ deleted: true });
  });

  app.use(errorHandler);
  return app;
}

describe('authorize middleware', () => {
  let authzService: jest.Mocked<IAuthorizationService>;
  let app: express.Application;

  beforeEach(() => {
    authzService = createMockAuthorizationService();
    app = buildApp(authzService);
  });

  describe('granted access', () => {
    it('should call next when canAccessPermission returns granted: true', async () => {
      authzService.canAccessPermission.mockResolvedValue({
        granted: true,
      });

      const res = await request(app)
        .get('/api/projects')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ items: [] });
      expect(authzService.canAccessPermission).toHaveBeenCalledWith('valid-token', 'read:project');
    });

    it('should derive correct permission for POST requests', async () => {
      authzService.canAccessPermission.mockResolvedValue({
        granted: true,
      });

      const res = await request(app).post('/api/users').set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(authzService.canAccessPermission).toHaveBeenCalledWith('valid-token', 'create:user');
    });

    it('should derive correct permission for DELETE with actual path', async () => {
      authzService.canAccessPermission.mockResolvedValue({
        granted: true,
      });

      const res = await request(app)
        .delete('/api/tokens/42')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(authzService.canAccessPermission).toHaveBeenCalledWith('valid-token', 'delete:token');
    });
  });

  describe('denied access', () => {
    it('should return 403 when canAccessPermission returns granted: false', async () => {
      authzService.canAccessPermission.mockResolvedValue({
        granted: false,
        reason: 'Insufficient permissions',
      });

      const res = await request(app)
        .get('/api/projects')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(403);
      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].message).toBe('Insufficient permissions');
    });

    it('should use default reason when none provided', async () => {
      authzService.canAccessPermission.mockResolvedValue({
        granted: false,
      });

      const res = await request(app)
        .get('/api/projects')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(403);
      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].message).toBe('Forbidden');
    });

    it('should return 401 when statusCode is 401 (authentication failure)', async () => {
      authzService.canAccessPermission.mockResolvedValue({
        granted: false,
        reason: 'Authentication failed: Invalid or expired token',
        statusCode: 401,
      });

      const res = await request(app)
        .get('/api/projects')
        .set('Authorization', 'Bearer expired-token');

      expect(res.status).toBe(401);
      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].message).toBe('Authentication failed: Invalid or expired token');
    });
  });

  describe('missing Authorization header', () => {
    it('should return 401 when no Authorization header is present', async () => {
      const res = await request(app).get('/api/projects');

      expect(res.status).toBe(401);
      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].message).toBe('Authorization header is required');
      expect(authzService.canAccessPermission).not.toHaveBeenCalled();
    });
  });

  describe('invalid Authorization header format', () => {
    it('should return 401 when Authorization header does not use Bearer scheme', async () => {
      const res = await request(app).get('/api/projects').set('Authorization', 'Basic sometoken');

      expect(res.status).toBe(401);
      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].message).toBe('Authorization header must use Bearer scheme');
      expect(authzService.canAccessPermission).not.toHaveBeenCalled();
    });

    it('should return 401 when token is empty after Bearer prefix', async () => {
      const res = await request(app).get('/api/projects').set('Authorization', 'Bearer ');

      expect(res.status).toBe(401);
      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].message).toBe('Token is required');
      expect(authzService.canAccessPermission).not.toHaveBeenCalled();
    });
  });

  describe('unexpected errors', () => {
    it('should pass unexpected errors to next for error handler', async () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      authzService.canAccessPermission.mockRejectedValue(new Error('Service unavailable'));

      const res = await request(app)
        .get('/api/projects')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(500);
      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].message).toBe('Internal server error');
      errSpy.mockRestore();
    });
  });
});
