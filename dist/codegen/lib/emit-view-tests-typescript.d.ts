import type { ParsedSettings } from "@deterministic-code/generator-sdk/read-settings";
import { type NamesForOptions } from "@deterministic-code/generator-sdk/codegen/lib/ts-codegen-naming";
import type { Datasource, View } from "@deterministic-code/generator-sdk/codegen/lib/emit-view-shared";
type Flatten<T> = {
    [K in keyof T]: T[K];
};
export type EmitOptions = Flatten<NamesForOptions & {
    schemaVersion: string;
    viewPath: string;
    schemaPath: string;
    datetime?: string;
    idType?: string;
}>;
interface EmittedFile {
    path: string;
    content: string;
}
export declare const DEFAULT_EMIT_OPTIONS: EmitOptions;
export declare function emitForView({ view, viewTypes, datasource, options, }: {
    view: View;
    viewTypes: unknown;
    datasource: Datasource;
    options?: Partial<EmitOptions>;
}): EmittedFile;
export declare function emitFromSchema({ viewTypes, datasource }: {
    viewTypes: unknown;
    datasource: Datasource;
}, options?: Partial<EmitOptions>): EmittedFile[];
export declare const createEmitter: () => {
    emit: (config: {
        settings: ParsedSettings;
        language: string;
    }) => any[];
};
export {};
