import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { handleBusinessError } from '../errors/handleBusinessError';

export type RouteErrorHandler = (err: unknown, res: Response) => boolean;

/**
 * Wrap an async route body so a thrown error is classified consistently: each
 * `errorHandlers` entry gets a chance to send a response; a {@link BusinessError}
 * is always sent as a clean 4xx so it never reaches Express's finalhandler (which
 * console.errors the stack to stderr unless NODE_ENV==='test'); anything else is
 * an unexpected error and propagates to `next(err)`.
 */
export function wrapRouteHandler(
  errorHandlers: RouteErrorHandler[],
  fn: (req: Request, res: Response) => Promise<void>,
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await fn(req, res);
    } catch (err) {
      for (const handle of errorHandlers) {
        if (handle(err, res)) return;
      }
      if (handleBusinessError(err, res)) return;
      next(err);
    }
  };
}
