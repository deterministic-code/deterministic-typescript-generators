import { fill } from "@deterministic-code/generators-common/fill";
import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import { content, type GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import { isFiniteInt } from "@deterministic-code/generators-common/yaml-entry";
import {
  viewValidatorPaths,
  type ViewValidatorPaths,
} from "./common/paths.ts";
import {
  SpecificationParser,
  type DatasourceType,
  type ShapedView,
  type ViewField,
  type ViewType,
} from "@deterministic-code/generators-common/specification-parser";
import { toZod } from "./common/type-converters/native-to-zod.ts";
import { inheritedColumns, loadTables } from "./inline-inherited.ts";
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
};

type EmitOptions = {
  idType: string;
  naming: ViewValidatorPaths;
  schemaVersion: string;
  referenceBackendType: boolean;
  tables: Map<string, DatasourceType>;
  templates: ViewValidatorTemplates;
};

const emitOptions = (
  settings: Record<string, string>,
  naming: ViewValidatorPaths,
  mode: ViewValidatorEmitMode,
  tables: Map<string, DatasourceType>,
): EmitOptions => {
  return {
    idType: settings["datasource.id_type"] ?? "integer",
    naming,
    schemaVersion: settings["codegen.schema_version"] ?? "1.0",
    referenceBackendType: mode.referenceBackendType ?? true,
    tables,
    templates: mode.templates ?? {
      typeTmpl: defaultTypeTmpl,
      indexTmpl: defaultIndexTmpl,
      schemaUnionTmpl: defaultSchemaUnionTmpl,
      schemaStandaloneTmpl: defaultSchemaStandaloneTmpl,
      schemaInheritTmpl: defaultSchemaInheritTmpl,
    },
  };
};

const schemaIdent = (name: string) => `${name}Schema`;
const dsAlias = (name: string) => `datasource_${name}Schema`;
const trio = (name: string) => ({
  create: `create_${name}Schema`,
  update: `update_${name}Schema`,
  patch: `patch_${name}Schema`,
});
const omitObj = (keys: string[], naming: ViewValidatorPaths) =>
  keys.map((k) => `${JSON.stringify(naming.fieldName(k))}: true`).join(", ");
const viewOmits = (view: ShapedView, idType: string) =>
  view.omit.filter((k) => idType !== "uuid" || k !== "uuid");

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

const columnField = (column: {
  name: string;
  type: string;
  isNullable: boolean;
  size?: number;
  minSize?: number;
}): ViewField => ({
  name: column.name,
  type: column.type,
  kind: "primitive",
  base: column.type,
  isArray: false,
  isNullable: column.isNullable,
  size: column.size,
  minSize: column.minSize,
});

const shapedFields = (view: ShapedView, opts: EmitOptions): ViewField[] =>
  opts.referenceBackendType
    ? view.fields
    : [
        ...inheritedColumns(view, opts.tables, opts.idType).map(columnField),
        ...view.fields,
      ];

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
  const { naming } = opts;
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
    const fromPath = naming.importSpecifier(view.name, {
      entity,
      kind: kind === "datasource" ? "datasource-validator" : "view-validator",
    });
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
    ident: opts.naming.fieldIdent(f.name),
    zodExpr: zodForField(f, opts),
  }));

const schemaBody = (view: ViewType, opts: EmitOptions): string => {
  const schemaName = schemaIdent(view.name);
  if (view.kind === "union") {
    return fill(opts.templates.schemaUnionTmpl, {
      schemaName,
      members: view.members.map((m) => ({ ident: schemaIdent(m) })),
    }).trimEnd();
  }
  const t = trio(view.name);
  const inheritBackend = opts.referenceBackendType && view.inherits !== null;
  const fields = fieldTokens(
    inheritBackend ? view.fields : shapedFields(view, opts),
    opts,
  );
  const omits = viewOmits(view, opts.idType);
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
  const stamp = opts.idType !== "uuid"
    ? ["id", "uuid", "created", "updated"]
    : ["id", "created", "updated"];
  return fill(opts.templates.schemaInheritTmpl, {
    schemaName,
    dsAlias: dsAlias(parent),
    hasOmits: allOmits.length > 0,
    omitObj: omitObj(allOmits, opts.naming),
    partialId: omits.length > 0 && !omits.includes("id"),
    hasFields: fields.length > 0,
    fields,
    hasTrio,
    updateName: t.update,
    createName: t.create,
    patchName: t.patch,
    updateOmitObj: omitObj(
      [...stamp, ...view.enrichments.map((e) => e.fkColumn)],
      opts.naming,
    ),
    hasEnrich: view.enrichments.length > 0,
    enrichFields: view.enrichments.map((e) => ({
      ident: JSON.stringify(opts.naming.fieldName(e.newField)),
    })),
  }).trimEnd();
};

const indexExports = (view: ViewType): string | undefined => {
  if (view.kind === "shaped" && view.omit.length > 0) return undefined;
  if (view.kind === "union") return schemaIdent(view.name);
  const t = trio(view.name);
  return [schemaIdent(view.name), t.create, t.update, t.patch].join(", ");
};

export const generate = async (
  ctx: GenerateContext,
  naming: ViewValidatorPaths = viewValidatorPaths(ctx.settings),
  mode: ViewValidatorEmitMode = {},
): Promise<GenerateEntry[]> => {
  const idType = ctx.settings["datasource.id_type"] ?? "integer";
  const tables =
    (mode.referenceBackendType ?? true)
      ? new Map<string, DatasourceType>()
      : await loadTables(ctx, idType);
  const opts = emitOptions(ctx.settings, naming, mode, tables);
  const views = await new SpecificationParser(ctx.reader).loadViewTypes();
  const entries = views.map((view) =>
    content(
      opts.naming.filePath(view.name),
      fill(opts.templates.typeTmpl, {
        schemaVersion: opts.schemaVersion,
        imports: collectImports(view, opts),
        schemaBody: schemaBody(view, opts),
        withTypeAnnotation: true,
        className: opts.naming.className(view.name),
        schemaName: schemaIdent(view.name),
      }),
    ),
  );
  const createIndex =
    ctx.settings["codegen.create_index"] !== "false" &&
    !opts.naming.byFeature;
  if (createIndex) {
    entries.push(
      content(
        opts.naming.indexPath,
        fill(opts.templates.indexTmpl, {
          withTypeAnnotation: true,
          types: views.flatMap((view) => {
            const exports = indexExports(view);
            if (exports === undefined) return [];
            return [{
              exports,
              className: opts.naming.className(view.name),
              fileBase: opts.naming.fileBase(view.name),
            }];
          }),
        }),
      ),
    );
  }
  return entries;
};
