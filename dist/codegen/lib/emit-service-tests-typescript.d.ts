import type { EmittedFile, ServiceTestsEmitConfig } from "@deterministic-code/generator-sdk/codegen/lib/service-tests-emit-types";
import { type NamesForOptions } from "@deterministic-code/generator-sdk/codegen/lib/ts-codegen-naming";
interface PrimaryKeyInfo {
    column: string;
    idType: string;
}
interface ServiceTestCandidate {
    name: string;
    primaryKey: PrimaryKeyInfo;
}
interface TsTestEmitOptions extends NamesForOptions {
    schemaVersion?: string;
    servicePath?: string;
    libraryReferenceMode?: string;
}
export declare const DEFAULT_EMIT_OPTIONS: {
    readonly schemaVersion: "1.0";
    readonly servicePath: "..";
    readonly fileFormat: "Camel";
};
export declare function emitGenericServiceTest(candidate: ServiceTestCandidate, opts?: TsTestEmitOptions): EmittedFile;
/** Catalog `service_tests` step (typescript). */
export declare const emit: (ctx: unknown) => Promise<unknown>;
export declare const createEmitter: () => {
    emit: (config: ServiceTestsEmitConfig) => EmittedFile[];
};
export {};
