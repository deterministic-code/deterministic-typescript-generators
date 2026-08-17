import { Router, Request, Response, RequestHandler } from 'express';
import { ZodSchema } from 'zod';
import {
  IStandardCrudService,
  type StandardRow,
} from '../services/interfaces/IStandardCrudService';
import { handleZodError } from '../errors/handleZodError';
import { handleConstraintError } from '../errors/handleConstraintError';
import { sendItem, sendItems, sendError } from '../responses/sendResponse';
import { idOr400, parseIdField } from './routeParamUtils';
import { wrapRouteHandler as wrapHandler } from './wrapRouteHandler';
import type { PrimaryKey } from '../repositories/PrimaryKey';

export interface CrudRouterOptions<
  T extends StandardRow,
  TMutate = Omit<T, 'id' | 'uuid' | 'created' | 'updated'>,
> {
  service: IStandardCrudService<T, TMutate>;
  createSchema: ZodSchema;
  updateSchema: ZodSchema;
  patchSchema?: ZodSchema;
  entityName: string;
  mutationMiddleware?: RequestHandler[];
  enrichItems?: (items: T[]) => Promise<T[]>;
  enrichItem?: (item: T) => Promise<T>;
  resolveItem?: (item: T) => Promise<T>;
  /** When true, PUT/PATCH/DELETE require an If-Match: <updated> header. */
  useOptimisticConcurrency?: boolean;
}

interface ResolvedCrudRouter<T extends StandardRow, TMutate> {
  service: IStandardCrudService<T, TMutate>;
  createSchema: ZodSchema;
  updateSchema: ZodSchema;
  patchSchema: ZodSchema;
  entityName: string;
  primaryKey: PrimaryKey;
  useOptimisticConcurrency: boolean;
  enrichItems?: (items: T[]) => Promise<T[]>;
  enrichItem?: (item: T) => Promise<T>;
  resolveItem?: (item: T) => Promise<T>;
}

function requireIfMatch(cfg: { entityName: string }, req: Request, res: Response): string | null {
  const ifMatch = req.header('if-match');
  if (ifMatch === undefined || ifMatch === '') {
    sendError(
      res,
      428,
      'PRECONDITION_REQUIRED',
      `If-Match header required for ${req.method} on ${cfg.entityName}`,
    );
    return null;
  }
  return ifMatch.replace(/^"|"$/g, '');
}

function resolveExpectedUpdated<T extends StandardRow, TMutate>(
  cfg: ResolvedCrudRouter<T, TMutate>,
  req: Request,
  res: Response,
): { ok: true; expectedUpdated: string | undefined } | { ok: false } {
  if (!cfg.useOptimisticConcurrency) return { ok: true, expectedUpdated: undefined };
  const token = requireIfMatch(cfg, req, res);
  if (token === null) return { ok: false };
  return { ok: true, expectedUpdated: token };
}

function parseIdOrFail<T extends StandardRow, TMutate>(
  cfg: ResolvedCrudRouter<T, TMutate>,
  req: Request,
  res: Response,
): number | string | null {
  const pk = cfg.primaryKey;
  return idOr400(res, parseIdField(pk.routeIdType, pk.column, req.params[pk.column]));
}

function sendNotFound<T extends StandardRow, TMutate>(
  cfg: ResolvedCrudRouter<T, TMutate>,
  res: Response,
  id: number | string,
): void {
  sendError(res, 404, 'NOT_FOUND', `${cfg.entityName} with id '${id}' not found`);
}

function makeListHandler<T extends StandardRow, TMutate>(
  cfg: ResolvedCrudRouter<T, TMutate>,
): RequestHandler {
  return wrapHandler([], async (_req, res) => {
    const items = await cfg.service.findAll();
    const out = cfg.enrichItems ? await cfg.enrichItems(items) : items;
    sendItems(res, out as unknown[]);
  });
}

function makeGetByIdHandler<T extends StandardRow, TMutate>(
  cfg: ResolvedCrudRouter<T, TMutate>,
): RequestHandler {
  return wrapHandler([], async (req, res) => {
    const id = parseIdOrFail(cfg, req, res);
    if (id === null) return;
    const item = await cfg.service.findById(id as Parameters<typeof cfg.service.findById>[0]);
    if (!item) {
      sendNotFound(cfg, res, id);
      return;
    }
    const out = cfg.enrichItem ? await cfg.enrichItem(item) : item;
    sendItem(res, out as Record<string, unknown>);
  });
}

function makeCreateHandler<T extends StandardRow, TMutate>(
  cfg: ResolvedCrudRouter<T, TMutate>,
): RequestHandler {
  return wrapHandler([handleZodError, handleConstraintError], async (req, res) => {
    const parsed = cfg.createSchema.parse(req.body);
    const resolved = cfg.resolveItem
      ? await cfg.resolveItem(parsed as unknown as T)
      : (parsed as unknown as T);
    const item = await cfg.service.create(resolved as unknown as TMutate);
    const out = cfg.enrichItem ? await cfg.enrichItem(item) : item;
    sendItem(res, out as Record<string, unknown>, 201);
  });
}

