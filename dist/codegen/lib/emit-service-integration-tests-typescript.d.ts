import type { EmittedFile, ServiceTestsEmitConfig } from "@deterministic-code/generator-sdk/codegen/lib/service-tests-emit-types";
import type { IntegrationTestCandidate } from "@deterministic-code/generator-sdk/codegen/lib/service-integration-tests-emit-types";
import { type NamesForOptions } from "@deterministic-code/generator-sdk/codegen/lib/ts-codegen-naming";
interface TsEmitOptions extends NamesForOptions {
    servicePath?: string;
    libraryReferenceMode?: string;
    datasource?: unknown;
    datetime?: string;
    pluralizeTableNames?: boolean;
    idType?: string;
    uuid?: string;
}
export declare const DEFAULT_EMIT_OPTIONS: {
    readonly servicePath: "..";
    readonly fileFormat: "Camel";
    readonly datetime: "string";
};
export declare function emitGenericServiceIntegrationTest(candidate: IntegrationTestCandidate, opts?: TsEmitOptions): EmittedFile;
/** Catalog `service_integration_tests` step (typescript). */
export declare const emit: (ctx: unknown) => Promise<unknown>;
export declare const createEmitter: () => {
    emit: (config: ServiceTestsEmitConfig) => EmittedFile[];
};
export {};
