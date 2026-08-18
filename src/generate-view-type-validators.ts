import { camelCase, pascalCase } from "change-case";
import {
  datasourceSettings,
  type DatasourceSettings,
} from "./common/datasource-settings.ts";
import { fill } from "./common/fill.ts";
import type { GenerateContext, SettingsDict } from "./common/generate-context.ts";
import { content, type GenerateEntry } from "./common/generate-entry.ts";
import { isFiniteInt } from "./common/yaml-entry.ts";
import {
  typescriptViewValidatorNaming,
  type ViewValidatorNaming,
} from "./common/naming.ts";
import {
  loadViewTypes,
  type ShapedView,
  type ViewField,
  type ViewType,
} from "./common/parse-view-types.ts";
import { settingsStr } from "./common/settings.ts";
import { toZod } from "./common/type-converter.ts";
import { indexTmpl, typeTmpl } from "./view-type-validators/resources.ts";

type EmitOptions = {
  ds: DatasourceSettings;
  naming: ViewValidatorNaming;
  schemaVersion: string;
};

const emitOptions = (settings: SettingsDict): EmitOptions => {
  const ds = datasourceSettings(settings);
  return {
    ds,
    naming: typescriptViewValidatorNaming(settings),
    schemaVersion: settingsStr(settings, "codegen.schema_version") ?? "1.0",
  };
};

const schemaIdent = (name: string) => `${camelCase(name)}Schema`;
const dsAlias = (name: string) => `datasource${pascalCase(name)}Schema`;
const trio = (name: string) => {
  const p = pascalCase(name);
  return {
    create: `create${p}Schema`,
    update: `update${p}Schema`,
    patch: `patch${p}Schema`,
  };
};
const omitObj = (keys: string[], naming: ViewValidatorNaming) =>
  keys.map((k) => `${JSON.stringify(naming.fieldName(k))}: true`).join(", ");
const viewOmits = (view: ShapedView, withUuid: boolean) =>
  view.omit.filter((k) => withUuid || k !== "uuid");
const extend = (body: string) => (body === "" ? "" : `.extend({\n${body}\n})`);

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

const schemaBody = (view: ViewType, opts: EmitOptions): string => {
  if (view.kind === "union") {
    const members = view.members
      .map((m) => `z.lazy(() => ${schemaIdent(m)})`)
      .join(",\n  ");
    return `export const ${schemaIdent(view.name)} = z.union([\n  ${members},\n]);`;
  }
  const fields = view.fields
    .map((f) => `  ${opts.naming.fieldIdent(f.name)}: ${zodForField(f, opts)},`)
    .join("\n");
  const omits = viewOmits(view, opts.ds.withUuidColumn);
  let base: string;
  if (view.inherits === null) {
    base = fields === "" ? "z.object({})" : `z.object({\n${fields}\n})`;
  } else {
    const allOmits = [...view.enrichments.map((e) => e.fkColumn), ...omits];
    base = dsAlias(view.inherits);
    if (allOmits.length > 0) base += `.omit({ ${omitObj(allOmits, opts.naming)} })`;
    if (omits.length > 0 && !omits.includes("id")) base += ".partial({ id: true })";
    base += extend(fields);
  }
  const name = schemaIdent(view.name);
  const decl = `export const ${name} = ${base};`;
  if (omits.length > 0) return decl;
  const t = trio(view.name);
  if (view.inherits === null) {
    return `${decl}\nexport const ${t.create} = ${name};\nexport const ${t.update} = ${name};\nexport const ${t.patch} = ${name}.partial();`;
  }
  const stamp = opts.ds.withUuidColumn
    ? ["id", "uuid", "created", "updated"]
    : ["id", "created", "updated"];
  const enrich = view.enrichments
    .map(
      (e) =>
        `  ${JSON.stringify(opts.naming.fieldName(e.newField))}: z.string().trim(),`,
    )
    .join("\n");
  const update = `${dsAlias(view.inherits)}.omit({ ${omitObj(
    [...stamp, ...view.enrichments.map((e) => e.fkColumn)],
    opts.naming,
  )} })${extend(enrich)}`;
  return `${decl}\nexport const ${t.update} = ${update};\nexport const ${t.create} = ${t.update};\nexport const ${t.patch} = ${t.update}.partial();`;
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
  const views = await loadViewTypes(ctx.reader);
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
    settingsStr(ctx.settings, "codegen.create_index") !== "false" &&
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
