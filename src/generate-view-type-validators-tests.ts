import { camelCase } from "change-case";
import {
  datasourceSettings,
  nativeFieldType,
  tableFields,
  type DatasourceSettings,
} from "./common/datasource-settings.ts";
import { fill } from "./common/fill.ts";
import type { GenerateContext, SettingsDict } from "./common/generate-context.ts";
import { content, type GenerateEntry } from "./common/generate-entry.ts";
import {
  typescriptViewValidatorNaming,
  type ViewValidatorNaming,
} from "./common/naming.ts";
import {
  DATASOURCE_TYPES_YAML,
  parseDatasourceTypes,
  type DatasourceField,
  type DatasourceType,
} from "./common/parse-datasource-types.ts";
import {
  loadViewTypes,
  type ShapedView,
  type ViewField,
  type ViewType,
} from "./common/parse-view-types.ts";
import { settingsStr } from "./common/settings.ts";
import { FieldConverter, fieldConverter } from "./field-converter.ts";
import { typeTestTmpl } from "./resources/view-type-validators-tests.ts";

type EmitOptions = {
  ds: DatasourceSettings;
  naming: ViewValidatorNaming;
  schemaVersion: string;
  converter: FieldConverter;
  tables: Map<string, DatasourceType>;
  views: Map<string, ViewType>;
};

type FieldTok = {
  name: string;
  ident: string;
  sampleExpr: string;
  isNullable: boolean;
  hasDefault: boolean;
  type: string;
};

type CaseTok = {
  name: string;
  fixture: string;
  assertion: string;
};

const MUTABLE_SCALAR = new Set([
  "string",
  "number",
  "boolean",
  "datetime",
  "reference",
  "binary",
]);

const emitBase = (settings: SettingsDict) => {
  const ds = datasourceSettings(settings);
  return {
    ds,
    naming: typescriptViewValidatorNaming(settings),
    schemaVersion: settingsStr(settings, "codegen.schema_version") ?? "1.0",
    converter: new FieldConverter(fieldConverter, ds.datetimeRepr),
  };
};

const escapeTestName = (name: string): string =>
  name.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

const objectLiteral = (fields: Array<{ ident: string; expr: string }>): string =>
  `{ ${fields.map((f) => `${f.ident}: ${f.expr}`).join(", ")} }`;

const wrongTypeExpr = (type: string): string | undefined => {
  switch (type) {
    case "string":
      return "123";
    case "number":
    case "reference":
      return `"not-a-number"`;
    case "boolean":
      return `"not-a-boolean"`;
    case "datetime":
      return "42";
    case "binary":
      return `"not-binary"`;
    default:
      return undefined;
  }
};

const primitiveSample = (
  field: { name: string; type: string },
  opts: EmitOptions,
): string =>
  opts.converter.samples(field, nativeFieldType(opts.ds, field)).sample;

const wrapValue = (expr: string, field: ViewField): string =>
  field.isArray ? `[${expr}]` : expr;

const dsFixture = (name: string, opts: EmitOptions): string => {
  const table = opts.tables.get(name);
  if (table === undefined) return "{}";
  return objectLiteral(
    tableFields(table.fields, opts.ds).map((f) => ({
      ident: opts.naming.fieldIdent(f.name),
      expr: primitiveSample(f, opts),
    })),
  );
};

const viewFieldSample = (
  field: ViewField,
  opts: EmitOptions,
  visited: Set<string>,
): string => {
  let expr: string;
  if (field.kind === "primitive") {
    expr = primitiveSample({ name: field.name, type: field.base }, opts);
  } else if (field.kind === "datasource") {
    expr = dsFixture(field.base, opts);
  } else {
    expr = viewFixture(field.base, opts, visited);
  }
  return wrapValue(expr, field);
};

const parentToks = (view: ShapedView, opts: EmitOptions): FieldTok[] => {
  if (view.inherits === null) return [];
  const table = opts.tables.get(view.inherits);
  if (table === undefined) return [];
  const omit = new Set([
    ...view.omit,
    ...view.enrichments.map((e) => e.fkColumn),
  ]);
  return tableFields(table.fields, opts.ds)
    .filter((f) => !omit.has(f.name))
    .map((f) => ({
      name: f.name,
      ident: opts.naming.fieldIdent(f.name),
      sampleExpr: primitiveSample(f, opts),
      isNullable: f.isNullable,
      hasDefault:
        "hasDefault" in f && (f as DatasourceField).hasDefault === true,
      type: f.type,
    }));
};

const declaredToks = (
  view: ShapedView,
  opts: EmitOptions,
  visited: Set<string>,
): FieldTok[] =>
  view.fields.map((f) => ({
    name: f.name,
    ident: opts.naming.fieldIdent(f.name),
    sampleExpr: viewFieldSample(f, opts, visited),
    isNullable: f.isNullable,
    hasDefault: false,
    type: f.kind === "primitive" ? f.base : f.type,
  }));

const shapedToks = (
  view: ShapedView,
  opts: EmitOptions,
  visited: Set<string>,
): FieldTok[] => [...parentToks(view, opts), ...declaredToks(view, opts, visited)];

const viewFixture = (
  name: string,
  opts: EmitOptions,
  visited: Set<string>,
): string => {
  if (visited.has(name)) return "{}";
  const view = opts.views.get(name);
  if (view === undefined) return "{}";
  const next = new Set(visited).add(name);
  if (view.kind === "union") {
    const member = view.members[0];
    return member === undefined ? "{}" : viewFixture(member, opts, next);
  }
  return objectLiteral(
    shapedToks(view, opts, next).map((f) => ({
      ident: f.ident,
      expr: f.sampleExpr,
    })),
  );
};

