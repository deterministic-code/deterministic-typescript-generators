import type { NextFunction, Request, Response } from 'express';

/**
 * Terminal 404 middleware contract. Implementations return a
 * `{ errors: [{ code, message }] }` envelope at status 404 when no
 * earlier route matched. Register last in the middleware chain,
 * immediately before the error handler.
 */
export interface INotFoundMiddlewareService {
  handle(req: Request, res: Response, next: NextFunction): Promise<void>;
}

/**
 * Default terminal 404 middleware. Responds with
 * `{ errors: [{ code: "NOT_FOUND", message: "Route not found" }] }` at
 * HTTP 404. Forwards unexpected response-layer errors to `next(err)` so
 * the downstream error handler can translate them.
 *
 * Zero constructor args — class wins over YAML in data-driven pipelines
 * that honour a `static readonly dependencies` contract. The
 * `readonly never[]` type avoids leaking any `ArgSpec`-like type back
 * into consumers.
 */
export class NotFoundMiddlewareService implements INotFoundMiddlewareService {
  static readonly dependencies: readonly never[] = [];

  readonly handle = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.status(404).json({ errors: [{ code: 'NOT_FOUND', message: 'Route not found' }] });
    } catch (err) {
      next(err);
    }
  };
}
