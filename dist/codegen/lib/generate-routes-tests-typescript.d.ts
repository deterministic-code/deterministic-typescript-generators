import type { CaseFormat } from "@deterministic-code/generator-sdk/case";
import { type NamesForOptions } from "@deterministic-code/generator-sdk/codegen/lib/ts-codegen-naming";
import type { GeneratedFile, RoutesGenerateConfig } from "@deterministic-code/generator-sdk/codegen/lib/routes-generate-types";
interface Enrichment {
    targetTable: string;
    fkColumn?: string;
    newField?: string;
}
interface ByFieldEntry {
    byField: string;
    methods?: string[];
    byFieldUnique?: boolean;
}
interface PrimaryKeyLike {
    column?: string;
    idType?: string;
}
interface TestCandidate {
    name: string;
    datasourceType?: string;
    optimisticConcurrency?: boolean;
    enrichments?: Enrichment[];
    byFields?: ByFieldEntry[];
    primaryKey?: PrimaryKeyLike;
}
interface TestGenerateOptions extends NamesForOptions {
    schemaVersion?: string;
    apiBase?: string;
    fileFormat?: CaseFormat;
    libraryReferenceMode?: string;
    useOptimisticConcurrency?: boolean;
}
export declare const DEFAULT_GENERATE_OPTIONS: TestGenerateOptions;
export declare function generateReadOnlyRouterTest(candidate: TestCandidate, opts?: TestGenerateOptions): GeneratedFile;
export declare function generateCrudRouterTest(candidate: TestCandidate, opts?: TestGenerateOptions): GeneratedFile;
export declare function generateCombinedRouteTests({ routesData, datasourceData, }: {
    routesData: unknown;
    datasourceData: unknown;
}, generateOptions: TestGenerateOptions): GeneratedFile[];
/** Catalog `routes_tests` step (typescript). */
export declare const generate: (ctx: unknown) => Promise<unknown>;
export declare const createGenerator: () => {
    generate: (config: RoutesGenerateConfig) => GeneratedFile[];
};
export {};
