import type { CaseFormat } from "@deterministic-code/generator-sdk/case";
import { type CommentStyle } from "@deterministic-code/generator-sdk/generate-doc-comment";
import { type NamesForOptions } from "@deterministic-code/generator-sdk/codegen/lib/ts-codegen-naming";
import type { GeneratedFile } from "@deterministic-code/generator-sdk/codegen/lib/routes-generate-types";
import type { NestedRouteDescriptor } from "./nested-routes-generate-types.ts";
interface NestedRouteOptions extends NamesForOptions {
    libraryReferenceMode?: string;
    style?: CommentStyle;
    datasourceData?: unknown;
    datasourceSettings?: unknown;
}
export declare function nestedRouteEntity(descriptor: NestedRouteDescriptor): string;
export declare function descriptorFileFormat(options: NestedRouteOptions): CaseFormat;
export declare function nestedMountPath(descriptor: NestedRouteDescriptor): string;
export declare function nestedRouterFileBase(descriptor: NestedRouteDescriptor, fileFormat?: CaseFormat): string;
export declare function nestedRouterFnName(descriptor: NestedRouteDescriptor): string;
export declare function generateNestedDirectFkRouter(descriptor: NestedRouteDescriptor, options?: NestedRouteOptions): GeneratedFile;
export declare function generateNestedM2mRouter(descriptor: NestedRouteDescriptor, options?: NestedRouteOptions): GeneratedFile;
export {};
