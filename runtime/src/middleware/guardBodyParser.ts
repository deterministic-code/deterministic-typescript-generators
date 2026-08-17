import type { RequestHandler } from 'express';
import { sendError } from '../responses/sendResponse';

/**
 * Wrap a body-parser middleware (`express.json()`, `express.urlencoded()`, …) so
 * its **client** errors — malformed JSON (`entity.parse.failed`, 400), an
 * over-limit body (413), an unsupported charset (415), … — become the standard
 * `{ errors: [{ code, message }] }` envelope at the error's own 4xx status
 * instead of escaping to the generic error handler as a 500. Non-4xx errors are
 * forwarded unchanged.
 */
export function guardBodyParser(parser: RequestHandler): RequestHandler {
  return (req, res, next) => {
    parser(req, res, (err: unknown) => {
      if (!err) {
        next();
        return;
      }
      const httpErr = err as {
        status?: unknown;
        statusCode?: unknown;
        message?: string;
      };
      const status =
        typeof httpErr.status === 'number'
          ? httpErr.status
          : typeof httpErr.statusCode === 'number'
            ? httpErr.statusCode
            : 400;
      if (status >= 400 && status < 500) {
        sendError(res, status, 'BAD_REQUEST', httpErr.message ?? 'Malformed request body');
        return;
      }
      next(err);
    });
  };
}
