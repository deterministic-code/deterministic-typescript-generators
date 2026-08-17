import { type NamesForOptions } from "@deterministic-code/generator-sdk/codegen/lib/ts-codegen-naming";
type Flatten<T> = {
    [K in keyof T]: T[K];
};
export type EmitOptions = Flatten<NamesForOptions & {
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
export declare const DEFAULT_EMIT_OPTIONS: EmitOptions;
export declare function emitForTable(entry: Record<string, TsTableDef>, datasource: unknown, options?: Partial<EmitOptions>): {
    path: string;
    content: string;
};
export declare const emitFromSchema: (data: any, options: any) => any, createEmitter: () => {
    emit: (config: {
        settings: import("@deterministic-code/generator-sdk/read-settings").ParsedSettings;
        language: string;
    }) => any[];
};
export {};
