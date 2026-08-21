import { fill } from "@deterministic-code/generators-common/fill";
import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import { content, type GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
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
import { jsIdent } from "./common/default-casing.ts";
import {
  createImportGenerator,
  type TypeScriptImportGenerator,
} from "./import-generator.ts";
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
  /** Emit root. `""` / `"."` → backend layout. A directory → files under that dir, by-feature off. */
  basePath?: string;
  /** Import generator base for datasource types referenced from views. */
  datasourceBasePath?: string;
};

const docTokens = (settings: Record<string, string>) => {
  const comments = settings["comments"];
  return {
    simpleDoc: comments !== "none" && comments !== "description",
    descriptionDoc: comments === "description",
  };
};

type EmitOptions = {
  imports: TypeScriptImportGenerator;
  datasourceImports: TypeScriptImportGenerator;
  schemaVersion: string;
  simpleDoc: boolean;
  descriptionDoc: boolean;
  createIndexSetting: string | undefined;
  referenceBackendType: boolean;
  templates: ViewTypeTemplates;
};

const emitOptions = (
  settings: Record<string, string>,
  mode: ViewEmitMode,
): EmitOptions => {
  const referenceBackendType = mode.referenceBackendType ?? true;
  return {
    imports: createImportGenerator(mode.basePath ?? ".", settings),
    datasourceImports: createImportGenerator(
      mode.datasourceBasePath ?? ".",
      settings,
    ),
    schemaVersion: settings["codegen.schema_version"] ?? "1.0",
    ...docTokens(settings),
    createIndexSetting: settings["codegen.create_index"],
    referenceBackendType,
    templates: mode.templates ?? {
      typeTmpl: defaultTypeTmpl,
      indexTmpl: defaultIndexTmpl,
    },
  };
};

const viewRel = (entity: string, opts: EmitOptions): string =>
  opts.imports.viewRel(entity);

const datasourceRel = (entity: string, opts: EmitOptions): string =>
  opts.datasourceImports.datasourceRel(entity);

const typeImport = (
  from: string,
  to: { entity: string; kind: "view" | "datasource" },
  opts: EmitOptions,
): string =>
  opts.imports.spec(
    viewRel(from, opts),
    (to.kind === "view" ? viewRel : datasourceRel)(to.entity, opts),
  );

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
  const self = view.name;
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
    if (kind === "view" && entity === self) continue;
    const alias =
      opts.referenceBackendType && kind === "datasource" && entity === self
        ? `${entity}Base`
        : undefined;
    if (alias !== undefined) aliasByClass.set(entity, alias);
    add(entity, alias, typeImport(view.name, { entity, kind }, opts));
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
      : (aliasByClass.get(field.base) ?? field.base);
  return field.isArray ? `${base}[]` : base;
};

const extendsType = (
  view: ShapedView,
  opts: EmitOptions,
  aliasByClass: Map<string, string>,
): string | undefined => {
  if (!opts.referenceBackendType || view.inherits === null) return undefined;
  const inheritCls = view.inherits;
  const parent = aliasByClass.get(inheritCls) ?? inheritCls;
  const omitKeys = [
    ...view.enrichments.map((e) => e.fkColumn),
    ...view.omit,
  ];
  if (omitKeys.length === 0) return parent;
  return `Omit<${parent}, ${omitKeys.map((k) => JSON.stringify(k)).join(" | ")}>`;
};

const renderView = (
  view: ViewType,
  expanded: ViewType | undefined,
  opts: EmitOptions,
): GenerateEntry => {
  const { schemaVersion, simpleDoc, descriptionDoc } = opts;
  const className = view.name;
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
    opts.imports.view(view.name),
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
        ident: jsIdent(f.name),
        tsType: fieldTs(f, opts, aliasByClass),
        nullable: f.isNullable,
      })),
      unionMembers: isUnion
        ? view.members.join(" | ")
        : "",
    }),
  );
};

const generateFrom = (
  deterministic: IDeterministic,
  settings: Record<string, string>,
  mode: ViewEmitMode,
): GenerateEntry[] => {
  const opts = emitOptions(settings, mode);
  const expandedByName = new Map(
    deterministic.expandedViewTypes.map((v) => [v.name, v]),
  );
  const views = deterministic.viewTypes;
  const entries = views.map((v) =>
    renderView(v, expandedByName.get(v.name), opts),
  );
  const index = opts.imports.index(opts.imports.view(views[0]?.name ?? "index"));
  if (
    index &&
    (opts.createIndexSetting === undefined || opts.createIndexSetting === "true")
  ) {
    entries.push(
      content(
        index,
        fill(opts.templates.indexTmpl, {
          types: views.map((v) => ({
            className: v.name,
            fileBase: v.name,
          })),
        }),
      ),
    );
  }
  return entries;
};

export const generateViewTypes = async (
  ctx: GenerateContext,
  mode: ViewEmitMode = {},
): Promise<GenerateEntry[]> => {
  await ctx.reader.read(VIEW_TYPES_YAML);
  return generateFrom(
    await DeterministicParser(ctx.reader).parse(ctx.settings),
    ctx.settings,
    mode,
  );
};
