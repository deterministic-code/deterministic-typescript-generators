import type { EmittedFile } from "@deterministic-code/generator-sdk/codegen/lib/routes-emit-types";
interface EmitTestAppOptions {
    datasourceData: unknown;
    routesData: unknown;
    viewTypesData: unknown;
    factoryName?: string;
    pluralizeTableNames?: boolean;
    datetime?: string;
    uuid?: string;
    idType?: string;
    libraryReferenceMode?: string;
    organizeByFeature?: boolean;
}
export declare function emitTestApp({ datasourceData, routesData, viewTypesData, factoryName, pluralizeTableNames, datetime, uuid, idType, libraryReferenceMode, organizeByFeature, }: EmitTestAppOptions): EmittedFile;
export {};
