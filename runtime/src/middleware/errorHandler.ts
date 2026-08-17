import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors/AppError';
import { BusinessError } from '../errors/BusinessError';
import { sendError, sendErrors } from '../responses/sendResponse';

/**
 * Global Express error-handler middleware. Must be registered **last** in the
 * middleware chain. Translates well-known error shapes into the standard
 * `{ errors: [{ code, message }] }` envelope:
 *
 * - `ZodError`                     → 400 `VALIDATION_ERROR` (one entry per issue)
 * - {@link BusinessError}          → `err.statusCode` with `err.code ?? "BUSINESS_ERROR"`
 * - {@link AppError}               → `err.status` with `err.code`
 * - `SQLITE_CONSTRAINT_UNIQUE`     → 409 `CONFLICT`
 * - `SQLITE_CONSTRAINT_FOREIGNKEY` → 400 `FOREIGN_KEY`
 * - `SQLITE_CONSTRAINT_NOTNULL`    → 400 `VALIDATION_ERROR`
 * - other `SQLITE_CONSTRAINT_*`    → 400 `VALIDATION_ERROR`
 * - anything else                  → 500 `INTERNAL_ERROR` (error is logged via `console.error`)
 *
 * If the response headers have already been sent the middleware is a no-op,
 * leaving the outgoing stream untouched.
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (res.headersSent) {
    return;
  }

  if (err instanceof ZodError) {
    const errors = err.errors.map((e) => ({
      code: 'VALIDATION_ERROR',
      message: `${e.path.join('.')}: ${e.message}`,
    }));
    sendErrors(res, 400, errors);
    return;
  }

  if (err instanceof BusinessError) {
    sendError(res, err.statusCode, err.code ?? 'BUSINESS_ERROR', err.message);
    return;
  }

  if (err instanceof AppError) {
    sendError(res, err.status, err.code, err.message);
    return;
  }

  if (err && typeof err === 'object' && 'code' in err) {
    // better-sqlite3 errors
    const sqliteErr = err as { code?: string; message?: string };
    if (sqliteErr.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      sendError(res, 409, 'CONFLICT', sqliteErr.message ?? 'Unique constraint violation');
      return;
    }
    if (sqliteErr.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
      sendError(res, 400, 'FOREIGN_KEY', sqliteErr.message ?? 'Foreign key constraint violation');
      return;
    }
    if (sqliteErr.code === 'SQLITE_CONSTRAINT_NOTNULL') {
      sendError(res, 400, 'VALIDATION_ERROR', sqliteErr.message ?? 'Required field missing');
      return;
    }
    if (typeof sqliteErr.code === 'string' && sqliteErr.code.startsWith('SQLITE_CONSTRAINT')) {
      sendError(res, 400, 'VALIDATION_ERROR', sqliteErr.message ?? 'Constraint violation');
      return;
    }
  }

  // eslint-disable-next-line no-console
  console.error('Unhandled error:', err);
  sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
};
