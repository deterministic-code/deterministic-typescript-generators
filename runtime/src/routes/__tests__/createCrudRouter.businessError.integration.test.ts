import request from 'supertest';
import { BusinessError } from '../../errors/BusinessError';
import {
  type Item,
  buildItemCrudApp,
  createItemService as createService,
  sampleItem as sample,
} from './_crudRouterKit';

async function postWithCreateError(
  error: unknown,
): Promise<{ res: request.Response; nextErr: unknown }> {
  const service = createService();
  service.create.mockRejectedValue(error);
  let nextErr: unknown;
  const app = buildItemCrudApp(service, { captureNext: (err) => (nextErr = err) });
  const res = await request(app).post('/items').send({ name: 'a' });
  return { res, nextErr };
}

describe('createCrudRouter — BusinessError handled at route level without global errorHandler', () => {
  it('POST / converts a service BusinessError to a clean 400 JSON envelope and never reaches next()', async () => {
    const { res, nextErr } = await postWithCreateError(
      new BusinessError(400, "Invalid application_name: 'sample'"),
    );
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      errors: [{ code: 'BUSINESS_ERROR', message: "Invalid application_name: 'sample'" }],
    });
    expect(res.body.errors[0].message).toMatch(/Invalid application_name/);
    expect(nextErr).toBeUndefined();
  });

  it('GET /:id converts an enrichItem BusinessError to a clean 400 JSON envelope and never reaches next()', async () => {
    const service = createService();
    service.findById.mockResolvedValue(sample);
    let nextErr: unknown;
    const enrichItem = async (): Promise<Item> => {
      throw new BusinessError(400, "Invalid application_name: 'sample'");
    };
    const app = buildItemCrudApp(service, { enrichItem, captureNext: (err) => (nextErr = err) });
    const res = await request(app).get('/items/1');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      errors: [{ code: 'BUSINESS_ERROR', message: "Invalid application_name: 'sample'" }],
    });
    expect(nextErr).toBeUndefined();
  });

  it('POST / preserves a non-400 BusinessError status code (e.g. 409)', async () => {
    const { res } = await postWithCreateError(new BusinessError(409, 'already exists', 'CONFLICT'));
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ errors: [{ code: 'CONFLICT', message: 'already exists' }] });
  });

  it('POST / still forwards an unexpected (non-Business) error to next() so it is not swallowed', async () => {
    const { res, nextErr } = await postWithCreateError(new Error('boom'));
    expect(res.status).toBe(599);
    expect(res.body).toEqual({ reachedNext: true });
    expect(nextErr).toBeInstanceOf(Error);
    expect((nextErr as Error).message).toBe('boom');
    expect(nextErr).not.toBeInstanceOf(BusinessError);
  });
});
