import type { ParsedSettings } from "@deterministic-code/generator-sdk/read-settings";
import { type CommentStyle } from "@deterministic-code/generator-sdk/emit-doc-comment";
import type { CaseFormat } from "@deterministic-code/generator-sdk/case";
import type { CodegenNames } from "@deterministic-code/generator-sdk/codegen-naming";
interface ByField {
    field: string;
    type: string;
}
interface ServiceCandidate {
    name: string;
    kind?: string;
    datasourceType?: string;
    byFields?: ByField[];
}
interface CustomServiceEntry {
    name: string;
    module?: string;
}
interface GenericServiceOptions {
    fileFormat?: CaseFormat;
    classFormat?: CaseFormat;
    fieldFormat?: CaseFormat;
    style?: CommentStyle;
    libraryReferenceMode?: string;
    organizeByFeature?: boolean;
    dirFormat?: CaseFormat;
    datetime?: string;
}
interface CustomStubOptions {
    fileFormat?: CaseFormat;
    style?: CommentStyle;
    methods?: string[];
    byFeature?: boolean;
    responseSamples?: Map<string, unknown>;
}
interface IndexOptions {
    fileFormat?: CaseFormat;
    classFormat?: CaseFormat;
    dirFormat?: CaseFormat;
}
interface EmittedFile {
    path: string;
    content: string;
}
interface ServicesEmitConfig {
    services: unknown;
    viewTypes: unknown;
    datasourceTypes: unknown;
    routes: unknown;
    settings: ParsedSettings;
    language: unknown;
}
export declare const DEFAULT_EMIT_OPTIONS: {
    createIndex: boolean;
    fileFormat: string;
    style: "none" | "simple" | "description";
};
export declare function emitGenericService(candidate: ServiceCandidate, options?: GenericServiceOptions): EmittedFile;
export declare function resolveCustomEmitPath(entry: CustomServiceEntry, names: CodegenNames, byFeature?: boolean): string;
export declare function emitCustomServiceStub(entry: CustomServiceEntry, options?: CustomStubOptions): EmittedFile;
export declare function emitIndexFromSchema(genericEntities: string[], customEntries: CustomServiceEntry[], options?: IndexOptions): EmittedFile[];
/** Catalog `services` step (typescript). */
export declare const emit: (ctx: unknown) => Promise<unknown>;
/** Emitter owns its render primitives + options; the shared orchestration in services-emit.ts does the rest. */
export declare const createEmitter: () => {
    emit: (config: ServicesEmitConfig) => import("@deterministic-code/generator-sdk/codegen/lib/service-tests-emit-types").EmittedFile[];
};
export {};
