import { fill } from "@deterministic-code/generators-common/fill";
import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import { content, type GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import { isFiniteInt } from "@deterministic-code/generators-common/yaml-entry";
import { datasourcePaths, type ArtifactPaths } from "./common/paths.ts";
import {
  DeterministicParser,
  type IDeterministic,
} from "@deterministic-code/generators-common/specification-parser";
import {
  DATASOURCE_TYPES_YAML,
  type DatasourceType,
} from "@deterministic-code/generators-common/specification";
import { idTypeToZod, toZod, toZodDefault } from "./common/type-converters/native-to-zod.ts";
import { indexTmpl, typeTmpl } from "./resources/datasource-type-validators.ts";

type EmitOptions = {
  idType: string;
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

const emitOptions = (settings: Record<string, string>): EmitOptions => {
  const naming = datasourcePaths(settings);
  return {
    idType: settings["datasource.id_type"] ?? "integer",
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
      ? idTypeToZod(opts.idType)
      : tightenExpr(field);
  if (field.isNullable) expr = `${expr}.nullable()`;
  if (field.hasDefault) {
    expr = `${expr}.default(${toZodDefault(field.type, field.defaultValue)})`;
  }
  return expr;
};

const renderValidator = (
  table: DatasourceType,
  opts: EmitOptions,
): GenerateEntry => {
  const fields = table.fields.map((field) => ({
    ident: opts.naming.fieldIdent(field.name),
    zodExpr: zodForField(field, opts, field.name === "id"),
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

const generateFrom = (
  deterministic: IDeterministic,
  settings: Record<string, string>,
): GenerateEntry[] => {
  const opts = emitOptions(settings);
  const types = deterministic.expandedDatasourceTypes;
  const entries = types.map((table) => renderValidator(table, opts));
  if (opts.createIndex) entries.push(renderIndex(types, opts));
  return entries;
};

export const generate = async (
  ctx: GenerateContext,
): Promise<GenerateEntry[]> => {
  await ctx.reader.read(DATASOURCE_TYPES_YAML);
  return generateFrom(
    await DeterministicParser(ctx.reader).parse(ctx.settings),
    ctx.settings,
  );
};