const testPath = (entity: string, naming: ViewValidatorNaming): string => {
  const file = `${naming.fileBase(entity)}.test.ts`;
  if (!naming.byFeature) return file;
  const typeFile = naming.filePath(entity);
  return `${typeFile.slice(0, typeFile.lastIndexOf("/"))}/__tests__/${file}`;
};

const mutationCases = (
  fields: FieldTok[],
  targets: FieldTok[],
  { inherited = false } = {},
): CaseTok[] => {
  const cases: CaseTok[] = [];
  for (const field of targets) {
    const missingPrefix = inherited
      ? "missing inherited required field"
      : "missing required field";
    const nullPrefix = inherited
      ? "null for non-nullable inherited field"
      : "null for non-nullable field";
    if (!field.isNullable && !field.hasDefault) {
      cases.push({
        name: escapeTestName(`rejects when ${missingPrefix} "${field.name}"`),
        fixture: objectLiteral(
          fields
            .filter((f) => f.ident !== field.ident)
            .map((f) => ({ ident: f.ident, expr: f.sampleExpr })),
        ),
        assertion: "toThrow",
      });
      cases.push({
        name: escapeTestName(`rejects when ${nullPrefix} "${field.name}"`),
        fixture: objectLiteral(
          fields.map((f) => ({
            ident: f.ident,
            expr: f.ident === field.ident ? "null" : f.sampleExpr,
          })),
        ),
        assertion: "toThrow",
      });
      if (inherited) break;
    }
    if (inherited) continue;
    if (MUTABLE_SCALAR.has(field.type)) {
      const bad = wrongTypeExpr(field.type);
      if (bad !== undefined) {
        cases.push({
          name: escapeTestName(`rejects when wrong type on field "${field.name}"`),
          fixture: objectLiteral(
            fields.map((f) => ({
              ident: f.ident,
              expr: f.ident === field.ident ? bad : f.sampleExpr,
            })),
          ),
          assertion: "toThrow",
        });
      }
    }
  }
  return cases;
};

const shapedCases = (view: ShapedView, opts: EmitOptions): CaseTok[] => {
  const fields = shapedToks(view, opts, new Set([view.name]));
  const declared = declaredToks(view, opts, new Set([view.name]));
  const valid = objectLiteral(
    fields.map((f) => ({ ident: f.ident, expr: f.sampleExpr })),
  );
  const cases: CaseTok[] = [
    { name: "parses a valid payload", fixture: valid, assertion: "not.toThrow" },
  ];
  if (fields.some((f) => f.isNullable)) {
    cases.push({
      name: "accepts null for nullable fields",
      fixture: objectLiteral(
        fields.map((f) => ({
          ident: f.ident,
          expr: f.isNullable ? "null" : f.sampleExpr,
        })),
      ),
      assertion: "not.toThrow",
    });
  }
  const inheritedDeclared =
    view.inherits === null
      ? []
      : (opts.tables.get(view.inherits)?.fields ?? [])
          .filter(
            (f) =>
              !view.omit.includes(f.name) &&
              !view.enrichments.some((e) => e.fkColumn === f.name),
          )
          .map((f) => ({
            name: f.name,
            ident: opts.naming.fieldIdent(f.name),
            sampleExpr: primitiveSample(f, opts),
            isNullable: f.isNullable,
            hasDefault: f.hasDefault === true,
            type: f.type,
          }));
  const inheritedMutation = inheritedDeclared.find(
    (f) => !f.isNullable && !f.hasDefault,
  );
  if (inheritedMutation !== undefined) {
    cases.push(
      ...mutationCases(fields, [inheritedMutation], { inherited: true }),
    );
  }
  cases.push(...mutationCases(fields, declared));
  return cases;
};

const unionCases = (
  view: Extract<ViewType, { kind: "union" }>,
  opts: EmitOptions,
): CaseTok[] => {
  const cases = view.members.map((name) => ({
    name: escapeTestName(`accepts a ${name} member`),
    fixture: viewFixture(name, opts, new Set([view.name])),
    assertion: "not.toThrow",
  }));
  cases.push({
    name: escapeTestName(
      `rejects when matches neither member of union "${view.name}"`,
    ),
    fixture: `{ __not_a_member__: true }`,
    assertion: "toThrow",
  });
  return cases;
};

const renderTests = (view: ViewType, opts: EmitOptions): GenerateEntry =>
  content(
    testPath(view.name, opts.naming),
    fill(typeTestTmpl, {
      schemaVersion: opts.schemaVersion,
      schemaName: `${camelCase(view.name)}Schema`,
      viewName: view.name,
      schemaImport: `../${opts.naming.fileBase(view.name)}`,
      cases: view.kind === "union" ? unionCases(view, opts) : shapedCases(view, opts),
    }),
  );

export const generate = async (
  ctx: GenerateContext,
): Promise<GenerateEntry[]> => {
  const base = emitBase(ctx.settings);
  const views = await loadViewTypes(ctx.reader);
  const tables = (await ctx.reader.exists(DATASOURCE_TYPES_YAML))
    ? parseDatasourceTypes({
        yaml: await ctx.reader.read(DATASOURCE_TYPES_YAML),
        idType: base.ds.idType,
      })
    : [];
  const opts: EmitOptions = {
    ...base,
    tables: new Map(tables.map((t) => [t.name, t])),
    views: new Map(views.map((v) => [v.name, v])),
  };
  return views.map((view) => renderTests(view, opts));
};