function resolveMutationTarget<T extends StandardRow, TMutate>(
  cfg: ResolvedCrudRouter<T, TMutate>,
  req: Request,
  res: Response,
): { id: number | string; expectedUpdated: string | undefined } | null {
  const id = parseIdOrFail(cfg, req, res);
  if (id === null) return null;
  const concurrency = resolveExpectedUpdated(cfg, req, res);
  if (!concurrency.ok) return null;
  return { id, expectedUpdated: concurrency.expectedUpdated };
}

async function prepareMutationData<T extends StandardRow, TMutate>(
  cfg: ResolvedCrudRouter<T, TMutate>,
  schema: ZodSchema,
  body: unknown,
): Promise<Partial<TMutate>> {
  const parsed = schema.parse(body);
  const resolved = cfg.resolveItem
    ? await cfg.resolveItem(parsed as unknown as T)
    : (parsed as unknown as T);
  const data = resolved as unknown as Partial<TMutate>;
  // URL is authoritative for the PK; stripping it from the body before update() stops PATCH/PUT renaming the row out from under the find-after-update path (silently mutated the PK then 404'd on custom-string-PK entities like legacy_mailbox.key).
  const pkColumn = cfg.primaryKey.column;
  if (typeof (data as Record<string, unknown>)[pkColumn] !== 'undefined') {
    delete (data as Record<string, unknown>)[pkColumn];
  }
  return data;
}

async function runMutation<T extends StandardRow, TMutate>(
  cfg: ResolvedCrudRouter<T, TMutate>,
  args: {
    mode: 'put' | 'patch';
    typedId: unknown;
    data: Partial<TMutate>;
    expectedUpdated?: string;
  },
): Promise<T | null> {
  const { mode, typedId, data, expectedUpdated } = args;
  const id = typedId as Parameters<typeof cfg.service.update>[0];
  if (mode === 'put') {
    return expectedUpdated === undefined
      ? cfg.service.update(id, data)
      : cfg.service.update(id, data, { expectedUpdated });
  }
  return expectedUpdated === undefined
    ? cfg.service.patch(id, data)
    : cfg.service.patch(id, data, { expectedUpdated });
}

function makeMutationHandler<T extends StandardRow, TMutate>(
  cfg: ResolvedCrudRouter<T, TMutate>,
  schema: ZodSchema,
  mode: 'put' | 'patch',
): RequestHandler {
  return wrapHandler([handleZodError, handleConstraintError], async (req, res) => {
    const target = resolveMutationTarget(cfg, req, res);
    if (target === null) return;
    const data = await prepareMutationData(cfg, schema, req.body);
    const item = await runMutation(cfg, {
      mode,
      typedId: target.id,
      data,
      expectedUpdated: target.expectedUpdated,
    });
    if (!item) {
      sendNotFound(cfg, res, target.id);
      return;
    }
    const out = cfg.enrichItem ? await cfg.enrichItem(item) : item;
    sendItem(res, out as Record<string, unknown>);
  });
}

function makeDeleteHandler<T extends StandardRow, TMutate>(
  cfg: ResolvedCrudRouter<T, TMutate>,
): RequestHandler {
  return wrapHandler([handleConstraintError], async (req, res) => {
    const target = resolveMutationTarget(cfg, req, res);
    if (target === null) return;
    const typedId = target.id as Parameters<typeof cfg.service.delete>[0];
    const deleted =
      target.expectedUpdated === undefined
        ? await cfg.service.delete(typedId)
        : await cfg.service.delete(typedId, { expectedUpdated: target.expectedUpdated });
    if (!deleted) {
      sendNotFound(cfg, res, target.id);
      return;
    }
    sendItem(res, { success: true });
  });
}

export function createCrudRouter<
  T extends StandardRow,
  TMutate = Omit<T, 'id' | 'uuid' | 'created' | 'updated'>,
>(options: CrudRouterOptions<T, TMutate>): Router {
  const cfg: ResolvedCrudRouter<T, TMutate> = {
    service: options.service,
    createSchema: options.createSchema,
    updateSchema: options.updateSchema,
    patchSchema: options.patchSchema ?? options.updateSchema,
    entityName: options.entityName,
    primaryKey: options.service.primaryKey,
    useOptimisticConcurrency: options.useOptimisticConcurrency === true,
    enrichItems: options.enrichItems,
    enrichItem: options.enrichItem,
    resolveItem: options.resolveItem,
  };
  const mutationMiddleware = options.mutationMiddleware ?? [];
  const memberRoute = cfg.primaryKey.routeSegment();
  const router = Router();

  router.get('/', makeListHandler(cfg));
  router.get(memberRoute, makeGetByIdHandler(cfg));
  router.post('/', makeCreateHandler(cfg));
  router.put(memberRoute, ...mutationMiddleware, makeMutationHandler(cfg, cfg.updateSchema, 'put'));
  router.patch(
    memberRoute,
    ...mutationMiddleware,
    makeMutationHandler(cfg, cfg.patchSchema, 'patch'),
  );
  router.delete(memberRoute, ...mutationMiddleware, makeDeleteHandler(cfg));

  return router;
}
