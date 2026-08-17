import type { EmittedFile } from "@deterministic-code/generator-sdk/codegen/lib/datasource-types-emit-types";
interface TsEmitOptions {
    baseClass: string;
    language: string;
    schemaVersion: string;
    style: unknown;
    idType?: string;
    datetime?: string;
    withUuidColumn?: boolean;
    libraryReferenceMode?: string;
}
export declare const DEFAULT_EMIT_OPTIONS: TsEmitOptions;
export declare function resolveBaseClass({ idType, withUuidColumn, datetime, }: {
    idType?: string;
    withUuidColumn?: boolean;
    datetime?: string;
}): {
    baseClass: string;
    imports: string[];
    typeArgs: string[];
};
export declare const render: (config: import("@deterministic-code/generator-sdk/codegen/lib/datasource-types-emit-types").DatasourceTypesEmitConfig) => EmittedFile[], createEmitter: () => {
    emit: (config: import("@deterministic-code/generator-sdk/codegen/lib/datasource-types-emit-types").DatasourceTypesEmitConfig) => EmittedFile[];
}, emit: ({ inputs, settings }: import("@deterministic-code/generator-sdk/codegen/lib/emit-settings-options").DatasourceTypesEmitInput) => Promise<{
    files: EmittedFile[];
}>;
export {};
