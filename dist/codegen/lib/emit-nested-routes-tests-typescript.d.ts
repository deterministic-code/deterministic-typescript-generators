import { type NamesForOptions } from "@deterministic-code/generator-sdk/codegen/lib/ts-codegen-naming";
import { type DatasourceOptions } from "@deterministic-code/generator-sdk/codegen/lib/ts-datasource-settings";
import type { EmittedFile } from "@deterministic-code/generator-sdk/codegen/lib/routes-emit-types";
import type { NestedRouteDescriptor } from "./nested-routes-emit-types.ts";
interface NestedRouteTestOptions extends NamesForOptions, DatasourceOptions {
    libraryReferenceMode?: string;
}
export declare function emitNestedDirectFkRouterTest(descriptor: NestedRouteDescriptor, options?: NestedRouteTestOptions): EmittedFile;
export declare function emitNestedM2mRouterTest(descriptor: NestedRouteDescriptor, options?: NestedRouteTestOptions): EmittedFile;
export {};
