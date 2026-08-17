import { parse } from "yaml";
import { parseDatasourceTypes } from "@deterministic-code/generator-sdk/codegen/lib/parse-datasource-types";
import { CodegenFieldNames } from "@deterministic-code/generator-sdk/field-names";
import { buildComponents } from "@deterministic-code/generator-sdk/lib/schema-build";
import { namesForSettings } from "@deterministic-code/generator-sdk/codegen/lib/ts-codegen-naming";
import { datetimeOptionFromSettings } from "@deterministic-code/generator-sdk/codegen/lib/generate-settings-options";
import type { RawTypesDoc } from "@deterministic-code/generator-sdk/deterministic-shapes";
import type { GenerateArgs } from "./frontend-generate-types.ts";

interface FrontendComponentsInputs {
  all(): Promise<{ viewYamlText: string; datasourceYamlText: string }>;
}

/** The shared setup frontend_types and its test generator both start from: parse the view + datasource YAML, build the OpenAPI component oracle, and resolve the settings-driven name/field casing + datetime representation. Returns `{ components, names, fields, datetime }` so both derive the read-type surface one way and can't drift. */
export async function buildFrontendComponents({ inputs, settings }: GenerateArgs) {
  const { viewYamlText, datasourceYamlText } = await (
    inputs as FrontendComponentsInputs
  ).all();
  const viewData: RawTypesDoc = parse(viewYamlText);
  const datasourceData: RawTypesDoc = datasourceYamlText
    ? (parseDatasourceTypes(datasourceYamlText, settings) as RawTypesDoc)
    : { types: [] };
  const components = buildComponents(viewData, datasourceData);
  const names = namesForSettings(settings, "typescript");
  const fields = new CodegenFieldNames({ fieldFormat: names.fieldFormat });
  return {
    components,
    names,
    fields,
    datetime: datetimeOptionFromSettings(settings).datetime,
  };
}
