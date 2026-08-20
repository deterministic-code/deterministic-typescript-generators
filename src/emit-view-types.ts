import { fill } from "@deterministic-code/generators-common/fill";
import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import { content, type GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import {
  viewPaths,
  type ViewPaths,
} from "./common/paths.ts";
import {
  DeterministicParser,
  type IDeterministic,
} from "@deterministic-code/generators-common/specification-parser";
import {
  VIEW_TYPES_YAML,
  type ShapedView,
  type ViewField,
  type ViewType,
} from "@deterministic-code/generators-common/specification";
import { toNative } from "./base-type-converter.ts";
import {
  indexTmpl as defaultIndexTmpl,
  typeTmpl as defaultTypeTmpl,
} from "./resources/view-types.ts";

export type ViewTypeTemplates = {
  typeTmpl: string;
  indexTmpl: string;
};

export type ViewEmitMode = {
  referenceBackendType?: boolean;
  templates?: ViewTypeTemplates;
};

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
  createIndex: boolean;
  referenceBackendType: boolean;
  templates: ViewTypeTemplates;
};

const emitOptions = (
  settings: Record<string, string>,
  naming: ViewPaths,
  mode: ViewEmitMode,
): EmitOptions => {
  const createIndex = settings["codegen.create_index"];
  return {
    naming,
    schemaVersion: settings["codegen.schema_version"] ?? "1.0",
    ...docTokens(settings),
    createIndex:
      !naming.byFeature && (createIndex === undefined || createIndex === "true"),
    referenceBackendType: mode.referenceBackendType ?? true,
    templates: mode.templates ?? {
      typeTmpl: defaultTypeTmpl,
      indexTmpl: defaultIndexTmpl,
    },
  };
};

const importKind = (
  kind: "view" | "datasource",
  opts: EmitOptions,
): "view" | "datasource" =>
  !opts.referenceBackendType && kind === "datasource" ? "view" : kind;

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
    if (opts.referenceBackendType && view.inherits !== null) {
      refs.push({ entity: view.inherits, kind: "datasource" });
    }
    for (const f of view.fields) {
      if (f.kind === "datasource" || f.kind === "view") {
        refs.push({ entity: f.base, kind: importKind(f.kind, opts) });
      }
    }
  } else {
    for (const m of view.members) refs.push({ entity: m, kind: "view" });
  }
  for (const { entity, kind } of refs) {
    const cls = naming.className(entity);
    if (kind === "view" && cls === self) continue;
    const alias =
      opts.referenceBackendType && kind === "datasource" && cls === self
        ? `${cls}Base`
        : undefined;
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
      ? toNative(field.base)
      : (aliasByClass.get(opts.naming.className(field.base)) ??
        opts.naming.className(field.base));
  return field.isArray ? `${base}[]` : base;
};

const extendsType = (
  view: ShapedView,
  opts: EmitOptions,
  aliasByClass: Map<string, string>,
): string | undefined => {
  if (!opts.referenceBackendType || view.inherits === null) return undefined;
  const inheritCls = opts.naming.className(view.inherits);
  const parent = aliasByClass.get(inheritCls) ?? inheritCls;
  const omitKeys = [
    ...view.enrichments.map((e) => e.fkColumn),
    ...view.omit,
  ];
  if (omitKeys.length === 0) return parent;
  return `Omit<${parent}, ${omitKeys.map((k) => JSON.stringify(opts.naming.fieldName(k))).join(" | ")}>`;
};

const renderView = (
  view: ViewType,
  expanded: ViewType | undefined,
  opts: EmitOptions,
): GenerateEntry => {
  const { naming, schemaVersion, simpleDoc, descriptionDoc } = opts;
  const className = naming.className(view.name);
  const { imports, aliasByClass } = collectImports(view, opts);
  const isUnion = view.kind === "union";
  const parent = isUnion ? undefined : extendsType(view, opts, aliasByClass);
  const fields = isUnion
    ? []
    : opts.referenceBackendType
      ? view.fields
      : expanded?.kind === "shaped"
        ? expanded.fields
        : view.fields;
  return content(
    naming.filePath(view.name),
    fill(opts.templates.typeTmpl, {
      schemaVersion,
      imports,
      hasImports: imports.length > 0,
      simpleDoc,
      descriptionDoc,
      className,
      datasourceType: isUnion ? "standard" : (view.inherits ?? "standard"),
      target: isUnion ? "UnionView" : "ShapedView",
      fieldCount: String(isUnion ? view.members.length : fields.length),
      isUnion,
      isShaped: !isUnion,
      hasExtends: parent !== undefined,
      extendsType: parent ?? "",
      hasFields: fields.length > 0,
      fields: fields.map((f) => ({
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

const generateFrom = (
  deterministic: IDeterministic,
  settings: Record<string, string>,
  naming: ViewPaths,
  mode: ViewEmitMode,
): GenerateEntry[] => {
  const opts = emitOptions(settings, naming, mode);
  const expandedByName = new Map(
    deterministic.expandedViewTypes.map((v) => [v.name, v]),
  );
  const views = deterministic.viewTypes;
  const entries = views.map((v) =>
    renderView(v, expandedByName.get(v.name), opts),
  );
  if (opts.createIndex) {
    entries.push(
      content(
        naming.indexPath,
        fill(opts.templates.indexTmpl, {
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

export const generateViewTypes = async (
  ctx: GenerateContext,
  naming: ViewPaths = viewPaths(ctx.settings),
  mode: ViewEmitMode = {},
): Promise<GenerateEntry[]> => {
  await ctx.reader.read(VIEW_TYPES_YAML);
  return generateFrom(
    await DeterministicParser(ctx.reader).parse(ctx.settings),
    ctx.settings,
    naming,
    mode,
  );
};
