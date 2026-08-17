import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { BusinessError } from '../errors/BusinessError';

export interface SigninSessionInfo {
  uuid: string;
  session_id: number;
  token: string;
}

declare global {
  namespace Express {
    interface Request {
      signinSession?: SigninSessionInfo;
    }
  }
}

/**
 * Factory function that creates Express middleware for authenticating
 * signin session JWTs. These JWTs are created by POST /api/sessions/new_signin
 * and contain { sub: session.uuid, type: "signin", session_id: session.id }.
 *
 * Extracts Bearer token from the Authorization header, verifies the JWT
 * signature, validates the payload has type === "signin" and a sub claim,
 * then attaches the session info to req.signinSession.
 */
export function authenticateSignin(jwtSecret: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader) {
        next(new BusinessError(401, 'Authorization header is required', 'SIGNIN_SESSION_REQUIRED'));
        return;
      }

      if (!authHeader.startsWith('Bearer ')) {
        next(
          new BusinessError(
            401,
            'Authorization header must use Bearer scheme',
            'SIGNIN_SESSION_REQUIRED',
          ),
        );
        return;
      }

      const token = authHeader.slice(7).trim();

      if (!token) {
        next(new BusinessError(401, 'Signin session token is required', 'SIGNIN_SESSION_REQUIRED'));
        return;
      }

      let decoded: jwt.JwtPayload;
      try {
        decoded = jwt.verify(token, jwtSecret) as jwt.JwtPayload;
      } catch {
        next(new BusinessError(401, 'Invalid signin session token', 'SIGNIN_SESSION_INVALID'));
        return;
      }

      if (decoded.type !== 'signin') {
        next(
          new BusinessError(401, 'Token is not a signin session token', 'SIGNIN_SESSION_INVALID'),
        );
        return;
      }

      if (!decoded.sub) {
        next(
          new BusinessError(401, 'Token is missing session identifier', 'SIGNIN_SESSION_INVALID'),
        );
        return;
      }

      req.signinSession = {
        uuid: decoded.sub,
        session_id: decoded.session_id as number,
        token,
      };

      next();
    } catch (err) {
      next(err);
    }
  };
}
