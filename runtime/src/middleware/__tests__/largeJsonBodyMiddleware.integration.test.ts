import express, { type ErrorRequestHandler } from 'express';
import request from 'supertest';
import { largeJsonBodyMiddleware } from '../largeJsonBodyMiddleware';
import { MiddlewareLookup } from '../MiddlewareLookup';


const surface413: ErrorRequestHandler = (err, _req, res, next) => {
  if (err && typeof err === 'object' && (err as { status?: number }).status === 413) {
    res.status(413).json({ type: (err as { type?: string }).type ?? 'entity.too.large' });
    return;
  }
  next(err);
};

describe('largeJsonBodyMiddleware', () => {
  it('accepts a 5 MB JSON body (above the 1 MB global cap)', async () => {
    const app = express();
    app.use(largeJsonBodyMiddleware);
    app.post('/', (req, res) => res.json({ size: (req.body?.filler ?? '').length }));
    app.use(surface413);

    const filler = 'x'.repeat(5 * 1024 * 1024);
    const res = await request(app)
      .post('/')
      .set('Content-Type', 'application/json')
      .send({ filler });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ size: 5 * 1024 * 1024 });
  });

  it("MiddlewareLookup.get('largeJsonBody') returns the exported handler", () => {
    const lookup = new MiddlewareLookup();
    expect(lookup.get('largeJsonBody')).toBe(largeJsonBodyMiddleware);
  });
});
