import { CodegenFieldNames } from "@deterministic-code/generator-sdk/field-names";
import type { GenerateArgs } from "./frontend-generate-types.ts";
/** The shared setup frontend_types and its test generator both start from: parse the view + datasource YAML, build the OpenAPI component oracle, and resolve the settings-driven name/field casing + datetime representation. Returns `{ components, names, fields, datetime }` so both derive the read-type surface one way and can't drift. */
export declare function buildFrontendComponents({ inputs, settings }: GenerateArgs): Promise<{
    components: Record<string, import("@deterministic-code/generator-sdk/lib/schema-build").OpenApiSchema>;
    names: import("@deterministic-code/generator-sdk/codegen-naming").CodegenNames;
    fields: CodegenFieldNames;
    datetime: string;
}>;
