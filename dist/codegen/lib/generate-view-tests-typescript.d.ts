import type { ParsedSettings } from "@deterministic-code/generator-sdk/read-settings";
import { type NamesForOptions } from "@deterministic-code/generator-sdk/codegen/lib/ts-codegen-naming";
import type { Datasource, View } from "@deterministic-code/generator-sdk/codegen/lib/generate-view-shared";
type Flatten<T> = {
    [K in keyof T]: T[K];
};
export type GenerateOptions = Flatten<NamesForOptions & {
    schemaVersion: string;
    viewPath: string;
    schemaPath: string;
    datetime?: string;
    idType?: string;
}>;
interface GeneratedFile {
    path: string;
    content: string;
}
export declare const DEFAULT_GENERATE_OPTIONS: GenerateOptions;
export declare function generateForView({ view, viewTypes, datasource, options, }: {
    view: View;
    viewTypes: unknown;
    datasource: Datasource;
    options?: Partial<GenerateOptions>;
}): GeneratedFile;
export declare function generateFromSchema({ viewTypes, datasource }: {
    viewTypes: unknown;
    datasource: Datasource;
}, options?: Partial<GenerateOptions>): GeneratedFile[];
export declare const createGenerator: () => {
    generate: (config: {
        settings: ParsedSettings;
        language: string;
    }) => any[];
};
export {};
