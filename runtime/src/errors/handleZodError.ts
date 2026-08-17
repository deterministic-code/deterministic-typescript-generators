import { Response } from 'express';
import { ZodError } from 'zod';

/**
 * Checks whether `err` is a `ZodError` and, if so, writes a
 * 400 response whose `errors[0].message` joins every issue as
 * `"<path>: <message>"` separated by `"; "`.
 *
 * @param err Anything thrown from the route/validator.
 * @param res Express response to write to.
 * @returns `true` if a response was sent; `false` otherwise.
 */
export function handleZodError(err: unknown, res: Response): boolean {
  if (err instanceof ZodError) {
    res.status(400).json({
      errors: [
        {
          code: 'VALIDATION_ERROR',
          message: err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '),
        },
      ],
    });
    return true;
  }
  return false;
}
