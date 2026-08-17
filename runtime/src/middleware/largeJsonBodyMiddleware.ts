import express, { type RequestHandler } from 'express';
import { guardBodyParser } from './guardBodyParser';

// 50 MB matches /api/verify's multipart ceiling (the only other large-payload endpoint family); mount via backend-app.yaml#middleware apply_routes so global jsonBody (1 MB) keeps protecting the rest. Wrapped via guardBodyParser so a malformed/over-limit body is a 4xx, not a 500.
export const largeJsonBodyMiddleware: RequestHandler = guardBodyParser(
  express.json({ limit: '50mb' }),
);
