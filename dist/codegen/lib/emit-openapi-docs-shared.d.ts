import { type EmitEntry } from "@deterministic-code/generator-sdk/codegen/lib/emit-result";
import { datasourceSettingsForSettings } from "@deterministic-code/generator-sdk/codegen/lib/ts-datasource-settings";
type SettingsArg = Parameters<typeof datasourceSettingsForSettings>[0];
interface OpenApiOverrides {
    title?: string;
    version?: string;
    naming?: string;
    schemaNaming?: string;
    groupByEntity?: boolean;
}
interface BuildFromDataOptions {
    routesData: unknown;
    viewData: unknown;
    datasourceData: unknown;
    settings: SettingsArg;
    overrides?: OpenApiOverrides;
}
interface DeterministicInputs {
    all(): Promise<{
        routesYamlText: string;
        viewYamlText: string;
        datasourceYamlText: string;
        datasourceSeedsYamlText: string | null;
    }>;
    dir: string;
}
interface EmitOptions {
    inputs: DeterministicInputs;
    settings: SettingsArg;
}
/** The `create-openapi-docs` flag defaults — the openapi doc the pipeline actually emits (it passes none of these overrides). `groupByEntity` defaults true via the `!== false` check below. */
export declare const OPENAPI_DOC_DEFAULTS: Readonly<{
    title: "Deterministic Backend API";
    version: "0.0.0";
    naming: "original";
    schemaNaming: "Snake";
}>;
/** Build the enriched OpenAPI doc from already-parsed contract data. Shared by the `openapi` catalog emitter and the legacy `create-openapi-docs` CLI so the flag defaults and `settings`-derived knobs live in one place. `overrides` carries the CLI flag values (all optional; unset falls back to the default). */
export declare function buildOpenApiDocFromData({ routesData, viewData, datasourceData, settings, overrides, }: BuildFromDataOptions): import("@deterministic-code/generator-sdk/codegen/lib/openapi-spec-build").OpenApiDocumentOut;
/** Build the openapi doc from a `deterministic/` folder's raw YAMLs. Validation is the separate `validate` step's job — the catalog contract parses raw. */
export declare function buildOpenApiDocFromInputs({ inputs, settings, }: EmitOptions): Promise<import("@deterministic-code/generator-sdk/codegen/lib/openapi-spec-build").OpenApiDocumentOut>;
/** Shared `openapi` step (catalog sort_order 4): build the OpenAPI doc from the folder's routes + view + datasource YAMLs. Emitted as a bare `openapi.json` CONTENT entry — the runner points `--output` at the `openapi/` dir (nested under `backend/` in combined mode), so the entry writes there like the SQL family, not via a magic root-shared prefix. */
export declare function emit({ inputs, settings, }: EmitOptions): Promise<{
    entries: EmitEntry[];
}>;
export declare const entriesNative = true;
export {};
