import type { EmitArgs, SchemaProp } from "./frontend-emit-types.ts";
import type { CodegenNames } from "@deterministic-code/generator-sdk/codegen-naming";
import type { CodegenFieldNames } from "@deterministic-code/generator-sdk/field-names";
import type { CodegenLayout } from "@deterministic-code/generator-sdk/codegen-layout";
interface RenderOpts {
    names: CodegenNames;
    fields: CodegenFieldNames;
    datetime: string;
    emittedNames: Set<string>;
}
interface ReadTypeModel {
    components: Record<string, SchemaProp>;
    opts: RenderOpts;
    sorted: {
        name: string;
        className: string;
    }[];
    layout: CodegenLayout;
}
/** The read-type surface shared by every datasource: the entity/view components (write-body DTOs filtered out), sorted by class name, plus the rendering `opts` and the `CodegenLayout`. Built once from the OpenAPI oracle so per-datasource placement is the only thing that varies. Exposed for unit tests that assert the rendered bodies without touching disk. */
export declare function buildReadTypeModel({ inputs, settings, }: EmitArgs): Promise<ReadTypeModel>;
/** One file per read type plus a re-exporting `index.ts` barrel, under the shared `bindings/<datasource>/types/` dir in both layout modes. Pure — placement + specifiers flow through `layout`. */
export declare function datasourceTypeEntries(datasource: string, { components, opts, sorted, layout }: ReadTypeModel): {
    kind: string;
    filename: string;
    contents: string;
}[];
/** Emit the entity/view read types under `frontend/src/bindings/<datasource>/types/` — one file per type plus a barrel `index.ts` — for every datasource in `frontend_bindings.yaml`. The datasource is the type-sharing boundary, so each datasource folder is self-contained (a view type spanning entities still belongs to one datasource). No bindings → no frontend types, matching `client_bindings`/`frontend_validators`. Each type's flattened shape matches the OpenAPI `components/schemas` via `buildComponents` (the oracle), so frontend types can't drift from the backend contract; write-body DTOs (create/update/eager) are filtered out; casing flows through `CodegenNames`/`CodegenFieldNames`/`CodegenLayout` from settings. */
export declare function emit({ inputs, settings }: EmitArgs): Promise<{
    entries: {
        kind: string;
        filename: string;
        contents: string;
    }[];
}>;
export declare const entriesNative = true;
export declare const assembleAfterStep = true;
export {};
