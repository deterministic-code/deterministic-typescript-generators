import { parse } from "yaml";
import { generate as generateOpenApi } from "@deterministic-code/generators-openapi/generate-openapi";
import type { IDeterministicReader } from "@deterministic-code/generators-common/deterministic-reader";
import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import { content, type GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import { frontendPaths } from "./common/paths.ts";

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];

interface SchemaObject {
  $ref?: string;
  type?: string;
  format?: string;
  items?: SchemaObject;
  properties?: Record<string, SchemaObject>;
  oneOf?: SchemaObject[];
}

interface MediaContainer {
  content?: Record<string, { schema?: SchemaObject } | undefined>;
}

interface Operation {
  operationId?: string;
  tags?: string[];
  responses?: Record<string, MediaContainer>;
  requestBody?: MediaContainer;
}

type PathItem = Partial<Record<HttpMethod, Operation>>;

interface OpenApiDoc {
  paths?: Record<string, PathItem>;
  components?: { schemas?: Record<string, SchemaObject> };
}

interface OperationRow {
  name?: string;
  method: string;
  path: string;
  entity: string;
  request?: SchemaObject;
  response?: SchemaObject;
}

interface BindingDatasource {
  name: string;
  schema: unknown;
  clients: string[];
}

interface BindingObject {
  ds: BindingDatasource;
  entity: string;
  entityRows: OperationRow[];
  components: Record<string, SchemaObject>;
}

type BindingContext = GenerateContext;

export function refName(ref: string): string {
  return ref.slice("#/components/schemas/".length);
}

function jsonSchemaOf(media?: MediaContainer): SchemaObject | undefined {
  return media?.content?.["application/json"]?.schema;
}

function successSchema(operation: Operation): SchemaObject | undefined {
  for (const [status, response] of Object.entries(operation.responses ?? {})) {
    if (/^2\d\d$/.test(status) && jsonSchemaOf(response)) {
      return jsonSchemaOf(response);
    }
  }
  return undefined;
}

/** The object/entity a route belongs to: the openapi doc's group tag (`toPathGroupTag`, e.g. `Contacts`) when present, else the path's own resource segment so grouping never depends on `groupByEntity` being on. Exported so the live client-binding generator derives an object's directory identically to the client generator. */
export function entityOf(operation: Operation, path: string): string {
  const tag = operation.tags?.[0];
  if (tag) return tag;
  const segments = path.split("/").filter((s) => s && !s.startsWith("{"));
  const head = segments[0] === "api" ? segments[1] : segments[0];
  return head ?? "api";
}

/** The focused projection of an in-process OpenAPI doc onto the per-operation fields the frontend generators need (verb, path, operationId, grouping entity, request/response body schema) — resolved once via resolveSelfDoc so client_bindings and frontend_validators group routes one way. */
function operationRows(doc: OpenApiDoc): OperationRow[] {
  const rows: OperationRow[] = [];
  for (const [path, item] of Object.entries(doc.paths ?? {})) {
    for (const method of HTTP_METHODS) {
      const operation = item?.[method];
      if (!operation) continue;
      rows.push({
        name: operation.operationId,
        method: method.toUpperCase(),
        path,
        entity: entityOf(operation, path),
        request: jsonSchemaOf(operation.requestBody),
        response: successSchema(operation),
      });
    }
  }
  return rows;
}

/** Every `#/components/schemas/*` name a schema node references directly (through properties, array items, one_of) — the immediate `$ref` edges, not their transitive closure (that's walked in `reachableComponents`). */
function collectRefs(
  node: SchemaObject | undefined,
  acc: Set<string>,
): Set<string> {
  if (!node || typeof node !== "object") return acc;
  if (node.$ref) {
    acc.add(refName(node.$ref));
    return acc;
  }
  if (Array.isArray(node.oneOf)) node.oneOf.forEach((m) => collectRefs(m, acc));
  if (node.items) collectRefs(node.items, acc);
  if (node.properties) {
    Object.values(node.properties).forEach((p) => collectRefs(p, acc));
  }
  return acc;
}

/** The transitive set of component schemas an object's routes touch: seed from every operation's request + response body, then follow `$ref` edges through the component graph. This is exactly the set the object's `validators.ts` declares and its client `.parse()`s — consumed by `validatorObjectEntries` so the validators generator and its test generator derive membership one way. */
function reachableComponents(
  rows: OperationRow[],
  components: Record<string, SchemaObject>,
): Set<string> {
  const stack: string[] = [];
  for (const row of rows) {
    collectRefs(row.request, new Set<string>()).forEach((r) => stack.push(r));
    collectRefs(row.response, new Set<string>()).forEach((r) => stack.push(r));
  }
  const closure = new Set<string>();
  while (stack.length > 0) {
    const name = stack.pop()!;
    if (closure.has(name) || !components[name]) continue;
    closure.add(name);
    collectRefs(components[name], new Set<string>()).forEach((ref) => {
      if (!closure.has(ref)) stack.push(ref);
    });
  }
  return closure;
}

/** Bucket route rows by their `entity` so an generator can render one file per object. Insertion order is preserved, so the generated file set is deterministic. */
export function groupRowsByEntity<T>(rows: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = (row as { entity?: string }).entity as string;
    const bucket = groups.get(key) ?? [];
    bucket.push(row);
    groups.set(key, bucket);
  }
  return groups;
}

