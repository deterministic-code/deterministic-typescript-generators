import { type CommentStyle } from "@deterministic-code/generator-sdk/generate-doc-comment";
import type { CodegenNames } from "@deterministic-code/generator-sdk/codegen-naming";
import { type NamesForOptions } from "@deterministic-code/generator-sdk/codegen/lib/ts-codegen-naming";
import type { GeneratedFile, RoutesGenerateConfig } from "@deterministic-code/generator-sdk/codegen/lib/routes-generate-types";
interface RouteGenerateOptions extends NamesForOptions {
    style?: CommentStyle;
    libraryReferenceMode?: string;
    useOptimisticConcurrency?: boolean;
    customServiceEntities?: Set<string>;
    byFeature?: boolean;
}
interface Enrichment {
    targetTable: string;
    fkColumn?: string;
    prefix?: string;
}
interface ByFieldEntry {
    byField: string;
    methods?: string[];
    byFieldUnique?: boolean;
}
interface RouteCandidate {
    name: string;
    datasourceType?: string;
    optimisticConcurrency?: boolean;
    enrichments?: Enrichment[];
    byFields?: ByFieldEntry[];
}
type RouteEntry = Record<string, unknown>;
export declare function routeServiceImport(opts: RouteGenerateOptions, fromEntity: string, targetEntity: string): string;
export declare function routeValidatorImport(opts: RouteGenerateOptions, fromEntity: string, targetEntity: string): string;
export declare const DEFAULT_GENERATE_OPTIONS: {
    createIndex: boolean;
    fileFormat: string;
    style: "none" | "simple" | "description";
};
export declare function generateReadOnlyRouter(candidate: RouteCandidate, options?: RouteGenerateOptions): GeneratedFile;
export declare function generateCrudRouter(candidate: RouteCandidate, options?: RouteGenerateOptions): GeneratedFile;
export declare function resolveCustomRoutePath(entry: RouteEntry, names: CodegenNames, byFeature?: boolean): string;
export declare function generateCustomRouteStub(entry: RouteEntry, options?: RouteGenerateOptions & {
    byFeature?: boolean;
}): GeneratedFile;
export declare function generateIndexFromFiles(files: GeneratedFile[]): GeneratedFile[];
interface WiringRouter {
    name: string;
    readOnly?: boolean;
}
interface AppWiringInput {
    routers: WiringRouter[];
}
/** The generated app-wiring: `composeRouter(ctx)` mounts each generated router at its `/api/<plural>` path, forwarding to the composed service (`ctx.entityService`). The runtime's routeComposer hook calls this — the single live source of truth. Mirrors the Rust app_wiring. */
export declare function generateAppWiring(wiring: AppWiringInput, options?: RouteGenerateOptions): GeneratedFile;
/** Catalog `routes` step (typescript). */
export declare const generate: (ctx: unknown) => Promise<unknown>;
export declare const createGenerator: () => {
    generate: (config: RoutesGenerateConfig) => GeneratedFile[];
};
export {};
