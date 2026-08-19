import { fill } from "@deterministic-code/generators-common/fill";
import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import { content, type GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import { isFiniteInt } from "@deterministic-code/generators-common/yaml-entry";
import { datasourcePaths, type ArtifactPaths } from "./common/paths.ts";
import {
  SpecificationParser,
  DATASOURCE_TYPES_YAML,
  type DatasourceType,
} from "@deterministic-code/generators-common/specification-parser";
import { idTypeToZod, toZod, toZodDefault } from "./common/type-converters/native-to-zod.ts";
import { indexTmpl, typeTmpl } from "./resources/datasource-type-validators.ts";

type Datasource = {
  idType: string;
  withUuidColumn: boolean;
  useOptimisticConcurrency: boolean;
};

const datasource = (settings: Record<string, string>): Datasource => {
  const idType = settings["datasource.id_type"] ?? "integer";
  return {
    idType,
    withUuidColumn: idType !== "uuid",
    useOptimisticConcurrency:
      settings["datasource.use_optimistic_concurrency"] === "true",
  };
};

type EmitOptions = {
  ds: Datasource;
  naming: ArtifactPaths;
  schemaVersion: string;
  withTypeAnnotation: boolean;
  createIndex: boolean;
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

const STANDARD_COLUMNS: ReadonlyArray<FieldShape> = [
  { name: "id", type: "number", isNullable: false },
  { name: "uuid", type: "string", isNullable: false },
  { name: "created", type: "datetime", isNullable: false },
  { name: "updated", type: "datetime", isNullable: false },
];

const emitOptions = (settings: Record<string, string>): EmitOptions => {
  const ds = datasource(settings);
  const naming = datasourcePaths(settings);
  return {
    ds,
    naming,
    schemaVersion: settings["codegen.schema_version"] ?? "1.0",
    withTypeAnnotation: true,
    createIndex:
      settings["codegen.create_index"] !== "false" &&
      !naming.byFeature,
  };
};

const schemaName = (entity: string): string => `${entity}Schema`;

const validatorPath = (entity: string, naming: ArtifactPaths): string => {
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

const tightenExpr = (field: FieldShape): string => {
  const base = toZod(field.type);
  const isFk =
    typeof field.references === "string" && field.references.length > 0;
  const isIdLike = field.name === "id" || field.name.endsWith("_id");

  switch (field.type) {
    case "string":
    case "character":
      return tightenString(base, field);
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

const zodForField = (
  field: FieldShape,
  opts: EmitOptions,
  useZodId: boolean,
): string => {
  let expr =
    useZodId || field.references?.split(".")[1] === "id"
      ? idTypeToZod(opts.ds.idType)
      : tightenExpr(field);
  if (field.isNullable) expr = `${expr}.nullable()`;
  if (field.hasDefault) {
    expr = `${expr}.default(${toZodDefault(field.type, field.defaultValue)})`;
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
