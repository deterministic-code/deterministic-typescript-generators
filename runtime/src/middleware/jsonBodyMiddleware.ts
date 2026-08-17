import express, { type RequestHandler } from 'express';
import { guardBodyParser } from './guardBodyParser';

/**
 * JSON request-body middleware capped at **1 MB**. Wraps `express.json()` via
 * {@link guardBodyParser}, so a malformed or over-limit body returns the
 * standard error envelope at its own 4xx status rather than a 500.
 */
export const jsonBodyMiddleware: RequestHandler = guardBodyParser(
  express.json({ limit: '1mb' }),
);
