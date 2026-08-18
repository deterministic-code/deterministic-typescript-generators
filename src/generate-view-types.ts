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
  type ViewField,
  type ViewType,
} from "./common/parse-view-types.ts";
import { settingsStr } from "./common/settings.ts";
import { toNative } from "./common/type-converter.ts";
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
  const createIndex = settingsStr(settings, "codegen.create_index");
  return {
    naming,
    schemaVersion: settingsStr(settings, "codegen.schema_version") ?? "1.0",
    style: commentStyle(settingsStr(settings, "comments")),
    datetimeType: datasourceSettings(settings).datetimeType,
    createIndex:
      !naming.byFeature && (createIndex === undefined || createIndex === "true"),
  };
};

const primitiveTs = (base: string, datetimeType: string): string =>
  base === "datetime" ? datetimeType : toNative(base);

const groupImports = (
  entries: Array<{ original: string; alias?: string; fromPath: string }>,
): Array<{ names: string; fromPath: string }> => {
  const byPath = new Map<string, string[]>();
  for (const e of entries) {
    const tokens = byPath.get(e.fromPath) ?? [];
    tokens.push(e.alias ? `${e.original} as ${e.alias}` : e.original);
    byPath.set(e.fromPath, tokens);
  }
  return [...byPath.entries()]
    .map(([fromPath, tokens]) => ({
      fromPath,
      names: [...new Set(tokens)].sort().join(", "),
    }))
    .sort((a, b) => a.fromPath.localeCompare(b.fromPath));
};

const collectImports = (view: ViewType, opts: EmitOptions) => {
  const { naming } = opts;
  const self = naming.className(view.name);
  const entries: Array<{ original: string; alias?: string; fromPath: string }> =
    [];
  const seen = new Set<string>();
  const aliasByClass = new Map<string, string>();
  const add = (original: string, alias: string | undefined, fromPath: string) => {
    const key = `${fromPath}::${original}::${alias ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    entries.push({ original, alias, fromPath });
  };
  const refs: Array<{ entity: string; kind: "view" | "datasource" }> = [];
  if (view.kind === "shaped") {
    if (view.inherits !== null) {
      refs.push({ entity: view.inherits, kind: "datasource" });
    }
    for (const f of view.fields) {
      if (f.kind === "datasource" || f.kind === "view") {
        refs.push({ entity: f.base, kind: f.kind });
      }
    }
  } else {
    for (const m of view.members) refs.push({ entity: m, kind: "view" });
  }
  for (const { entity, kind } of refs) {
    const cls = naming.className(entity);
    if (kind === "view" && cls === self) continue;
    const alias = kind === "datasource" && cls === self ? `${cls}Base` : undefined;
    if (alias !== undefined) aliasByClass.set(cls, alias);
    add(cls, alias, naming.importSpecifier(view.name, { entity, kind }));
  }
  return { imports: groupImports(entries), aliasByClass };
};

const fieldTs = (
  field: ViewField,
  opts: EmitOptions,
  aliasByClass: Map<string, string>,
): string => {
  const base =
    field.kind === "primitive"
      ? primitiveTs(field.base, opts.datetimeType)
      : (aliasByClass.get(opts.naming.className(field.base)) ??
        opts.naming.className(field.base));
  return field.isArray ? `${base}[]` : base;
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
  return `Omit<${parent}, ${omitKeys.map((k) => JSON.stringify(opts.naming.fieldName(k))).join(" | ")}>`;
};

const renderView = (view: ViewType, opts: EmitOptions): GenerateEntry => {
  const { naming, schemaVersion, style } = opts;
  const className = naming.className(view.name);
  const { imports, aliasByClass } = collectImports(view, opts);
  const isUnion = view.kind === "union";
  const parent = isUnion ? undefined : extendsType(view, opts, aliasByClass);
  return content(
    naming.filePath(view.name),
    fill(typeTmpl, {
      schemaVersion,
      imports,
      hasImports: imports.length > 0,
      simpleDoc: style === "simple",
      descriptionDoc: style === "description",
      className,
      datasourceType: isUnion ? "standard" : (view.inherits ?? "standard"),
      target: isUnion ? "UnionView" : "ShapedView",
      fieldCount: String(isUnion ? view.members.length : view.fields.length),
      isUnion,
      isShaped: !isUnion,
      hasExtends: parent !== undefined,
      extendsType: parent ?? "",
      hasFields: !isUnion && view.fields.length > 0,
      fields: isUnion
        ? []
        : view.fields.map((f) => ({
            ident: naming.fieldIdent(f.name),
            tsType: fieldTs(f, opts, aliasByClass),
            nullable: f.isNullable,
          })),
      unionMembers: isUnion
        ? view.members.map((m) => naming.className(m)).join(" | ")
        : "",
    }),
  );
};

export const generate = async (
  ctx: GenerateContext,
): Promise<GenerateEntry[]> => {
  const opts = emitOptions(ctx.settings);
  const views = await loadViewTypes(ctx.reader);
  const entries = views.map((v) => renderView(v, opts));
  if (opts.createIndex) {
    entries.push(
      content(
        "index.ts",
        fill(indexTmpl, {
          types: views.map((v) => ({
            className: opts.naming.className(v.name),
            fileBase: opts.naming.fileBase(v.name),
          })),
        }),
      ),
    );
  }
  return entries;
};
