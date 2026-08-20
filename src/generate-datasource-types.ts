import { fill } from "@deterministic-code/generators-common/fill";
import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import { content, type GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import { datasourcePaths, type ArtifactPaths } from "./common/paths.ts";
import {
  declaredFields,
  SpecificationParser,
  DATASOURCE_TYPES_YAML,
  type DatasourceType,
} from "@deterministic-code/generators-common/specification-parser";
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
  naming: ArtifactPaths;
  schemaVersion: string;
  simpleDoc: boolean;
  descriptionDoc: boolean;
  libraryMode: string | undefined;
  createIndex: boolean;
};

const emitOptions = (settings: Record<string, string>): EmitOptions => {
  const naming = datasourcePaths(settings);
  return {
    idType: projectIdType(settings),
    naming,
    schemaVersion: settings["codegen.schema_version"] ?? "1.0",
    ...docTokens(settings),
    libraryMode: settings["languages.typescript.library_reference_mode"],
    createIndex:
      settings["codegen.create_index"] === "true" && !naming.byFeature,
  };
};

const renderType = (
  dsType: DatasourceType,
  opts: EmitOptions,
): GenerateEntry => {
  const { idType, naming, schemaVersion, simpleDoc, descriptionDoc, libraryMode } =
    opts;
  const className = naming.className(dsType.name);
  const fields = declaredFields(dsType.fields, idType);
  return content(
    naming.filePath(dsType.name),
    fill(typeTmpl, {
      schemaVersion,
      libraryImport: libraryImportSpecifier(
        "types",
        libraryMode,
        naming.projectRelPath(dsType.name),
      ),
      simpleDoc,
      descriptionDoc,
      className,
      datasourceType: dsType.datasourceType,
      fieldCount: String(fields.length),
      idType: toNative(idType),
      datetimeType: toNative("datetime"),
      fields: fields.map((f) => ({
        ident: naming.fieldIdent(f.name),
        tsType: toNative(f.type),
        nullable: f.isNullable,
      })),
    }),
  );
};

const renderIndex = (
  types: DatasourceType[],
  naming: ArtifactPaths,
): GenerateEntry =>
  content(
    "index.ts",
    fill(indexTmpl, {
      types: types.map((t) => ({
        className: naming.className(t.name),
        fileBase: naming.fileBase(t.name),
      })),
    }),
  );

export const generate = async (
  ctx: GenerateContext,
): Promise<GenerateEntry[]> => {
  const opts = emitOptions(ctx.settings);
  const types = new SpecificationParser().parseDatasourceTypes({
    yaml: await ctx.reader.read(DATASOURCE_TYPES_YAML),
    idType: opts.idType,
  });
  const entries = types.map((dsType) => renderType(dsType, opts));
  if (opts.createIndex) entries.push(renderIndex(types, opts.naming));
  return entries;
};