const BINDINGS_YAML = "frontend_bindings.yaml";

/** Read `frontend_bindings.yaml`'s `datasources` array (empty when the file is absent — a bare scaffold generates nothing). */
export async function readBindings(
  reader: IDeterministicReader,
): Promise<{ datasources: unknown[] }> {
  if (!(await reader.exists(BINDINGS_YAML))) return { datasources: [] };
  const doc = parse(await reader.read(BINDINGS_YAML));
  return {
    datasources: Array.isArray(doc?.datasources) ? doc.datasources : [],
  };
}

/** One datasource binding entry unwrapped to `{ name, schema, clients }` (clients is the raw declared array; the caller filters to what it supports). */
export function bindingDatasource(entry: unknown): BindingDatasource {
  const record = entry as Record<
    string,
    { schema?: unknown; clients?: unknown }
  >;
  const [name] = Object.keys(record);
  const def = record[name] ?? {};
  return {
    name,
    schema: def.schema,
    clients: Array.isArray(def.clients) ? def.clients : [],
  };
}

/** The per-object work-list the frontend datasource generators share (via `clientBindingTestEntries` / `validatorObjectEntries`): for each binding datasource, resolve its OpenAPI doc once and yield `{ ds, entity, entityRows, components }` per object (route-group). */
async function bindingObjects({
  reader,
  settings,
}: BindingContext): Promise<BindingObject[]> {
  const { datasources } = await readBindings(reader);
  const objects: BindingObject[] = [];
  for (const entry of datasources) {
    const ds = bindingDatasource(entry);
    const { rows, components } = await resolveSelfDoc({
      schema: ds.schema,
      reader,
      settings,
    });
    for (const [entity, entityRows] of groupRowsByEntity(rows)) {
      objects.push({ ds, entity, entityRows, components });
    }
  }
  return objects;
}

type ValidatorRender = (
  closure: Set<string>,
  components: Record<string, SchemaObject>,
  ctx: { ds: string; entity: string },
) => string;

/** One CONTENT entry per binding object that has a non-empty reachable-component closure — the shape both `frontend_validators` (`validators.ts`) and its test generator (`validators.test.ts`) share. */
export async function validatorObjectEntries(
  ctx: BindingContext,
  { test = false }: { test?: boolean },
  render: ValidatorRender,
): Promise<GenerateEntry[]> {
  const naming = frontendPaths(ctx.settings);
  const entries: GenerateEntry[] = [];
  for (const { ds, entity, entityRows, components } of await bindingObjects(
    ctx,
  )) {
    const closure = reachableComponents(entityRows, components);
    if (closure.size === 0) continue;
    entries.push(
      content(
        naming.validatorFile(ds.name, entity, { test }),
        render(closure, components, { ds: ds.name, entity }),
      ),
    );
  }
  return entries;
}

interface ClientBindingTestArgs extends BindingContext {
  clientLibs: string[];
  entryFor: (object: BindingObject, clients: string[]) => GenerateEntry[];
  harness: () => GenerateEntry[];
}

/** The per-(object, client) test-generator loop shared by the mocked and live client-binding test generators: yield `entryFor(object, clients)` for every binding object whose declared clients intersect `clientLibs`, then append the one-shot `harness()` entries when anything was generated. */
export async function clientBindingTestEntries({
  reader,
  settings,
  clientLibs,
  entryFor,
  harness,
}: ClientBindingTestArgs): Promise<{ entries: GenerateEntry[] }> {
  const entries: GenerateEntry[] = [];
  for (const object of await bindingObjects({ reader, settings })) {
    const clients = object.ds.clients.filter((c) => clientLibs.includes(c));
    if (clients.length === 0) continue;
    entries.push(...entryFor(object, clients));
  }
  if (entries.length > 0) entries.push(...harness());
  return { entries };
}

/** The self-backend forms the frontend bindings resolve in-process: the legacy `self` sentinel and the 1.0.0 contract's `id:<this backend>` reference, both of which mean "generate this project's own OpenAPI doc on demand". `file:`/`https:` reference external documents and are not resolved yet. */
export function resolvesToSelf(schema: unknown): boolean {
  return schema === "self" || (typeof schema === "string" && schema.startsWith("id:"));
}

/** Build the project's own OpenAPI doc in-process and project it to `{ rows, components }`. Only `schema: self` and `id:` self-references resolve today; `file:`/`https:` throw. */
export async function resolveSelfDoc({
  schema,
  reader,
  settings,
}: BindingContext & { schema: unknown }): Promise<{
  doc: OpenApiDoc;
  rows: OperationRow[];
  components: Record<string, SchemaObject>;
}> {
  if (!resolvesToSelf(schema)) {
    throw new Error(
      `frontend bindings: schema "${schema}" not yet supported — only \`self\` or an \`id:\` reference to this project's own backend resolves today`,
    );
  }
  const entries = await generateOpenApi({ reader, settings });
  const jsonEntry = entries.find(
    (e) => e.kind === "content" && e.filename === "openapi.json",
  );
  if (jsonEntry === undefined || jsonEntry.kind !== "content") {
    throw new Error("openapi json lane did not emit openapi.json");
  }
  const doc = JSON.parse(jsonEntry.contents) as OpenApiDoc;
  return {
    doc,
    rows: operationRows(doc),
    components: doc.components?.schemas ?? {},
  };
}
