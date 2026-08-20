import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import {
  DATASOURCE_TYPES_YAML,
  SpecificationParser,
  tableFields,
  type DatasourceType,
  type ShapedView,
} from "@deterministic-code/generators-common/specification-parser";

export const referencesBackend = (settings: Record<string, string>): boolean =>
  settings.reference_backend_type === "true";

export const loadTables = async (
  ctx: GenerateContext,
  idType: string,
): Promise<Map<string, DatasourceType>> => {
  if (!(await ctx.reader.exists(DATASOURCE_TYPES_YAML))) return new Map();
  return new Map(
    new SpecificationParser()
      .parseDatasourceTypes({
        yaml: await ctx.reader.read(DATASOURCE_TYPES_YAML),
        idType,
      })
      .map((table) => [table.name, table] as const),
  );
};

export const inheritedColumns = (
  view: ShapedView,
  tables: Map<string, DatasourceType>,
  idType: string,
) => {
  if (view.inherits === null) return [];
  const table = tables.get(view.inherits);
  if (table === undefined) return [];
  const omit = new Set([
    ...view.omit,
    ...view.enrichments.map((e) => e.fkColumn),
  ]);
  return tableFields(table.fields, idType).filter((column) => !omit.has(column.name));
};
