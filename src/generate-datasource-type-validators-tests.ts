import { nativeFieldType } from "./common/type-converters/native-to-typescript.ts";
import { fill } from "@deterministic-code/generators-common/fill";
import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import { content, type GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import { datasourcePaths, type ArtifactPaths } from "./common/paths.ts";
import {
  tableFields,
  SpecificationParser,
  DATASOURCE_TYPES_YAML,
  type DatasourceField,
  type DatasourceType,
} from "@deterministic-code/generators-common/specification-parser";
import { typeTestTmpl } from "./resources/datasource-type-validators-tests.ts";
import { FieldConverter, fieldConverter } from "./common/field-converter.ts";

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
  naming: ArtifactPaths;
  schemaVersion: string;
  converter: FieldConverter;
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
  const ds = datasource(settings);
  return {
    ds,
    naming: datasourcePaths(settings),
    schemaVersion: settings["codegen.schema_version"] ?? "1.0",
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

const fieldTok = (
  field: DatasourceField | { name: string; type: string; isNullable: boolean },
  opts: EmitOptions,
): FieldTok => {
  const ident = opts.naming.fieldIdent(field.name);
  const { sample } = opts.converter.samples(
    field,
    nativeFieldType(opts.ds, field),
  );
  return {
    name: field.name,
    ident,
    sampleExpr: sample,
    isNullable: field.isNullable,
    hasDefault: "hasDefault" in field && field.hasDefault === true,
    type: field.type,
  };
};

const testPath = (entity: string, naming: ArtifactPaths): string => {
  const file = `${naming.fileBase(entity)}.test.ts`;
  if (!naming.byFeature) return file;
  const typeFile = naming.filePath(entity);
  return `${typeFile.slice(0, typeFile.lastIndexOf("/"))}/__tests__/${file}`;
};

const casesFor = (fields: FieldTok[], declared: FieldTok[]): CaseTok[] => {
  const valid = objectLiteral(
    fields.map((f) => ({ ident: f.ident, expr: f.sampleExpr })),
  );
  const cases: CaseTok[] = [
    { name: "parses a valid payload", fixture: valid, assertion: "not.toThrow" },
  ];
  if (declared.some((f) => f.isNullable)) {
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
  for (const field of declared) {
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
  const fields = tableFields(table.fields, opts.ds.idType).map((f) =>
    fieldTok(f, opts),
  );
  const declared = table.fields.map((f) => fieldTok(f, opts));
  return content(
    testPath(table.name, opts.naming),
    fill(typeTestTmpl, {
      schemaVersion: opts.schemaVersion,
      schemaName: `${table.name}Schema`,
      tableName: table.name,
      schemaImport: `../${opts.naming.fileBase(table.name)}`,
      cases: casesFor(fields, declared),
    }),
  );
};

export const generate = async (
  ctx: GenerateContext,
): Promise<GenerateEntry[]> => {
  const opts = emitOptions(ctx.settings);
  const types = new SpecificationParser().parseDatasourceTypes({
    yaml: await ctx.reader.read(DATASOURCE_TYPES_YAML),
    idType: opts.ds.idType,
  });
  return types.map((table) => renderTests(table, opts));
};
