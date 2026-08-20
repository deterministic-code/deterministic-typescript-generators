import { toNative } from "./base-type-converter.ts";
import { fill } from "@deterministic-code/generators-common/fill";
import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import { content, type GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import { datasourcePaths, type ArtifactPaths } from "./common/paths.ts";
import {
  tableFields,
  SpecificationParser,
  DATASOURCE_TYPES_YAML,
  type DatasourceField,
  type DatasourceType,
} from "@deterministic-code/generators-common/specification-parser";
import { typeTestTmpl } from "./resources/datasource-types-tests.ts";
import {
  fakeTestData,
  fieldExpr,
  preludeSource,
} from "./common/fake-test-data.ts";

type EmitOptions = {
  idType: string;
  naming: ArtifactPaths;
  schemaVersion: string;
};

const emitOptions = (settings: Record<string, string>): EmitOptions => {
  return {
    idType: settings["datasource.id_type"] ?? "integer",
    naming: datasourcePaths(settings),
    schemaVersion: settings["codegen.schema_version"] ?? "1.0",
  };
};

const escapeTestName = (name: string): string =>
  name.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

const fieldTokens = (field: DatasourceField, opts: EmitOptions) => {
  const ident = opts.naming.fieldIdent(field.name);
  const expr = fieldExpr(fakeTestData, field.type, {
    nativeType: toNative(field.type),
    size: field.size,
  });
  return {
    ident,
    access: ident.startsWith('"') ? `[${ident}]` : `.${ident}`,
    testName: escapeTestName(opts.naming.fieldName(field.name)),
    sampleExpr: expr,
    nextExpr: expr,
    nullable: field.isNullable,
  };
};

const testPath = (entity: string, naming: ArtifactPaths): string => {
  const file = `${naming.fileBase(entity)}.test.ts`;
  if (!naming.byFeature) return file;
  const typeFile = naming.filePath(entity);
  return `${typeFile.slice(0, typeFile.lastIndexOf("/"))}/__tests__/${file}`;
};

const renderTests = (
  table: DatasourceType,
  opts: EmitOptions,
): GenerateEntry => {
  const fields = tableFields(table.fields, opts.idType).map((f) =>
    fieldTokens(f, opts),
  );
  return content(
    testPath(table.name, opts.naming),
    fill(typeTestTmpl, {
      prelude: preludeSource(fakeTestData),
      schemaVersion: opts.schemaVersion,
      className: opts.naming.className(table.name),
      tableName: table.name,
      typeImport: `../${opts.naming.fileBase(table.name)}`,
      fixture: `{ ${fields.map((f) => `${f.ident}: ${f.sampleExpr}`).join(", ")} }`,
      fields,
    }),
  );
};

export const generate = async (
  ctx: GenerateContext,
): Promise<GenerateEntry[]> => {
  const opts = emitOptions(ctx.settings);
  const types = new SpecificationParser().parseDatasourceTypes({
    yaml: await ctx.reader.read(DATASOURCE_TYPES_YAML),
    idType: opts.idType,
  });
  return types.map((table) => renderTests(table, opts));
};
