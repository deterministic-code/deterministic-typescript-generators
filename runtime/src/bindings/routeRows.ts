import { type JsonSchema, type SchemaComponents } from './schemaExample';

export type CrudKind = 'create' | 'list' | 'read' | 'update' | 'delete';

/**
 * The common route interface: the subset of an OpenAPI operation that is
 * bijective with a single expand-routes entry. Every field names a coordinate in
 * BOTH representations — operationId ⇄ route key (`name`), tag ⇄ `entity`,
 * `x-implementation` ⇄ `isCustom`, and the request/response body `$ref`s. Derived
 * values (crud, example payloads, grouping) are computed at render, never stored,
 * so a row carries only pointers; a shared component-schema map resolves them.
 */
export interface RouteRow {
  name?: string;
  method: string;
  path: string;
  entity: string | null;
  isCustom: boolean;
  request?: JsonSchema;
  response?: JsonSchema;
}

const CRUD_BY_METHOD: Record<string, CrudKind> = {
  post: 'create',
  put: 'update',
  patch: 'update',
  delete: 'delete',
};

const ITEM_PATH = /(\{[^/]+\}|:[^/]+)\/?$/;

/**
 * Derived from a row, never stored: classifies a verb + path into a CRUD kind,
 * or null when the call isn't plain CRUD. A GET whose path ends in a route
 * parameter — in either OpenAPI `{id}` or Express `:id` form — reads one row;
 * otherwise it lists a collection.
 */
export function crudFor(method: string, path: string): CrudKind | null {
  const verb = method.toLowerCase();
  if (verb === 'get') return ITEM_PATH.test(path.trim()) ? 'read' : 'list';
  return CRUD_BY_METHOD[verb] ?? null;
}

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];

interface MediaContent {
  content?: { 'application/json'?: { schema?: JsonSchema } };
}

interface OpenApiOperation {
  operationId?: string;
  tags?: string[];
  requestBody?: MediaContent;
  responses?: Record<string, MediaContent>;
  'x-implementation'?: unknown;
}

type OpenApiPathItem = Partial<Record<HttpMethod, OpenApiOperation>>;

export interface OpenApiDocument extends SchemaComponents {
  paths?: Record<string, OpenApiPathItem>;
}

function successSchema(operation: OpenApiOperation): JsonSchema | undefined {
  for (const [status, response] of Object.entries(operation.responses ?? {})) {
    if (!/^2\d\d$/.test(status)) continue;
    const schema = response.content?.['application/json']?.schema;
    if (schema) return schema;
  }
  return undefined;
}

/**
 * Projects an OpenAPI document onto {@link RouteRow}s — the lossy direction of
 * the OpenAPI ⊋ expand-routes relationship. OpenAPI's extras (parameters,
 * multi-status responses, security, summaries) fall outside the common interface
 * and are dropped; we display only what both formats share. Pure and I/O-free:
 * the caller resolves the binding's `schema:` location to a parsed document.
 */
export function openApiToRouteRows(document: OpenApiDocument): RouteRow[] {
  const paths = document?.paths;
  if (!paths || typeof paths !== 'object') {
    throw new Error('invariant: OpenAPI document has no `paths` to convert');
  }
  const rows: RouteRow[] = [];
  for (const [path, item] of Object.entries(paths)) {
    for (const method of HTTP_METHODS) {
      const operation = item?.[method];
      if (!operation) continue;
      const row: RouteRow = {
        method: method.toUpperCase(),
        path,
        entity: operation.tags?.[0] ?? null,
        isCustom: Boolean(operation['x-implementation']),
      };
      if (operation.operationId) row.name = operation.operationId;
      const request = operation.requestBody?.content?.['application/json']?.schema;
      if (request) row.request = request;
      const response = successSchema(operation);
      if (response) row.response = response;
      rows.push(row);
    }
  }
  return rows;
}
