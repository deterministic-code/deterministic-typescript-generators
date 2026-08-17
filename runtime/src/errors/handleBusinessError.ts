import { Response } from 'express';
import { BusinessError } from './BusinessError';

/**
 * Checks whether `err` is a {@link BusinessError} and, if so, writes an
 * `{ errors: [{ code, message }] }` response with the error's status code.
 *
 * Designed for route-level `catch` blocks where `next(err)` is not desired.
 *
 * @param err Anything thrown from the route handler.
 * @param res Express response to write to when `err` is handled.
 * @returns `true` if a response was sent (the caller should `return`);
 *          `false` if the error was not a BusinessError (caller should
 *          rethrow or call `next(err)`).
 */
export function handleBusinessError(err: unknown, res: Response): boolean {
  if (err instanceof BusinessError) {
    res.status(err.statusCode).json({
      errors: [
        {
          code: err.code ?? 'BUSINESS_ERROR',
          message: err.message,
        },
      ],
    });
    return true;
  }
  return false;
}
