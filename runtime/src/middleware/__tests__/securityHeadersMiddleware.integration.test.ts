import express from 'express';
import request from 'supertest';
import { securityHeadersMiddleware } from '../securityHeadersMiddleware';

describe('securityHeadersMiddleware', () => {
  const app = express();
  app.use(securityHeadersMiddleware);
  app.get('/api/docs', (_req, res) => res.json({ docs: true }));
  app.get('/other', (_req, res) => res.json({ other: true }));

  it('uses the redoc-friendly CSP on /api/docs paths', async () => {
    const res = await request(app).get('/api/docs');
    expect(res.status).toBe(200);
    expect(res.headers['content-security-policy']).toContain('blob:');
  });

  it('uses the default CSP on non-docs paths', async () => {
    const res = await request(app).get('/other');
    expect(res.status).toBe(200);
    const csp = res.headers['content-security-policy'] ?? '';
    expect(csp).not.toContain('blob:');
  });
});
