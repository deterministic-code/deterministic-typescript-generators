import type { GeneratedFile, ServiceTestsGenerateConfig } from "@deterministic-code/generator-sdk/codegen/lib/service-tests-generate-types";
import { type NamesForOptions } from "@deterministic-code/generator-sdk/codegen/lib/ts-codegen-naming";
interface PrimaryKeyInfo {
    column: string;
    idType: string;
}
interface ServiceTestCandidate {
    name: string;
    primaryKey: PrimaryKeyInfo;
}
interface TsTestGenerateOptions extends NamesForOptions {
    schemaVersion?: string;
    servicePath?: string;
    libraryReferenceMode?: string;
}
export declare const DEFAULT_GENERATE_OPTIONS: {
    readonly schemaVersion: "1.0";
    readonly servicePath: "..";
    readonly fileFormat: "Camel";
};
export declare function generateGenericServiceTest(candidate: ServiceTestCandidate, opts?: TsTestGenerateOptions): GeneratedFile;
/** Catalog `service_tests` step (typescript). */
export declare const generate: (ctx: unknown) => Promise<unknown>;
export declare const createGenerator: () => {
    generate: (config: ServiceTestsGenerateConfig) => GeneratedFile[];
};
export {};
