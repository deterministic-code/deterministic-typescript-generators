import type { GeneratedFile, RoutesGenerateConfig } from "@deterministic-code/generator-sdk/codegen/lib/routes-generate-types";
import type { DatasourceSettings } from "@deterministic-code/generator-sdk/datasource-settings";
interface FieldDef {
    type?: string;
    is_nullable?: boolean;
    is_unique?: boolean;
    default_value?: unknown;
    references?: string;
    primary_key?: boolean;
}
interface SeedData {
    name?: string;
}
interface TypeDef {
    datasource_type?: string;
    fields?: Record<string, FieldDef>[];
    seeds?: Record<string, SeedData>[];
}
interface DatasourceData {
    types?: Record<string, TypeDef>[];
}
interface ChildOpts {
    via?: unknown;
    target?: unknown;
}
interface CombinedParentDef {
    combined_types?: (string | Record<string, ChildOpts>)[];
}
interface RoutesData {
    combined_routes?: Record<string, CombinedParentDef>[];
    routes?: unknown[];
}
interface AppE2ETestInput {
    datasourceData: DatasourceData;
    routesData: RoutesData;
    libraryReferenceMode?: string;
    datasourceSettings?: DatasourceSettings;
}
export declare function generateAppE2ETest({ datasourceData, routesData, libraryReferenceMode, datasourceSettings, }: AppE2ETestInput): GeneratedFile;
/** Catalog `routes_e2e_test` step (typescript). */
export declare const generate: (ctx: unknown) => Promise<unknown>;
export declare const createGenerator: () => {
    generate: (config: RoutesGenerateConfig & {
        expanded: unknown;
    }) => GeneratedFile[];
};
export {};
