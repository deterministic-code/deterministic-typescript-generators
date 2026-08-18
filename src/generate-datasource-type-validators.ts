import { camelCase } from "change-case";
import {
  datasourceSettings,
  referenceIsUuid,
  type DatasourceSettings,
} from "./common/datasource-settings.ts";
import { fill } from "./common/fill.ts";
import type { GenerateContext, SettingsDict } from "./common/generate-context.ts";
import { content, type GenerateEntry } from "./common/generate-entry.ts";
import { isFiniteInt } from "./common/yaml-entry.ts";
import { typescriptNaming, type ArtifactNaming } from "./common/naming.ts";
import {
  SpecificationParser,
  DATASOURCE_TYPES_YAML,
  type DatasourceType,
} from "./common/specification-parser.ts";
import { settingsStr } from "./common/settings.ts";
import { toZod } from "./common/type-converter.ts";
import { indexTmpl, typeTmpl } from "./resources/datasource-type-validators.ts";
import { FieldConverter, fieldConverter } from "./field-converter.ts";

type EmitOptions = {
  ds: DatasourceSettings;
  naming: ArtifactNaming;
  schemaVersion: string;
  datetimeRepr: string;
  withTypeAnnotation: boolean;
  createIndex: boolean;
  converter: FieldConverter;
};

type FieldShape = {
  name: string;
  type: string;
  isNullable: boolean;
  references?: string;
  minSize?: number;
  size?: number;
  hasDefault?: boolean;
  defaultValue?: string | number | boolean | null;
};

const GENERATIVE_DEFAULTS = new Set(["Now", "UtcNow", "NewId"]);

const STANDARD_COLUMNS: ReadonlyArray<FieldShape> = [
  { name: "id", type: "number", isNullable: false },
  { name: "uuid", type: "string", isNullable: false },
  { name: "created", type: "datetime", isNullable: false },
  { name: "updated", type: "datetime", isNullable: false },
];

const emitOptions = (settings: SettingsDict): EmitOptions => {
  const ds = datasourceSettings(settings);
  const naming = typescriptNaming(settings);
  return {
    ds,
    naming,
    schemaVersion: settingsStr(settings, "codegen.schema_version") ?? "1.0",
    datetimeRepr: ds.datetimeRepr,
    withTypeAnnotation: true,
    createIndex:
      settingsStr(settings, "codegen.create_index") !== "false" &&
      !naming.byFeature,
    converter: new FieldConverter(fieldConverter, ds.datetimeRepr),
  };
};

const schemaName = (entity: string): string => `${camelCase(entity)}Schema`;

const validatorPath = (entity: string, naming: ArtifactNaming): string => {
  if (!naming.byFeature) return `${naming.fileBase(entity)}.ts`;
  return naming.filePath(entity).replace(/\.ts$/, ".validator.ts");
};

const tightenString = (base: string, field: FieldShape): string => {
  let expr = `${base}.trim()`;
  if (isFiniteInt(field.minSize) && field.minSize! >= 0) {
    expr = `${expr}.min(${field.minSize})`;
  }
  if (isFiniteInt(field.size) && field.size! >= 0) {
    expr = `${expr}.max(${field.size})`;
  }
  return expr;
};

const tightenInteger = (
  base: string,
  field: FieldShape,
  { isFk, isIdLike }: { isFk: boolean; isIdLike: boolean },
): string => {
  let expr = `${base}.int()`;
  if (isFk || isIdLike) expr = `${expr}.nonnegative()`;
  if (isFiniteInt(field.minSize)) expr = `${expr}.min(${field.minSize})`;
  if (isFiniteInt(field.size)) expr = `${expr}.max(${field.size})`;
  return expr;
};

const tightenExpr = (
  field: FieldShape,
  datetimeRepr: string,
): string => {
  const base = toZod(field.type, datetimeRepr);
  const isFk =
    typeof field.references === "string" && field.references.length > 0;
  const isIdLike = field.name === "id" || field.name.endsWith("_id");

  switch (field.type) {
    case "string":
    case "character":
      return tightenString(base, field);
    case "datetime":
      return datetimeRepr === "native" ? base : `${base}.trim()`;
    case "number":
    case "integer":
    case "biginteger":
    case "smallinteger":
    case "reference":
      return tightenInteger(base, field, { isFk, isIdLike });
    case "float":
      return isFiniteInt(field.minSize)
        ? `${base}.min(${field.minSize})`
        : base;
    default:
      return base;
  }
};

const zodDefaultArg = (
  field: FieldShape,
  converter: FieldConverter,
): string => {
  const value = field.defaultValue;
  if (value === null) return "null";
  if (typeof value === "object") return JSON.stringify(value);
  const literal = converter.defaultLiteral(
    field.type,
    value as string | boolean | number | null,
  );
  if (literal === null) return "null";
  return GENERATIVE_DEFAULTS.has(String(value)) ? `() => ${literal}` : literal;
};

const zodForField = (
  field: FieldShape,
  opts: EmitOptions,
  useZodId: boolean,
): string => {
  let expr =
    useZodId || referenceIsUuid(opts.ds, field.references)
      ? opts.ds.zodIdType
      : tightenExpr(field, opts.datetimeRepr);
  if (field.isNullable) expr = `${expr}.nullable()`;
  if (field.hasDefault) {
    expr = `${expr}.default(${zodDefaultArg(field, opts.converter)})`;
  }
  return expr;
};

const tableFields = (
  table: DatasourceType,
  opts: EmitOptions,
): Array<{ field: FieldShape; useZodId: boolean }> => {
  const userNames = new Set(
    table.fields.map((f) => opts.naming.fieldName(f.name)),
  );
  const standard = STANDARD_COLUMNS.filter(
    (col) =>
      (opts.ds.withUuidColumn || col.name !== "uuid") &&
      !userNames.has(opts.naming.fieldName(col.name)),
  ).map((field) => ({ field, useZodId: field.name === "id" }));
  return [
    ...standard,
    ...table.fields.map((field) => ({ field, useZodId: false })),
  ];
};

const renderValidator = (
  table: DatasourceType,
  opts: EmitOptions,
): GenerateEntry => {
  const fields = tableFields(table, opts).map(({ field, useZodId }) => ({
    ident: opts.naming.fieldIdent(field.name),
    zodExpr: zodForField(field, opts, useZodId),
  }));
  return content(
    validatorPath(table.name, opts.naming),
    fill(typeTmpl, {
      schemaVersion: opts.schemaVersion,
      schemaName: schemaName(table.name),
      className: opts.naming.className(table.name),
      withTypeAnnotation: opts.withTypeAnnotation,
      fields,
    }),
  );
};

const renderIndex = (
  types: DatasourceType[],
  opts: EmitOptions,
): GenerateEntry =>
  content(
    "index.ts",
    fill(indexTmpl, {
      withTypeAnnotation: opts.withTypeAnnotation,
      types: types.map((t) => ({
        schemaName: schemaName(t.name),
        className: opts.naming.className(t.name),
        fileBase: opts.naming.fileBase(t.name),
      })),
    }),
  );

export const generate = async (
  ctx: GenerateContext,
): Promise<GenerateEntry[]> => {
  const opts = emitOptions(ctx.settings);
  const types = new SpecificationParser().parseDatasourceTypes({
    yaml: await ctx.reader.read(DATASOURCE_TYPES_YAML),
    idType: opts.ds.idType,
  });
  const entries = types.map((table) => renderValidator(table, opts));
  if (opts.createIndex) entries.push(renderIndex(types, opts));
  return entries;
};
