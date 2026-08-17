import type { Response } from 'express';

/**
 * One entry in the standard `{ errors: [...] }` envelope.
 * Every error response in the library has this shape.
 */
export interface ApiErrorEntry {
  code: string;
  message: string;
}

/**
 * Sends a single resource as the response body (no envelope).
 * Used for `GET /:id`, `POST /`, `PUT /:id`, `PATCH /:id` style routes.
 *
 * @param res    Express response.
 * @param data   Object serialised directly as JSON.
 * @param status HTTP status to send. Defaults to `200`.
 */
export function sendItem<T>(res: Response, data: T, status = 200): Response {
  return res.status(status).json(data);
}

/**
 * Sends a list as `{ items: [...] }`.
 * Used for `GET /` style list routes.
 *
 * @param res    Express response.
 * @param items  Array of resources to return.
 * @param status HTTP status. Defaults to `200`.
 */
export function sendItems<T>(res: Response, items: T[], status = 200): Response {
  return res.status(status).json({ items });
}

/**
 * Sends `{ success: true }`. Useful for `DELETE` or fire-and-forget mutations
 * that have no payload to return.
 *
 * @param res    Express response.
 * @param status HTTP status. Defaults to `200`.
 */
export function sendSuccess(res: Response, status = 200): Response {
  return res.status(status).json({ success: true });
}

/**
 * Sends a single-error envelope `{ errors: [{ code, message }] }`.
 *
 * @param res     Express response.
 * @param status  HTTP status (e.g., `400`, `404`, `409`).
 * @param code    Machine-readable error code (e.g., `"VALIDATION_ERROR"`).
 * @param message Human-readable message.
 */
export function sendError(res: Response, status: number, code: string, message: string): Response {
  return res.status(status).json({ errors: [{ code, message }] });
}

/**
 * Sends a multi-error envelope `{ errors: ApiErrorEntry[] }`.
 * Used when validation surfaces several issues at once (e.g., Zod).
 *
 * @param res    Express response.
 * @param status HTTP status.
 * @param errors Array of error entries.
 */
export function sendErrors(res: Response, status: number, errors: ApiErrorEntry[]): Response {
  return res.status(status).json({ errors });
}
