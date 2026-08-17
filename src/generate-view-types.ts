import { datasourceSettings } from "./common/datasource-settings.ts";
import { commentStyle, type CommentStyle } from "./common/doc-comment.ts";
import { fill } from "./common/fill.ts";
import type { GenerateContext, SettingsDict } from "./common/generate-context.ts";
import { content, type GenerateEntry } from "./common/generate-entry.ts";
import {
  typescriptViewNaming,
  type ViewArtifactNaming,
} from "./common/naming.ts";
import {
  loadViewTypes,
  type ShapedView,
  type UnionView,
  type ViewField,
  type ViewType,
} from "./common/parse-view-types.ts";
import { settingsStr } from "./common/settings.ts";
import { indexTmpl, typeTmpl } from "./view-types/resources.ts";

type EmitOptions = {
  naming: ViewArtifactNaming;
  schemaVersion: string;
  style: CommentStyle;
  datetimeType: string;
  createIndex: boolean;
};

const emitOptions = (settings: SettingsDict): EmitOptions => {
  const naming = typescriptViewNaming(settings);
  const createIndexSetting = settingsStr(settings, "codegen.create_index");
  return {
    naming,
    schemaVersion: settingsStr(settings, "codegen.schema_version") ?? "1.0",
    style: commentStyle(settingsStr(settings, "comments")),
    datetimeType: datasourceSettings(settings).datetimeType,
    createIndex:
      !naming.byFeature &&
      (createIndexSetting === undefined || createIndexSetting === "true"),
  };
};

const PRIMITIVE_TS: Record<string, string> = {
  uuid: "string",
  integer: "number",
  smallinteger: "number",
  biginteger: "number",
  float: "number",
  reference: "number",
  binary: "string",
};

const primitiveTs = (base: string, datetimeType: string): string => {
  if (base === "datetime") return datetimeType;
  return PRIMITIVE_TS[base] ?? base;
};

type ImportEntry = {
  original: string;
  alias: string | undefined;
  fromPath: string;
};

const groupImports = (
  entries: ImportEntry[],
): Array<{ names: string; fromPath: string }> => {
  const byPath = new Map<string, string[]>();
  for (const entry of entries) {
    const tokens = byPath.get(entry.fromPath) ?? [];
    tokens.push(
      entry.alias === undefined
        ? entry.original
        : `${entry.original} as ${entry.alias}`,
    );
    byPath.set(entry.fromPath, tokens);
  }
  return [...byPath.entries()]
    .map(([fromPath, tokens]) => ({
      fromPath,
      names: [...new Set(tokens)].sort().join(", "),
    }))
    .sort((a, b) => a.fromPath.localeCompare(b.fromPath));
};

type CollectedImports = {
  imports: Array<{ names: string; fromPath: string }>;
  aliasByClass: Map<string, string>;
};

