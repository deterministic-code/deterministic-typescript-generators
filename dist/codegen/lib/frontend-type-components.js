import { parse } from "yaml";
import { parseDatasourceTypes } from "@deterministic-code/generator-sdk/codegen/lib/parse-datasource-types";
import { CodegenFieldNames } from "@deterministic-code/generator-sdk/field-names";
import { buildComponents } from "@deterministic-code/generator-sdk/lib/schema-build";
import { namesForSettings } from "@deterministic-code/generator-sdk/codegen/lib/ts-codegen-naming";
import { datetimeOptionFromSettings } from "@deterministic-code/generator-sdk/codegen/lib/generate-settings-options";
/** The shared setup frontend_types and its test generator both start from: parse the view + datasource YAML, build the OpenAPI component oracle, and resolve the settings-driven name/field casing + datetime representation. Returns `{ components, names, fields, datetime }` so both derive the read-type surface one way and can't drift. */
export async function buildFrontendComponents({ inputs, settings }) {
    const { viewYamlText, datasourceYamlText } = await inputs.all();
    const viewData = parse(viewYamlText);
    const datasourceData = datasourceYamlText
        ? parseDatasourceTypes(datasourceYamlText, settings)
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
