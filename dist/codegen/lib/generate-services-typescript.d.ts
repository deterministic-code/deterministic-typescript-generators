import type { ParsedSettings } from "@deterministic-code/generator-sdk/read-settings";
import { type CommentStyle } from "@deterministic-code/generator-sdk/generate-doc-comment";
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
interface GeneratedFile {
    path: string;
    content: string;
}
interface ServicesGenerateConfig {
    services: unknown;
    viewTypes: unknown;
    datasourceTypes: unknown;
    routes: unknown;
    settings: ParsedSettings;
    language: unknown;
}
export declare const DEFAULT_GENERATE_OPTIONS: {
    createIndex: boolean;
    fileFormat: string;
    style: "none" | "simple" | "description";
};
export declare function generateGenericService(candidate: ServiceCandidate, options?: GenericServiceOptions): GeneratedFile;
export declare function resolveCustomGeneratePath(entry: CustomServiceEntry, names: CodegenNames, byFeature?: boolean): string;
export declare function generateCustomServiceStub(entry: CustomServiceEntry, options?: CustomStubOptions): GeneratedFile;
export declare function generateIndexFromSchema(genericEntities: string[], customEntries: CustomServiceEntry[], options?: IndexOptions): GeneratedFile[];
/** Catalog `services` step (typescript). */
export declare const generate: (ctx: unknown) => Promise<unknown>;
/** Generator owns its render primitives + options; the shared orchestration in services-generate.ts does the rest. */
export declare const createGenerator: () => {
    generate: (config: ServicesGenerateConfig) => import("@deterministic-code/generator-sdk/codegen/lib/service-tests-generate-types").GeneratedFile[];
};
export {};
