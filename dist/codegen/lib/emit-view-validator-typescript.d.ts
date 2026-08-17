import type { ParsedSettings } from "@deterministic-code/generator-sdk/read-settings";
export declare const DEFAULT_EMIT_OPTIONS: {
    schemaVersion: string;
    datasourceImportPath: string;
    withTypeAnnotation: boolean;
    createIndex: boolean;
};
export declare const createEmitter: () => {
    emit: (config: {
        settings: ParsedSettings;
    }) => unknown;
};
