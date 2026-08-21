import { toNative } from "./base-type-converter.ts";
import { fill } from "@deterministic-code/generators-common/fill";
import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import { content, type GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import { createImportGenerator } from "./import-generator.ts";
import { jsIdent } from "./common/default-casing.ts";
import {
  DeterministicParser,
  type IDeterministic,
} from "@deterministic-code/generators-common/specification-parser";
import {
  DATASOURCE_TYPES_YAML,
  type DatasourceField,
  type DatasourceType,
} from "@deterministic-code/generators-common/specification";
import { typeTestTmpl } from "./resources/datasource-type-validators-tests.ts";
import {
  fakeTestData,
  fieldExpr,
  preludeSource,
} from "./common/fake-test-data.ts";

type EmitOptions = {
  imports: ReturnType<typeof createImportGenerator>;
  schemaVersion: string;
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

const emitOptions = (settings: Record<string, string>): EmitOptions => {
  return {
    imports: createImportGenerator(".", settings),
    schemaVersion: settings["codegen.schema_version"] ?? "1.0",
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

const fieldTok = (
  field: DatasourceField | { name: string; type: string; isNullable: boolean },
): FieldTok => {
  const ident = jsIdent(field.name);
  const sampleExpr = fieldExpr(fakeTestData, field.type, {
    nativeType: toNative(field.type),
    size: "size" in field ? field.size : undefined,
  });
  return {
    name: field.name,
    ident,
    sampleExpr,
    isNullable: field.isNullable,
    hasDefault: "hasDefault" in field && field.hasDefault === true,
    type: field.type,
  };
};

const casesFor = (fields: FieldTok[]): CaseTok[] => {
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
  for (const field of fields) {
    if (!field.isNullable && !field.hasDefault) {
      cases.push({
        name: escapeTestName(`rejects when missing required field "${field.name}"`),
        fixture: objectLiteral(
          fields
            .filter((f) => f.ident !== field.ident)
            .map((f) => ({ ident: f.ident, expr: f.sampleExpr })),
        ),
        assertion: "toThrow",
      });
    }
    if (!field.isNullable) {
      cases.push({
        name: escapeTestName(`rejects when null for non-nullable field "${field.name}"`),
        fixture: objectLiteral(
          fields.map((f) => ({
            ident: f.ident,
            expr: f.ident === field.ident ? "null" : f.sampleExpr,
          })),
        ),
        assertion: "toThrow",
      });
    }
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

const renderTests = (
  table: DatasourceType,
  opts: EmitOptions,
): GenerateEntry => {
  const fields = table.fields.map((f) => fieldTok(f));
  return content(
    opts.imports.test(opts.imports.datasource(table.name), table.name),
    fill(typeTestTmpl, {
      prelude: preludeSource(fakeTestData),
      schemaVersion: opts.schemaVersion,
      schemaName: `${table.name}Schema`,
      tableName: table.name,
      schemaImport: `../${table.name}`,
      cases: casesFor(fields),
    }),
  );
};

const generateFrom = (
  deterministic: IDeterministic,
  settings: Record<string, string>,
): GenerateEntry[] => {
  const opts = emitOptions(settings);
  return deterministic.expandedDatasourceTypes.map((table) =>
    renderTests(table, opts),
  );
};

export const generate = async (
  ctx: GenerateContext,
): Promise<GenerateEntry[]> => {
  await ctx.reader.read(DATASOURCE_TYPES_YAML);
  return generateFrom(
    await DeterministicParser(ctx.reader).parse(ctx.settings),
    ctx.settings,
  );
};
