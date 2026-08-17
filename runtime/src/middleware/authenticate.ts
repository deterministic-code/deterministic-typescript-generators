import { Request, Response, NextFunction } from 'express';
import { IAuthenticationService } from '../services/IAuthenticationService';
import { BusinessError } from '../errors/BusinessError';
import { UserInfoResult } from '../services/ISigninService';

/**
 * Extends the Express Request interface to include an optional `user` property
 * populated by the authenticateRequest middleware.
 */
declare global {
  namespace Express {
    interface Request {
      user?: UserInfoResult;
    }
  }
}

/**
 * Factory function that creates Express middleware for authenticating requests.
 * Extracts Bearer token from the Authorization header, validates it via
 * the provided IAuthenticationService, and attaches the user info to req.user.
 *
 * This middleware is NOT applied globally -- routes opt in by using it.
 */
export function authenticate(authService: IAuthenticationService) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader) {
        next(new BusinessError(401, 'Authorization header is required'));
        return;
      }

      const parts = authHeader.split(' ');

      if (parts[0] !== 'Bearer') {
        next(new BusinessError(401, 'Authorization header must use Bearer scheme'));
        return;
      }

      const token = parts.slice(1).join(' ').trim();

      if (!token) {
        next(new BusinessError(401, 'Token is required'));
        return;
      }

      const userInfo = await authService.authenticate(token);
      req.user = userInfo;
      next();
    } catch (err) {
      next(err);
    }
  };
}
