import { fill } from "@deterministic-code/generators-common/fill";
import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import { content, type GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import { isFiniteInt } from "@deterministic-code/generators-common/yaml-entry";
import {
  DeterministicParser,
  type IDeterministic,
} from "@deterministic-code/generators-common/specification-parser";
import {
  createImportGenerator,
  type TypeScriptImportGenerator,
} from "./import-generator.ts";
import {
  VIEW_TYPES_YAML,
  type ExpandedViewType,
  type ShapedView,
  type ViewField,
  type ViewType,
} from "@deterministic-code/generators-common/specification";
import { toZod } from "./common/type-converters/native-to-zod.ts";
import { jsIdent } from "./common/default-casing.ts";
import {
  indexTmpl as defaultIndexTmpl,
  schemaInheritTmpl as defaultSchemaInheritTmpl,
  schemaStandaloneTmpl as defaultSchemaStandaloneTmpl,
  schemaUnionTmpl as defaultSchemaUnionTmpl,
  typeTmpl as defaultTypeTmpl,
} from "./resources/view-type-validators.ts";

export type ViewValidatorTemplates = {
  typeTmpl: string;
  indexTmpl: string;
  schemaUnionTmpl: string;
  schemaStandaloneTmpl: string;
  schemaInheritTmpl: string;
};

export type ViewValidatorEmitMode = {
  referenceBackendType?: boolean;
  templates?: ViewValidatorTemplates;
  basePath?: string;
  datasourceBasePath?: string;
};

type EmitOptions = {
  imports: TypeScriptImportGenerator;
  datasourceImports: TypeScriptImportGenerator;
  schemaVersion: string;
  referenceBackendType: boolean;
  templates: ViewValidatorTemplates;
};

const emitOptions = (
  settings: Record<string, string>,
  mode: ViewValidatorEmitMode,
): EmitOptions => {
  const referenceBackendType = mode.referenceBackendType ?? true;
  return {
    imports: createImportGenerator(mode.basePath ?? ".", settings),
    datasourceImports: createImportGenerator(
      mode.datasourceBasePath ?? ".",
      settings,
    ),
    schemaVersion: settings["codegen.schema_version"] ?? "1.0",
    referenceBackendType,
    templates: mode.templates ?? {
      typeTmpl: defaultTypeTmpl,
      indexTmpl: defaultIndexTmpl,
      schemaUnionTmpl: defaultSchemaUnionTmpl,
      schemaStandaloneTmpl: defaultSchemaStandaloneTmpl,
      schemaInheritTmpl: defaultSchemaInheritTmpl,
    },
  };
};

const viewRel = (entity: string, opts: EmitOptions): string =>
  opts.imports.viewValidatorRel(entity);

const datasourceRel = (entity: string, opts: EmitOptions): string =>
  opts.datasourceImports.datasourceValidatorRel(entity);

const schemaIdent = (name: string) => `${name}Schema`;
const dsAlias = (name: string) => `datasource_${name}Schema`;
const trio = (name: string) => ({
  create: `create_${name}Schema`,
  update: `update_${name}Schema`,
  patch: `patch_${name}Schema`,
});
const omitObj = (keys: string[]) =>
  keys.map((k) => `${JSON.stringify(k)}: true`).join(", ");
const viewOmits = (view: ShapedView, hasUuidColumn: boolean) =>
  view.omit.filter((k) => hasUuidColumn || k !== "uuid");

const tighten = (field: ViewField): string => {
  const base = toZod(field.base);
  switch (field.base) {
    case "string":
    case "character": {
      let expr = `${base}.trim()`;
      if (isFiniteInt(field.minSize) && field.minSize! >= 0) expr += `.min(${field.minSize})`;
      if (isFiniteInt(field.size) && field.size! >= 0) expr += `.max(${field.size})`;
      return expr;
    }
    case "number":
    case "integer":
    case "biginteger":
    case "smallinteger":
    case "reference": {
      let expr = `${base}.int()`;
      if (field.name === "id" || field.name.endsWith("_id")) expr += ".nonnegative()";
      if (isFiniteInt(field.minSize)) expr += `.min(${field.minSize})`;
      if (isFiniteInt(field.size)) expr += `.max(${field.size})`;
      return expr;
    }
    default:
      return base;
  }
};

const zodForField = (field: ViewField, opts: EmitOptions): string => {
  const nested =
    field.kind === "datasource" && opts.referenceBackendType
      ? dsAlias(field.base)
      : schemaIdent(field.base);
  let expr =
    field.kind === "primitive"
      ? tighten(field)
      : `z.lazy(() => ${nested})`;
  if (field.isArray) expr = `z.array(${expr})`;
  if (field.isNullable) expr += ".nullable()";
  return expr;
};

const collectImports = (view: ViewType, opts: EmitOptions) => {
  const byPath = new Map<string, Set<string>>();
  const refs: Array<{ entity: string; kind: "view" | "datasource" }> = [];
  if (view.kind === "shaped") {
    if (opts.referenceBackendType && view.inherits !== null) {
      refs.push({ entity: view.inherits, kind: "datasource" });
    }
    for (const f of view.fields) {
      if (f.kind === "datasource" || f.kind === "view") {
        refs.push({
          entity: f.base,
          kind:
            !opts.referenceBackendType && f.kind === "datasource"
              ? "view"
              : f.kind,
        });
      }
    }
  } else {
    for (const m of view.members) refs.push({ entity: m, kind: "view" });
  }
  for (const { entity, kind } of refs) {
    if (kind === "view" && entity === view.name) continue;
    const fromPath = opts.imports.spec(
      viewRel(view.name, opts),
      (kind === "datasource" ? datasourceRel : viewRel)(entity, opts),
    );
    const token =
      kind === "datasource"
        ? `${schemaIdent(entity)} as ${dsAlias(entity)}`
        : schemaIdent(entity);
    const set = byPath.get(fromPath) ?? new Set();
    set.add(token);
    byPath.set(fromPath, set);
  }
  return [...byPath.entries()]
    .map(([fromPath, tokens]) => ({
      fromPath,
      names: [...tokens].sort().join(", "),
    }))
    .sort((a, b) => a.fromPath.localeCompare(b.fromPath));
};

const fieldTokens = (fields: ViewField[], opts: EmitOptions) =>
  fields.map((f) => ({
    ident: jsIdent(f.name),
    zodExpr: zodForField(f, opts),
  }));

const schemaBody = (
  view: ViewType,
  expanded: ExpandedViewType | undefined,
  opts: EmitOptions,
): string => {
  const schemaName = schemaIdent(view.name);
  if (view.kind === "union") {
    return fill(opts.templates.schemaUnionTmpl, {
      schemaName,
      members: view.members.map((m) => ({ ident: schemaIdent(m) })),
    }).trimEnd();
  }
  const t = trio(view.name);
  const inheritBackend = opts.referenceBackendType && view.inherits !== null;
  const inlineFields =
    expanded?.kind === "shaped" ? expanded.fields : view.fields;
  const fields = fieldTokens(
    inheritBackend ? view.fields : inlineFields,
    opts,
  );
  const hasUuidColumn =
    expanded?.kind === "shaped" &&
    expanded.fields.some((f) => f.name === "uuid");
  const omits = viewOmits(view, hasUuidColumn);
  const hasTrio = omits.length === 0;
  if (!inheritBackend || view.inherits === null) {
    return fill(opts.templates.schemaStandaloneTmpl, {
      schemaName,
      emptyObject: fields.length === 0,
      fields,
      hasTrio,
      createName: t.create,
      updateName: t.update,
      patchName: t.patch,
    }).trimEnd();
  }
  const parent = view.inherits;
  const allOmits = [...view.enrichments.map((e) => e.fkColumn), ...omits];
  const stamp = hasUuidColumn
    ? ["id", "uuid", "created", "updated"]
    : ["id", "created", "updated"];
  return fill(opts.templates.schemaInheritTmpl, {
    schemaName,
    dsAlias: dsAlias(parent),
    hasOmits: allOmits.length > 0,
    omitObj: omitObj(allOmits),
    partialId: omits.length > 0 && !omits.includes("id"),
    hasFields: fields.length > 0,
    fields,
    hasTrio,
    updateName: t.update,
    createName: t.create,
    patchName: t.patch,
    updateOmitObj: omitObj(
      [...stamp, ...view.enrichments.map((e) => e.fkColumn)],
    ),
    hasEnrich: view.enrichments.length > 0,
    enrichFields: view.enrichments.map((e) => ({
      ident: JSON.stringify(e.newField),
    })),
  }).trimEnd();
};

const indexExports = (view: ViewType): string | undefined => {
  if (view.kind === "shaped" && view.omit.length > 0) return undefined;
  if (view.kind === "union") return schemaIdent(view.name);
  const t = trio(view.name);
  return [schemaIdent(view.name), t.create, t.update, t.patch].join(", ");
};

const generateFrom = (
  deterministic: IDeterministic,
  settings: Record<string, string>,
  mode: ViewValidatorEmitMode,
): GenerateEntry[] => {
  const opts = emitOptions(settings, mode);
  const expandedByName = new Map(
    deterministic.expandedViewTypes.map((v) => [v.name, v]),
  );
  const views = deterministic.viewTypes;
  const entries = views.map((view) =>
    content(
      opts.imports.viewValidator(view.name),
      fill(opts.templates.typeTmpl, {
        schemaVersion: opts.schemaVersion,
        imports: collectImports(view, opts),
        schemaBody: schemaBody(view, expandedByName.get(view.name), opts),
        withTypeAnnotation: true,
        className: view.name,
        schemaName: schemaIdent(view.name),
      }),
    ),
  );
  const index = opts.imports.index(
    opts.imports.viewValidator(views[0]?.name ?? "index"),
  );
  if (index && settings["codegen.create_index"] !== "false") {
    entries.push(
      content(
        index,
        fill(opts.templates.indexTmpl, {
          withTypeAnnotation: true,
          types: views.flatMap((view) => {
            const exports = indexExports(view);
            if (exports === undefined) return [];
            return [{
              exports,
              className: view.name,
              fileBase: view.name,
            }];
          }),
        }),
      ),
    );
  }
  return entries;
};

export const generate = async (
  ctx: GenerateContext,
  mode: ViewValidatorEmitMode = {},
): Promise<GenerateEntry[]> => {
  await ctx.reader.read(VIEW_TYPES_YAML);
  return generateFrom(
    await DeterministicParser(ctx.reader).parse(ctx.settings),
    ctx.settings,
    mode,
  );
};
