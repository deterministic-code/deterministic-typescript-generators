import request from 'supertest';
import { z } from 'zod';
import {
  buildItemCrudApp,
  createItemService as createService,
  sampleItem as sample,
} from './_crudRouterKit';

const buildApp = (
  service: ReturnType<typeof createService>,
  overrides: { patchSchema?: z.ZodSchema } = {},
) => buildItemCrudApp(service, { patchSchema: overrides.patchSchema, withErrorHandler: true });

describe('createCrudRouter.patch', () => {
  it('PATCH /:id calls service.patch (not service.update)', async () => {
    const service = createService();
    service.patch.mockResolvedValue(sample);
    const patchSchema = z.object({ name: z.string().optional() });
    const app = buildApp(service, { patchSchema });
    const res = await request(app).patch('/items/1').send({ name: 'patched' });
    expect(res.status).toBe(200);
    expect(service.patch).toHaveBeenCalledWith(1, { name: 'patched' });
    expect(service.update).not.toHaveBeenCalled();
  });

  it('PATCH /:id strips the PK column from body so the URL stays authoritative (cannot rename PK via body)', async () => {
    const service = createService();
    service.patch.mockResolvedValue(sample);
    const patchSchema = z.object({
      id: z.number().optional(),
      name: z.string().optional(),
    });
    const app = buildApp(service, { patchSchema });
    const res = await request(app).patch('/items/1').send({ id: 9999, name: 'patched' });
    expect(res.status).toBe(200);
    // id 9999 from body must NOT reach service.patch (would rename the row).
    expect(service.patch).toHaveBeenCalledWith(1, { name: 'patched' });
  });
});
