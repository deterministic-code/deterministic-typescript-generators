import type { RequestHandler } from 'express';
import helmet from 'helmet';

const redocHelmet = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'blob:'],
      workerSrc: ["'self'", 'blob:'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'", 'data:'],
      imgSrc: ["'self'", 'data:'],
    },
  },
});

const defaultHelmet = helmet();

/**
 * Security-header middleware. Applies default CSP to every path except
 * `/api/docs/*`, which receives a relaxed CSP allowing `blob:` scripts/workers
 * + inline styles so Redoc and similar API-doc viewers can render. Express
 * implementation wraps `helmet`.
 */
export const securityHeadersMiddleware: RequestHandler = (req, res, next) => {
  if (req.path.startsWith('/api/docs')) return redocHelmet(req, res, next);
  return defaultHelmet(req, res, next);
};
