import express, { type RequestHandler } from 'express';
import { guardBodyParser } from './guardBodyParser';

/**
 * Form-body middleware for `application/x-www-form-urlencoded` requests with
 * nested object support (`extended: true`). Populates `req.body`. Wraps
 * `express.urlencoded()` via {@link guardBodyParser}, so a malformed/over-limit
 * body returns the standard error envelope at its own 4xx status, not a 500.
 */
export const formBodyMiddleware: RequestHandler = guardBodyParser(
  express.urlencoded({ extended: true }),
);
