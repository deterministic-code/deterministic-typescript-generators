import type { ParsedSettings } from "@deterministic-code/generator-sdk/read-settings";
export declare const DEFAULT_GENERATE_OPTIONS: {
    schemaVersion: string;
    datasourceImportPath: string;
    withTypeAnnotation: boolean;
    createIndex: boolean;
};
export declare const createGenerator: () => {
    generate: (config: {
        settings: ParsedSettings;
    }) => unknown;
};
