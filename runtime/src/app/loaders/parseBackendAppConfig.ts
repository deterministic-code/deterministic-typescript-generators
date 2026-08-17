import { z } from 'zod';

export const DEFAULT_MIDDLEWARE = ['securityHeaders', 'cors', 'jsonBody', 'formBody'] as const;

// Tail handlers (404 + error) auto-mount unless disabled via `handlers: [{ Name: { enabled: false } }]`; they're stateless Express terminators shipped from `deterministic/middleware` and never need a services.yaml entry.
export const DEFAULT_HANDLERS = [
  'NotFoundMiddlewareService',
  'ErrorHandlerMiddlewareService',
] as const;

const staticEntrySchema = z.object({
  path: z.string().min(1),
  dir: z.string().min(1),
});

const middlewareOptionsSchema = z
  .object({
    type: z.enum(['app', 'route', 'service', 'datasource']).optional(),
    enabled: z.boolean().optional(),
    apply_routes: z.array(z.string().min(1).startsWith('/')).min(1).optional(),
    deny_routes: z.array(z.string().min(1).startsWith('/')).min(1).optional(),
  })
  .strict()
  .refine((o) => !(o.apply_routes && o.deny_routes), {
    message: 'apply_routes and deny_routes are mutually exclusive on a single middleware item',
  });

const middlewareItemSchema = z.union([
  z.string().min(1),
  z.record(middlewareOptionsSchema).refine((m) => Object.keys(m).length === 1, {
    message: 'middleware item map must have exactly one key (the middleware name)',
  }),
]);

const handlerOptionsSchema = z
  .object({
    enabled: z.boolean().optional(),
  })
  .strict();

const handlerItemSchema = z.union([
  z.string().min(1),
  z.record(handlerOptionsSchema).refine((m) => Object.keys(m).length === 1, {
    message: 'handler item map must have exactly one key (the handler name)',
  }),
]);

const appConfigSchema = z
  .object({
    middleware: z.array(middlewareItemSchema).optional(),
    // Handlers list may be omitted; DEFAULT_HANDLERS auto-merge so 404+error tail handlers always mount unless explicitly disabled.
    handlers: z.array(handlerItemSchema).optional().default([]),
    statics: z.array(staticEntrySchema).min(1).optional(),
  })
  .passthrough();

export interface MiddlewareEntry {
  name: string;
  type: 'app' | 'route' | 'service' | 'datasource';
  enabled: boolean;
  apply_routes?: string[];
  deny_routes?: string[];
}

interface HandlerEntry {
  name: string;
  enabled: boolean;
}

export type StaticEntry = z.infer<typeof staticEntrySchema>;

export interface BackendAppConfig {
  middleware: MiddlewareEntry[];
  handlers: HandlerEntry[];
  statics?: StaticEntry[];
}

type RawMiddlewareItem = z.infer<typeof middlewareItemSchema>;

function normalizeMiddlewareItem(item: RawMiddlewareItem): MiddlewareEntry {
  if (typeof item === 'string') {
    return { name: item, type: 'app', enabled: true };
  }
  const [name] = Object.keys(item);
  const opts = item[name];
  const entry: MiddlewareEntry = {
    name,
    type: (opts.type as 'app' | 'route' | 'service' | 'datasource') ?? 'app',
    enabled: opts.enabled ?? true,
  };
  if (opts.apply_routes) entry.apply_routes = opts.apply_routes;
  if (opts.deny_routes) entry.deny_routes = opts.deny_routes;
  return entry;
}

function mergeDefaults(declared: MiddlewareEntry[]): MiddlewareEntry[] {
  const declaredNames = new Set(declared.map((e) => e.name));
  const missing: MiddlewareEntry[] = DEFAULT_MIDDLEWARE.filter(
    (name) => !declaredNames.has(name),
  ).map((name) => ({ name, type: 'app', enabled: true }));
  return [...missing, ...declared];
}

type RawHandlerItem = z.infer<typeof handlerItemSchema>;

function normalizeHandlerItem(item: RawHandlerItem): HandlerEntry {
  if (typeof item === 'string') {
    return { name: item, enabled: true };
  }
  const [name] = Object.keys(item);
  const opts = item[name];
  return { name, enabled: opts.enabled ?? true };
}

function mergeHandlerDefaults(declared: HandlerEntry[]): HandlerEntry[] {
  const declaredNames = new Set(declared.map((e) => e.name));
  const missing: HandlerEntry[] = DEFAULT_HANDLERS.filter((name) => !declaredNames.has(name)).map(
    (name) => ({ name, enabled: true }),
  );
  return [...missing, ...declared];
}

export function parseBackendAppConfig(doc: unknown): BackendAppConfig {
  const parsed = appConfigSchema.parse(doc);
  const declared = (parsed.middleware ?? []).map(normalizeMiddlewareItem);

  const seen = new Map<string, number>();
  for (let i = 0; i < declared.length; i++) {
    const name = declared[i].name;
    if (seen.has(name)) {
      throw new Error(
        `backend-app.yaml: duplicate middleware name "${name}" at indices ${seen.get(name)} and ${i}`,
      );
    }
    seen.set(name, i);
  }

  const declaredHandlers = parsed.handlers.map(normalizeHandlerItem);
  const handlersSeen = new Map<string, number>();
  for (let i = 0; i < declaredHandlers.length; i++) {
    const name = declaredHandlers[i].name;
    if (handlersSeen.has(name)) {
      throw new Error(
        `backend-app.yaml: duplicate handler name "${name}" at indices ${handlersSeen.get(name)} and ${i}`,
      );
    }
    handlersSeen.set(name, i);
  }

  return {
    middleware: mergeDefaults(declared),
    handlers: mergeHandlerDefaults(declaredHandlers),
    statics: parsed.statics,
  };
}
