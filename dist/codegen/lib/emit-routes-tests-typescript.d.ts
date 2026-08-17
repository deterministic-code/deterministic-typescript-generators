import type { CaseFormat } from "@deterministic-code/generator-sdk/case";
import { type NamesForOptions } from "@deterministic-code/generator-sdk/codegen/lib/ts-codegen-naming";
import type { EmittedFile, RoutesEmitConfig } from "@deterministic-code/generator-sdk/codegen/lib/routes-emit-types";
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
interface TestEmitOptions extends NamesForOptions {
    schemaVersion?: string;
    apiBase?: string;
    fileFormat?: CaseFormat;
    libraryReferenceMode?: string;
    useOptimisticConcurrency?: boolean;
}
export declare const DEFAULT_EMIT_OPTIONS: TestEmitOptions;
export declare function emitReadOnlyRouterTest(candidate: TestCandidate, opts?: TestEmitOptions): EmittedFile;
export declare function emitCrudRouterTest(candidate: TestCandidate, opts?: TestEmitOptions): EmittedFile;
export declare function emitCombinedRouteTests({ routesData, datasourceData, }: {
    routesData: unknown;
    datasourceData: unknown;
}, emitOptions: TestEmitOptions): EmittedFile[];
/** Catalog `routes_tests` step (typescript). */
export declare const emit: (ctx: unknown) => Promise<unknown>;
export declare const createEmitter: () => {
    emit: (config: RoutesEmitConfig) => EmittedFile[];
};
export {};
