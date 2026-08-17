import { type DatasourceValidatorEmitConfig } from "@deterministic-code/generator-sdk/codegen/lib/datasource-validator-emit-types";
interface TsEmitOptions {
    schemaVersion: string;
    withTypeAnnotation: boolean;
    createIndex?: boolean;
    datetime?: string;
    idType?: string;
}
export declare const DEFAULT_EMIT_OPTIONS: TsEmitOptions;
/** Emitter owns its options: apply this dialect's DEFAULT_EMIT_OPTIONS, then datasource overrides read from settings, then the dispatched config. */
export declare const createEmitter: () => {
    emit: (config: DatasourceValidatorEmitConfig) => any[];
};
export {};
