import { type DatasourceValidatorGenerateConfig } from "@deterministic-code/generator-sdk/codegen/lib/datasource-validator-generate-types";
interface TsGenerateOptions {
    schemaVersion: string;
    withTypeAnnotation: boolean;
    createIndex?: boolean;
    datetime?: string;
    idType?: string;
}
export declare const DEFAULT_GENERATE_OPTIONS: TsGenerateOptions;
/** Generator owns its options: apply this dialect's DEFAULT_GENERATE_OPTIONS, then datasource overrides read from settings, then the dispatched config. */
export declare const createGenerator: () => {
    generate: (config: DatasourceValidatorGenerateConfig) => any[];
};
export {};
