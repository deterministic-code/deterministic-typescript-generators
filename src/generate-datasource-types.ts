import { fill } from "@deterministic-code/generators-common/fill";
import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import { content, type GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import { createCasing, type PackCasing } from "./common/default-casing.ts";
import {
  DeterministicParser,
  type IDeterministic,
} from "@deterministic-code/generators-common/specification-parser";
import {
  DATASOURCE_TYPES_YAML,
  type DatasourceType,
} from "@deterministic-code/generators-common/specification";
import { toNative } from "./base-type-converter.ts";
import { indexTmpl, typeTmpl } from "./resources/datasource-types.ts";
import { libraryImportSpecifier } from "./library-import.ts";

const docTokens = (settings: Record<string, string>) => {
  const comments = settings["comments"];
  return {
    simpleDoc: comments !== "none" && comments !== "description",
    descriptionDoc: comments === "description",
  };
};

const PROJECT_ID_TYPES = new Set(["integer", "biginteger", "uuid", "string"]);

const projectIdType = (settings: Record<string, string>): string => {
  const raw = settings["datasource.id_type"] ?? "integer";
  return PROJECT_ID_TYPES.has(raw) ? raw : "integer";
};

type EmitOptions = {
  idType: string;
  casing: PackCasing;
  schemaVersion: string;
  simpleDoc: boolean;
  descriptionDoc: boolean;
  libraryMode: string | undefined;
  createIndex: boolean;
};

const projectRelPath = (casing: PackCasing, entity: string): string =>
  casing.byFeature
    ? casing.filePath(entity)
    : `types/generated/datasource/${casing.filePath(entity)}`;

const emitOptions = (settings: Record<string, string>): EmitOptions => {
  const casing = createCasing(settings);
  return {
    idType: projectIdType(settings),
    casing,
    schemaVersion: settings["codegen.schema_version"] ?? "1.0",
    ...docTokens(settings),
    libraryMode: settings["languages.typescript.library_reference_mode"],
    createIndex:
      settings["codegen.create_index"] === "true" && !casing.byFeature,
  };
};

const renderType = (
  dsType: DatasourceType,
  opts: EmitOptions,
): GenerateEntry => {
  const { idType, casing, schemaVersion, simpleDoc, descriptionDoc, libraryMode } =
    opts;
  const className = casing.convertTypes(dsType.name);
  const fields = dsType.fields;
  return content(
    casing.filePath(dsType.name),
    fill(typeTmpl, {
      schemaVersion,
      libraryImport: libraryImportSpecifier(
        "types",
        libraryMode,
        projectRelPath(casing, dsType.name),
      ),
      simpleDoc,
      descriptionDoc,
      className,
      datasourceType: dsType.datasourceType,
      fieldCount: String(fields.length),
      idType: toNative(idType),
      datetimeType: toNative("datetime"),
      fields: fields.map((f) => ({
        ident: casing.fieldIdent(f.name),
        tsType: toNative(f.type),
        nullable: f.isNullable,
      })),
    }),
  );
};

const renderIndex = (
  types: DatasourceType[],
  casing: PackCasing,
): GenerateEntry =>
  content(
    "index.ts",
    fill(indexTmpl, {
      types: types.map((t) => ({
        className: casing.convertTypes(t.name),
        fileBase: casing.fileBase(t.name),
      })),
    }),
  );

const generateFrom = (
  deterministic: IDeterministic,
  settings: Record<string, string>,
): GenerateEntry[] => {
  const opts = emitOptions(settings);
  const types = deterministic.expandedDatasourceTypes;
  const entries = types.map((dsType) => renderType(dsType, opts));
  if (opts.createIndex) entries.push(renderIndex(types, opts.casing));
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
