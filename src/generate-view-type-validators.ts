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
  type ShapedView,
  type ViewField,
  type ViewType,
} from "@deterministic-code/generators-common/specification-parser";
import { toZod } from "./common/type-converters/native-to-zod.ts";
import { indexTmpl, schemaInheritTmpl, schemaStandaloneTmpl, schemaUnionTmpl, typeTmpl } from "./resources/view-type-validators.ts";

type Datasource = {
  idType: string;
  datetimeRepr: string;
  withUuidColumn: boolean;
  useOptimisticConcurrency: boolean;
};

const datasource = (settings: Record<string, string>): Datasource => {
  const idType = settings["datasource.id_type"] ?? "integer";
  return {
    idType,
    datetimeRepr: settings["datasource.datetime"] ?? "native",
    withUuidColumn: idType !== "uuid",
    useOptimisticConcurrency:
      settings["datasource.use_optimistic_concurrency"] === "true",
  };
};

type EmitOptions = {
  ds: Datasource;
  naming: ViewValidatorPaths;
  schemaVersion: string;
};

const emitOptions = (settings: Record<string, string>): EmitOptions => {
  const ds = datasource(settings);
  return {
    ds,
    naming: viewValidatorPaths(settings),
    schemaVersion: settings["codegen.schema_version"] ?? "1.0",
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
const viewOmits = (view: ShapedView, withUuid: boolean) =>
  view.omit.filter((k) => withUuid || k !== "uuid");

const tighten = (field: ViewField, datetimeRepr: string): string => {
  const base = toZod(field.base, datetimeRepr);
  switch (field.base) {
    case "string":
    case "character": {
      let expr = `${base}.trim()`;
      if (isFiniteInt(field.minSize) && field.minSize! >= 0) expr += `.min(${field.minSize})`;
      if (isFiniteInt(field.size) && field.size! >= 0) expr += `.max(${field.size})`;
      return expr;
    }
    case "datetime":
      return datetimeRepr === "native" ? base : `${base}.trim()`;
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
    field.kind === "datasource" ? dsAlias(field.base) : schemaIdent(field.base);
  let expr =
    field.kind === "primitive"
      ? tighten(field, opts.ds.datetimeRepr)
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
    if (view.inherits !== null) refs.push({ entity: view.inherits, kind: "datasource" });
    for (const f of view.fields) {
      if (f.kind === "datasource" || f.kind === "view") {
        refs.push({ entity: f.base, kind: f.kind });
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

const fieldTokens = (view: ShapedView, opts: EmitOptions) =>
  view.fields.map((f) => ({
    ident: opts.naming.fieldIdent(f.name),
    zodExpr: zodForField(f, opts),
  }));

const schemaBody = (view: ViewType, opts: EmitOptions): string => {
  const schemaName = schemaIdent(view.name);
  if (view.kind === "union") {
    return fill(schemaUnionTmpl, {
      schemaName,
      members: view.members.map((m) => ({ ident: schemaIdent(m) })),
    }).trimEnd();
  }
  const t = trio(view.name);
  const fields = fieldTokens(view, opts);
  const omits = viewOmits(view, opts.ds.withUuidColumn);
  const hasTrio = omits.length === 0;
  if (view.inherits === null) {
    return fill(schemaStandaloneTmpl, {
      schemaName,
      emptyObject: fields.length === 0,
      fields,
      hasTrio,
      createName: t.create,
      updateName: t.update,
      patchName: t.patch,
    }).trimEnd();
  }
  const allOmits = [...view.enrichments.map((e) => e.fkColumn), ...omits];
  const stamp = opts.ds.withUuidColumn
    ? ["id", "uuid", "created", "updated"]
    : ["id", "created", "updated"];
  return fill(schemaInheritTmpl, {
    schemaName,
    dsAlias: dsAlias(view.inherits),
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
): Promise<GenerateEntry[]> => {
  const opts = emitOptions(ctx.settings);
  const views = await new SpecificationParser(ctx.reader).loadViewTypes();
  const entries = views.map((view) =>
    content(
      opts.naming.filePath(view.name),
      fill(typeTmpl, {
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
        "index.ts",
        fill(indexTmpl, {
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
