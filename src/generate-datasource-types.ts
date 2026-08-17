import { resolve } from "node:path";
import {
  datasourceSettings,
  nativeFieldType,
  type DatasourceSettings,
} from "./common/datasource-settings.ts";
import { commentStyle, type CommentStyle } from "./common/doc-comment.ts";
import { fill } from "./common/fill.ts";
import type { GenerateContext, SettingsDict } from "./common/generate-context.ts";
import { content, type GenerateEntry } from "./common/generate-entry.ts";
import { typescriptNaming, type ArtifactNaming } from "./common/naming.ts";
import { pathExists } from "./common/path-exists.ts";
import {
  loadDatasourceTables,
  type DatasourceTable,
} from "./common/parse-datasource-types.ts";
import { settingsBool, settingsStr } from "./common/settings.ts";
import { indexTmpl, typeTmpl } from "./datasource-types/resources.ts";
import { libraryImportSpecifier } from "./library-import.ts";

export type { GenerateEntry };

type EmitOptions = {
  ds: DatasourceSettings;
  naming: ArtifactNaming;
  schemaVersion: string;
  style: CommentStyle;
  libraryMode: string | undefined;
  createIndex: boolean;
};

const emitOptions = (settings: SettingsDict): EmitOptions => {
  const ds = datasourceSettings(settings);
  const naming = typescriptNaming(settings);
  return {
    ds,
    naming,
    schemaVersion: settingsStr(settings, "codegen.schema_version") ?? "1.0",
    style: commentStyle(settingsStr(settings, "comments")),
    libraryMode: settingsStr(
      settings,
      "languages.typescript.library_reference_mode",
    ),
    createIndex:
      settingsBool(settings, "codegen.create_index") && !naming.byFeature,
  };
};

const renderTable = (
  table: DatasourceTable,
  opts: EmitOptions,
): GenerateEntry => {
  const { ds, naming, schemaVersion, style, libraryMode } = opts;
  const className = naming.className(table.name);
  const fields = ds.withUuidColumn
    ? table.fields
    : table.fields.filter((f) => f.name !== "uuid");
  return content(
    naming.filePath(table.name),
    fill(typeTmpl, {
      schemaVersion,
      libraryImport: libraryImportSpecifier(
        "types",
        libraryMode,
        naming.projectRelPath(table.name),
      ),
      withUuid: ds.withUuidColumn,
      simpleDoc: style === "simple",
      descriptionDoc: style === "description",
      className,
      datasourceType: table.datasourceType ?? "standard",
      fieldCount: String(fields.length),
      idType: ds.tsIdType,
      datetimeType: ds.datetimeType,
      fields: fields.map((f) => ({
        ident: naming.fieldIdent(f.name),
        tsType: nativeFieldType(ds, f),
        nullable: f.isNullable,
      })),
    }),
  );
};

const renderIndex = (
  tables: DatasourceTable[],
  naming: ArtifactNaming,
): GenerateEntry =>
  content(
    "index.ts",
    fill(indexTmpl, {
      tables: tables.map((t) => ({
        className: naming.className(t.name),
        fileBase: naming.fileBase(t.name),
      })),
    }),
  );

export const generate = async (
  ctx: GenerateContext,
): Promise<GenerateEntry[]> => {
  const input = ctx.inputs.dir;
  if (!input) {
    throw new Error("create-datasource-types (typescript): --input is required");
  }
  const inputDir = resolve(input);
  if (!(await pathExists(inputDir))) {
    throw new Error(
      `create-datasource-types (typescript): input directory does not exist: ${inputDir}`,
    );
  }
  const opts = emitOptions(ctx.settings);
  const tables = await loadDatasourceTables({
    inputDir,
    idType: opts.ds.idType,
  });
  const entries = tables.map((table) => renderTable(table, opts));
  if (opts.createIndex) entries.push(renderIndex(tables, opts.naming));
  return entries;
};

export const generateDatasourceTypes = async (args: {
  input: string;
  settings: GenerateContext["settings"];
}): Promise<GenerateEntry[]> =>
  generate({
    inputs: { dir: args.input },
    settings: args.settings,
  });
