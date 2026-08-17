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
import {
  loadDatasourceTypes,
  type DatasourceType,
} from "./common/parse-datasource-types.ts";
import { settingsBool, settingsStr } from "./common/settings.ts";
import { indexTmpl, typeTmpl } from "./datasource-types/resources.ts";
import { libraryImportSpecifier } from "./library-import.ts";

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

const renderType = (
  dsType: DatasourceType,
  opts: EmitOptions,
): GenerateEntry => {
  const { ds, naming, schemaVersion, style, libraryMode } = opts;
  const className = naming.className(dsType.name);
  const fields = ds.withUuidColumn
    ? dsType.fields
    : dsType.fields.filter((f) => f.name !== "uuid");
  return content(
    naming.filePath(dsType.name),
    fill(typeTmpl, {
      schemaVersion,
      libraryImport: libraryImportSpecifier(
        "types",
        libraryMode,
        naming.projectRelPath(dsType.name),
      ),
      withUuid: ds.withUuidColumn,
      simpleDoc: style === "simple",
      descriptionDoc: style === "description",
      className,
      datasourceType: dsType.datasourceType,
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
  types: DatasourceType[],
  naming: ArtifactNaming,
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
  const types = await loadDatasourceTypes(ctx.reader, opts.ds.idType);
  const entries = types.map((dsType) => renderType(dsType, opts));
  if (opts.createIndex) entries.push(renderIndex(types, opts.naming));
  return entries;
};
