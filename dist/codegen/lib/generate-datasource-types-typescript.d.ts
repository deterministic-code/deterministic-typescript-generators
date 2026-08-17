import type { GeneratedFile } from "@deterministic-code/generator-sdk/codegen/lib/datasource-types-generate-types";
interface TsGenerateOptions {
    baseClass: string;
    language: string;
    schemaVersion: string;
    style: unknown;
    idType?: string;
    datetime?: string;
    withUuidColumn?: boolean;
    libraryReferenceMode?: string;
}
export declare const DEFAULT_GENERATE_OPTIONS: TsGenerateOptions;
export declare function resolveBaseClass({ idType, withUuidColumn, datetime, }: {
    idType?: string;
    withUuidColumn?: boolean;
    datetime?: string;
}): {
    baseClass: string;
    imports: string[];
    typeArgs: string[];
};
export declare const render: (config: import("@deterministic-code/generator-sdk/codegen/lib/datasource-types-generate-types").DatasourceTypesGenerateConfig) => GeneratedFile[], createGenerator: () => {
    generate: (config: import("@deterministic-code/generator-sdk/codegen/lib/datasource-types-generate-types").DatasourceTypesGenerateConfig) => GeneratedFile[];
}, generate: ({ inputs, settings }: import("@deterministic-code/generator-sdk/codegen/lib/generate-settings-options").DatasourceTypesGenerateInput) => Promise<{
    files: GeneratedFile[];
}>;
export {};
