import { parse } from "yaml";
import { datasourceSettings } from "./common/datasource-settings.ts";
import type { GenerateContext } from "./common/generate-context.ts";
import { DATASOURCE_TYPES_YAML } from "./common/parse-datasource-types.ts";
import { VIEW_TYPES_YAML } from "./common/parse-view-types.ts";
import { CodegenFieldNames } from "./openapi/field-names.ts";
import { parseDatasourceTypes } from "./openapi/codegen/lib/parse-datasource-types.ts";
import { namesForSettings } from "./openapi/codegen/lib/ts-codegen-naming.ts";
import type { RawTypesDoc } from "./openapi/deterministic-shapes.ts";
import { buildComponents } from "./openapi/lib/schema-build.ts";

export const buildFrontendComponents = async (ctx: GenerateContext) => {
  const viewYamlText = await ctx.reader.read(VIEW_TYPES_YAML);
  const datasourceYamlText = (await ctx.reader.exists(DATASOURCE_TYPES_YAML))
    ? await ctx.reader.read(DATASOURCE_TYPES_YAML)
    : "";
  const viewData: RawTypesDoc = parse(viewYamlText);
  const datasourceData: RawTypesDoc = datasourceYamlText
    ? (parseDatasourceTypes(datasourceYamlText, ctx.settings) as RawTypesDoc)
    : { types: [] };
  const names = namesForSettings(ctx.settings, "typescript");
  return {
    components: buildComponents(viewData, datasourceData),
    names,
    fields: new CodegenFieldNames({ fieldFormat: names.fieldFormat }),
    datetime: datasourceSettings(ctx.settings).datetimeRepr,
  };
};
