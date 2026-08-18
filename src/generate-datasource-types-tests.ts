import {
  datasourceSettings,
  nativeFieldType,
  tableFields,
  type DatasourceSettings,
} from "./common/datasource-settings.ts";
import { fill } from "./common/fill.ts";
import type { GenerateContext, SettingsDict } from "./common/generate-context.ts";
import { content, type GenerateEntry } from "./common/generate-entry.ts";
import { typescriptNaming, type ArtifactNaming } from "./common/naming.ts";
import {
  DATASOURCE_TYPES_YAML,
  parseDatasourceTypes,
  type DatasourceField,
  type DatasourceType,
} from "./common/parse-datasource-types.ts";
import { settingsStr } from "./common/settings.ts";
import { typeTestTmpl } from "./resources/datasource-types-tests.ts";
import { FieldConverter, fieldConverter } from "./field-converter.ts";

type EmitOptions = {
  ds: DatasourceSettings;
  naming: ArtifactNaming;
  schemaVersion: string;
  converter: FieldConverter;
};

const emitOptions = (settings: SettingsDict): EmitOptions => {
  const ds = datasourceSettings(settings);
  return {
    ds,
    naming: typescriptNaming(settings),
    schemaVersion: settingsStr(settings, "codegen.schema_version") ?? "1.0",
    converter: new FieldConverter(fieldConverter, ds.datetimeRepr),
  };
};

const escapeTestName = (name: string): string =>
  name.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

const fieldTokens = (field: DatasourceField, opts: EmitOptions) => {
  const ident = opts.naming.fieldIdent(field.name);
  const { sample, next } = opts.converter.samples(
    field,
    nativeFieldType(opts.ds, field),
  );
  return {
    ident,
    access: ident.startsWith('"') ? `[${ident}]` : `.${ident}`,
    testName: escapeTestName(opts.naming.fieldName(field.name)),
    sampleExpr: sample,
    nextExpr: next,
    nullable: field.isNullable,
  };
};

const testPath = (entity: string, naming: ArtifactNaming): string => {
  const file = `${naming.fileBase(entity)}.test.ts`;
  if (!naming.byFeature) return file;
  const typeFile = naming.filePath(entity);
  return `${typeFile.slice(0, typeFile.lastIndexOf("/"))}/__tests__/${file}`;
};

const renderTests = (
  table: DatasourceType,
  opts: EmitOptions,
): GenerateEntry => {
  const fields = tableFields(table.fields, opts.ds).map((f) =>
    fieldTokens(f, opts),
  );
  return content(
    testPath(table.name, opts.naming),
    fill(typeTestTmpl, {
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
  const types = parseDatasourceTypes({
    yaml: await ctx.reader.read(DATASOURCE_TYPES_YAML),
    idType: opts.ds.idType,
  });
  return types.map((table) => renderTests(table, opts));
};
