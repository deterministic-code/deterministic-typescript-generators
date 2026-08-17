import { type NamesForOptions } from "@deterministic-code/generator-sdk/codegen/lib/ts-codegen-naming";
type Flatten<T> = {
    [K in keyof T]: T[K];
};
export type GenerateOptions = Flatten<NamesForOptions & {
    schemaVersion: string;
    validatorPath: string;
    typePath: string;
    datetime?: string;
    idType?: string;
}>;
interface TsFieldDef {
    is_nullable?: boolean;
}
interface TsTableDef {
    fields?: Array<Record<string, TsFieldDef>>;
}
export declare const DEFAULT_GENERATE_OPTIONS: GenerateOptions;
export declare function generateForTable(entry: Record<string, TsTableDef>, datasource: unknown, options?: Partial<GenerateOptions>): {
    path: string;
    content: string;
};
export declare const generateFromSchema: (data: any, options: any) => any, createGenerator: () => {
    generate: (config: {
        settings: import("@deterministic-code/generator-sdk/read-settings").ParsedSettings;
        language: string;
    }) => any[];
};
export {};
