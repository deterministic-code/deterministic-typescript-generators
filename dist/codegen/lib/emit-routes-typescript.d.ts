import { type CommentStyle } from "@deterministic-code/generator-sdk/emit-doc-comment";
import type { CodegenNames } from "@deterministic-code/generator-sdk/codegen-naming";
import { type NamesForOptions } from "@deterministic-code/generator-sdk/codegen/lib/ts-codegen-naming";
import type { EmittedFile, RoutesEmitConfig } from "@deterministic-code/generator-sdk/codegen/lib/routes-emit-types";
interface RouteEmitOptions extends NamesForOptions {
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
export declare function routeServiceImport(opts: RouteEmitOptions, fromEntity: string, targetEntity: string): string;
export declare function routeValidatorImport(opts: RouteEmitOptions, fromEntity: string, targetEntity: string): string;
export declare const DEFAULT_EMIT_OPTIONS: {
    createIndex: boolean;
    fileFormat: string;
    style: "none" | "simple" | "description";
};
export declare function emitReadOnlyRouter(candidate: RouteCandidate, options?: RouteEmitOptions): EmittedFile;
export declare function emitCrudRouter(candidate: RouteCandidate, options?: RouteEmitOptions): EmittedFile;
export declare function resolveCustomRoutePath(entry: RouteEntry, names: CodegenNames, byFeature?: boolean): string;
export declare function emitCustomRouteStub(entry: RouteEntry, options?: RouteEmitOptions & {
    byFeature?: boolean;
}): EmittedFile;
export declare function emitIndexFromFiles(files: EmittedFile[]): EmittedFile[];
interface WiringRouter {
    name: string;
    readOnly?: boolean;
}
interface AppWiringInput {
    routers: WiringRouter[];
}
/** The generated app-wiring: `composeRouter(ctx)` mounts each generated router at its `/api/<plural>` path, forwarding to the composed service (`ctx.entityService`). The runtime's routeComposer hook calls this — the single live source of truth. Mirrors the Rust app_wiring. */
export declare function emitAppWiring(wiring: AppWiringInput, options?: RouteEmitOptions): EmittedFile;
/** Catalog `routes` step (typescript). */
export declare const emit: (ctx: unknown) => Promise<unknown>;
export declare const createEmitter: () => {
    emit: (config: RoutesEmitConfig) => EmittedFile[];
};
export {};
