import type { ParsedSettings } from "@deterministic-code/generator-sdk/read-settings";
import type { CodegenLayout } from "@deterministic-code/generator-sdk/codegen-layout";
import { type EmitEntry } from "@deterministic-code/generator-sdk/codegen/lib/emit-result";
declare const HTTP_METHODS: readonly ["get", "post", "put", "patch", "delete"];
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
    content?: Record<string, {
        schema?: SchemaObject;
    } | undefined>;
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
    components?: {
        schemas?: Record<string, SchemaObject>;
    };
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
interface BindingContext {
    inputs: unknown;
    settings: ParsedSettings;
}
export declare function refName(ref: string): string;
/** The object/entity a route belongs to: the openapi doc's group tag (`toPathGroupTag`, e.g. `Contacts`) when present, else the path's own resource segment so grouping never depends on `groupByEntity` being on. Exported so the live client-binding emitter derives an object's directory identically to the client emitter. */
export declare function entityOf(operation: Operation, path: string): string;
/** Bucket route rows by their `entity` so an emitter can render one file per object. Insertion order is preserved, so the emitted file set is deterministic. */
export declare function groupRowsByEntity<T>(rows: T[]): Map<string, T[]>;
/** Read `frontend_bindings.yaml`'s `datasources` array (empty when the file is absent — a bare scaffold emits nothing). */
export declare function readBindings(inputs: unknown): Promise<{
    datasources: unknown[];
}>;
/** One datasource binding entry unwrapped to `{ name, schema, clients }` (clients is the raw declared array; the caller filters to what it supports). */
export declare function bindingDatasource(entry: unknown): BindingDatasource;
type ValidatorRender = (closure: Set<string>, components: Record<string, SchemaObject>, ctx: {
    ds: string;
    entity: string;
    layout: CodegenLayout;
}) => string;
/** One CONTENT entry per binding object that has a non-empty reachable-component closure — the shape both `frontend_validators` (`validators.ts`) and its test emitter (`validators.test.ts`) share. `test` picks the validators file vs its test via `CodegenLayout.frontendValidatorFile`, so placement stays mode-aware. `render(closure, components, { ds, entity, layout })` produces the body; objects whose routes touch no component are skipped. */
export declare function validatorObjectEntries({ inputs, settings }: BindingContext, { test }: {
    test?: boolean;
}, render: ValidatorRender): Promise<EmitEntry[]>;
interface ClientBindingTestArgs extends BindingContext {
    clientLibs: string[];
    entryFor: (object: BindingObject, clients: string[], layout: CodegenLayout) => EmitEntry[];
    harness: () => EmitEntry[];
}
/** The per-(object, client) test-emitter loop shared by the mocked and live client-binding test emitters: yield `entryFor(object, clients, layout)` for every binding object whose declared clients intersect `clientLibs`, then append the one-shot `harness()` entries when anything was emitted. Keeps the two emitters' bodies to just their client set, per-entity renderer, and harness. */
export declare function clientBindingTestEntries({ inputs, settings, clientLibs, entryFor, harness, }: ClientBindingTestArgs): Promise<{
    entries: EmitEntry[];
}>;
/** Build the project's own OpenAPI doc in-process and project it to `{ rows, components }`. Only `schema: self` resolves today; `id:`/`url:`/`file:` throw. */
export declare function resolveSelfDoc({ schema, inputs, settings, }: BindingContext & {
    schema: unknown;
}): Promise<{
    doc: OpenApiDoc;
    rows: OperationRow[];
    components: Record<string, SchemaObject>;
}>;
export {};
