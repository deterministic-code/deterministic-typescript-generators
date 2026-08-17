import type { ParsedSettings } from "@deterministic-code/generator-sdk/read-settings";
import type { CodegenNames } from "@deterministic-code/generator-sdk/codegen-naming";
import type { CodegenLayout } from "@deterministic-code/generator-sdk/codegen-layout";
type ResolvedSettings = ParsedSettings;
interface SchemaObject {
    $ref?: string;
    type?: string;
    format?: string;
    items?: SchemaObject;
    properties?: Record<string, SchemaObject>;
}
type Components = Record<string, SchemaObject>;
interface RouteRow {
    method: string;
    path: string;
    name?: string;
    request?: SchemaObject;
    response?: SchemaObject;
}
interface BaseCtx {
    names: CodegenNames;
    layout: CodegenLayout;
    importable: Set<string>;
    components: Components;
    validate: boolean;
    datetime: string;
}
interface ClientCtx extends BaseCtx {
    typesImport: string;
    validatorsImport: string;
}
interface GenerateInputs {
    all: () => Promise<{
        viewYamlText: string;
        datasourceYamlText: string | null;
    }>;
}
/** Render one client library file for a set of route rows: the library prelude (axios/tanstack imports), the `import type` header for every referenced frontend type, then one function/hook per operation. Pure — `ctx` carries `{ names, importable, components, typesImport, validatorsImport }` so request/response schemas resolve to imported read types (via the layout-resolved `typesImport` barrel specifier) or inlined structural types. */
export declare function renderClientFile(client: string, rows: RouteRow[], ctx: ClientCtx): string;
/** Generate typed client libraries for each datasource in frontend_bindings.yaml that declares a `clients` array. For `schema: self`, the datasource's OpenAPI doc is built in-process from this project's own routes/view/datasource (identical to the openapi_docs step), then projected to route rows grouped by object; each requested library (`fetch`/`axios`/`tanstack`) renders one file per object, placed by layout mode via `CodegenLayout.frontendClientFile` and importing the entity/view read types through the layout's resolved specifier. A `package.json` patch adds the npm dependency each selected client needs. `id:`/`url:`/`file:` schemas are not resolved yet and throw. */
export declare function generate({ inputs, settings, }: {
    inputs: GenerateInputs;
    settings: ResolvedSettings;
}): Promise<{
    entries: ({
        kind: string;
        filename: string;
        contents: string;
    } | {
        kind: string;
        filename: string;
        content: string;
    })[];
}>;
export declare const entriesNative = true;
export declare const assembleAfterStep = true;
export {};
