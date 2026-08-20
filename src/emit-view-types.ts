import { fill } from "@deterministic-code/generators-common/fill";
import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import { content, type GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import {
  viewPaths,
  type ViewPaths,
} from "./common/paths.ts";
import {
  SpecificationParser,
  type ShapedView,
  type ViewField,
  type ViewType,
} from "@deterministic-code/generators-common/specification-parser";
import { toNative } from "./base-type-converter.ts";
import { indexTmpl, typeTmpl } from "./resources/view-types.ts";

const docTokens = (settings: Record<string, string>) => {
  const comments = settings["comments"];
  return {
    simpleDoc: comments !== "none" && comments !== "description",
    descriptionDoc: comments === "description",
  };
};

type EmitOptions = {
  naming: ViewPaths;
  schemaVersion: string;
  simpleDoc: boolean;
  descriptionDoc: boolean;
  datetimeType: string;
  createIndex: boolean;
};

const emitOptions = (
  settings: Record<string, string>,
  naming: ViewPaths,
): EmitOptions => {
  const createIndex = settings["codegen.create_index"];
  return {
    naming,
    schemaVersion: settings["codegen.schema_version"] ?? "1.0",
    ...docTokens(settings),
    datetimeType: toNative("datetime"),
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
  const { naming, schemaVersion, simpleDoc, descriptionDoc } = opts;
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
      simpleDoc,
      descriptionDoc,
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

export const generateViewTypes = async (
  ctx: GenerateContext,
  naming: ViewPaths = viewPaths(ctx.settings),
): Promise<GenerateEntry[]> => {
  const opts = emitOptions(ctx.settings, naming);
  const views = await new SpecificationParser(ctx.reader).loadViewTypes();
  const entries = views.map((v) => renderView(v, opts));
  if (opts.createIndex) {
    entries.push(
      content(
        naming.indexPath,
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
