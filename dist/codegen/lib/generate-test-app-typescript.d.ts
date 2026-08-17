import type { GeneratedFile } from "@deterministic-code/generator-sdk/codegen/lib/routes-generate-types";
interface GenerateTestAppOptions {
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
export declare function generateTestApp({ datasourceData, routesData, viewTypesData, factoryName, pluralizeTableNames, datetime, uuid, idType, libraryReferenceMode, organizeByFeature, }: GenerateTestAppOptions): GeneratedFile;
export {};
