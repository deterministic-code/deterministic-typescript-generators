import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
import { handleZodError } from '../errors/handleZodError';

/**
 * Builds an Express middleware that parses `req.body` against a Zod schema
 * and replaces `req.body` with the parsed value. On a `ZodError` it responds
 * with 400 `VALIDATION_ERROR` via {@link handleZodError}; any other thrown
 * error is forwarded to `next(err)`.
 *
 * @param schema The Zod schema to enforce on `req.body`.
 */
export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (handleZodError(err, res)) return;
      next(err);
    }
  };
}

/**
 * Builds an Express middleware that parses `req.params` against a Zod schema
 * (typical use: coerce `"1"` → `1`, reject non-positive ids). On a `ZodError`
 * it responds with 400 `VALIDATION_ERROR`; any other thrown error is forwarded
 * to `next(err)`.
 *
 * @param schema The Zod schema to enforce on `req.params`.
 */
export function validateParams(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.params = schema.parse(req.params);
      next();
    } catch (err) {
      if (handleZodError(err, res)) return;
      next(err);
    }
  };
}
