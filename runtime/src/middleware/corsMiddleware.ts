import type { RequestHandler } from 'express';
import cors from 'cors';

/**
 * Default CORS middleware — reflects the request origin and handles
 * pre-flight `OPTIONS`. Mount it globally on the Express app.
 *
 * Customise by constructing your own `cors({ ... })` instead of using this.
 */
export const corsMiddleware: RequestHandler = cors();
