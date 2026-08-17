import type { GeneratedFile, ServiceTestsGenerateConfig } from "@deterministic-code/generator-sdk/codegen/lib/service-tests-generate-types";
import type { IntegrationTestCandidate } from "@deterministic-code/generator-sdk/codegen/lib/service-integration-tests-generate-types";
import { type NamesForOptions } from "@deterministic-code/generator-sdk/codegen/lib/ts-codegen-naming";
interface TsGenerateOptions extends NamesForOptions {
    servicePath?: string;
    libraryReferenceMode?: string;
    datasource?: unknown;
    datetime?: string;
    pluralizeTableNames?: boolean;
    idType?: string;
    uuid?: string;
}
export declare const DEFAULT_GENERATE_OPTIONS: {
    readonly servicePath: "..";
    readonly fileFormat: "Camel";
    readonly datetime: "string";
};
export declare function generateGenericServiceIntegrationTest(candidate: IntegrationTestCandidate, opts?: TsGenerateOptions): GeneratedFile;
/** Catalog `service_integration_tests` step (typescript). */
export declare const generate: (ctx: unknown) => Promise<unknown>;
export declare const createGenerator: () => {
    generate: (config: ServiceTestsGenerateConfig) => GeneratedFile[];
};
export {};
