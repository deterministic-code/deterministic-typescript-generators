import type { NextFunction, Request, Response } from 'express';
import type { Mock } from 'vitest';
import { NotFoundMiddlewareService } from '../NotFoundMiddlewareService';

function createMockResponse(): {
  res: Response;
  status: Mock;
  json: Mock;
} {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const res = { status, json } as unknown as Response;
  return { res, status, json };
}

describe('NotFoundMiddlewareService', () => {
  let service: NotFoundMiddlewareService;
  let next: Mock;

  beforeEach(() => {
    service = new NotFoundMiddlewareService();
    next = vi.fn();
  });

  it('handle() sets HTTP status 404', async () => {
    const { res, status } = createMockResponse();
    await service.handle({} as Request, res, next as unknown as NextFunction);
    expect(status).toHaveBeenCalledWith(404);
  });

  it("handle() responds with { errors: [{ code: 'NOT_FOUND', message: 'Route not found' }] }", async () => {
    const { res, status } = createMockResponse();
    await service.handle({} as Request, res, next as unknown as NextFunction);
    const chained = status.mock.results[0].value as { json: Mock };
    expect(chained.json).toHaveBeenCalledWith({
      errors: [{ code: 'NOT_FOUND', message: 'Route not found' }],
    });
  });

  it('handle is bound to the instance (arrow property) so it survives destructured use', async () => {
    const { handle } = service;
    const { res, status } = createMockResponse();
    await expect(
      handle({} as Request, res, next as unknown as NextFunction),
    ).resolves.toBeUndefined();
    expect(status).toHaveBeenCalledWith(404);
  });

  it('handle forwards unexpected errors to next() (Express middleware idiom)', async () => {
    const boom = new Error('res.status failed');
    const status = vi.fn().mockImplementation(() => {
      throw boom;
    });
    const res = { status } as unknown as Response;
    await service.handle({} as Request, res, next as unknown as NextFunction);
    expect(next).toHaveBeenCalledWith(boom);
  });

  it('handle has Express 3-arg signature (req, res, next)', () => {
    expect(service.handle.length).toBe(3);
  });
});
