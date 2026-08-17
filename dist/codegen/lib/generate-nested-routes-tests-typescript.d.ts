import { type NamesForOptions } from "@deterministic-code/generator-sdk/codegen/lib/ts-codegen-naming";
import { type DatasourceOptions } from "@deterministic-code/generator-sdk/codegen/lib/ts-datasource-settings";
import type { GeneratedFile } from "@deterministic-code/generator-sdk/codegen/lib/routes-generate-types";
import type { NestedRouteDescriptor } from "./nested-routes-generate-types.ts";
interface NestedRouteTestOptions extends NamesForOptions, DatasourceOptions {
    libraryReferenceMode?: string;
}
export declare function generateNestedDirectFkRouterTest(descriptor: NestedRouteDescriptor, options?: NestedRouteTestOptions): GeneratedFile;
export declare function generateNestedM2mRouterTest(descriptor: NestedRouteDescriptor, options?: NestedRouteTestOptions): GeneratedFile;
export {};