const collectImports = (
  view: ViewType,
  opts: EmitOptions,
): CollectedImports => {
  const { naming } = opts;
  const selfClass = naming.className(view.name);
  const entries: ImportEntry[] = [];
  const seen = new Set<string>();
  const aliasByClass = new Map<string, string>();
  const add = (
    original: string,
    alias: string | undefined,
    fromPath: string,
  ) => {
    const key = `${fromPath}::${original}::${alias ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    entries.push({ original, alias, fromPath });
  };
  const aliasIfCollides = (cls: string): string | undefined => {
    if (cls !== selfClass) return undefined;
    const aliased = `${cls}Base`;
    aliasByClass.set(cls, aliased);
    return aliased;
  };
  if (view.kind === "shaped") {
    if (view.inherits !== null) {
      const cls = naming.className(view.inherits);
      add(
        cls,
        aliasIfCollides(cls),
        naming.importSpecifier(view.name, {
          entity: view.inherits,
          kind: "datasource",
        }),
      );
    }
    for (const field of view.fields) {
      if (field.kind === "datasource") {
        const cls = naming.className(field.base);
        add(
          cls,
          aliasByClass.get(cls) ?? aliasIfCollides(cls),
          naming.importSpecifier(view.name, {
            entity: field.base,
            kind: "datasource",
          }),
        );
      } else if (field.kind === "view") {
        const cls = naming.className(field.base);
        if (cls !== selfClass) {
          add(
            cls,
            undefined,
            naming.importSpecifier(view.name, {
              entity: field.base,
              kind: "view",
            }),
          );
        }
      }
    }
  } else {
    for (const member of view.members) {
      const cls = naming.className(member);
      if (cls !== selfClass) {
        add(
          cls,
          undefined,
          naming.importSpecifier(view.name, {
            entity: member,
            kind: "view",
          }),
        );
      }
    }
  }
  return { imports: groupImports(entries), aliasByClass };
};

const fieldTs = (
  field: ViewField,
  opts: EmitOptions,
  aliasByClass: Map<string, string>,
): string => {
  if (field.kind === "primitive") {
    const ts = primitiveTs(field.base, opts.datetimeType);
    return field.isArray ? `${ts}[]` : ts;
  }
  const cls = opts.naming.className(field.base);
  const named = aliasByClass.get(cls) ?? cls;
  return field.isArray ? `${named}[]` : named;
};

const extendsType = (
  view: ShapedView,
  opts: EmitOptions,
  aliasByClass: Map<string, string>,
): string | undefined => {
  if (view.inherits === null) return undefined;
  const inheritCls = opts.naming.className(view.inherits);
  const parent = aliasByClass.get(inheritCls) ?? inheritCls;
  const omitKeys = [
    ...view.enrichments.map((e) => e.fkColumn),
    ...view.omit,
  ];
  if (omitKeys.length === 0) return parent;
  const keys = omitKeys
    .map((k) => JSON.stringify(opts.naming.fieldName(k)))
    .join(" | ");
  return `Omit<${parent}, ${keys}>`;
};

const renderShaped = (
  view: ShapedView,
  opts: EmitOptions,
): GenerateEntry => {
  const { naming, schemaVersion, style } = opts;
  const className = naming.className(view.name);
  const { imports, aliasByClass } = collectImports(view, opts);
  const parent = extendsType(view, opts, aliasByClass);
  return content(
    naming.filePath(view.name),
    fill(typeTmpl, {
      schemaVersion,
      imports,
      hasImports: imports.length > 0,
      simpleDoc: style === "simple",
      descriptionDoc: style === "description",
      className,
      datasourceType: view.inherits ?? "standard",
      target: "ShapedView",
      fieldCount: String(view.fields.length),
      isUnion: false,
      isShaped: true,
      hasExtends: parent !== undefined,
      extendsType: parent ?? "",
      hasFields: view.fields.length > 0,
      fields: view.fields.map((f) => ({
        ident: naming.fieldIdent(f.name),
        tsType: fieldTs(f, opts, aliasByClass),
        nullable: f.isNullable,
      })),
    }),
  );
};

const renderUnion = (view: UnionView, opts: EmitOptions): GenerateEntry => {
  const { naming, schemaVersion, style } = opts;
  const className = naming.className(view.name);
  const { imports } = collectImports(view, opts);
  return content(
    naming.filePath(view.name),
    fill(typeTmpl, {
      schemaVersion,
      imports,
      hasImports: imports.length > 0,
      simpleDoc: style === "simple",
      descriptionDoc: style === "description",
      className,
      datasourceType: "standard",
      target: "UnionView",
      fieldCount: String(view.members.length),
      isUnion: true,
      isShaped: false,
      unionMembers: view.members.map((m) => naming.className(m)).join(" | "),
    }),
  );
};

const renderView = (view: ViewType, opts: EmitOptions): GenerateEntry =>
  view.kind === "union" ? renderUnion(view, opts) : renderShaped(view, opts);

const renderIndex = (
  views: ViewType[],
  naming: ViewArtifactNaming,
): GenerateEntry =>
  content(
    "index.ts",
    fill(indexTmpl, {
      types: views.map((v) => ({
        className: naming.className(v.name),
        fileBase: naming.fileBase(v.name),
      })),
    }),
  );

export const generate = async (
  ctx: GenerateContext,
): Promise<GenerateEntry[]> => {
  const opts = emitOptions(ctx.settings);
  const views = await loadViewTypes(ctx.reader);
  const entries = views.map((view) => renderView(view, opts));
  if (opts.createIndex) entries.push(renderIndex(views, opts.naming));
  return entries;
};
