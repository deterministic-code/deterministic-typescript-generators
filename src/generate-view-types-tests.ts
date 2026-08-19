import { fill } from "@deterministic-code/generators-common/fill";
import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import { content, type GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import {
  viewPaths,
  type ViewPaths,
} from "./common/paths.ts";
import {
  SpecificationParser,
  type ViewField,
  type ViewType,
} from "@deterministic-code/generators-common/specification-parser";
import { datetimeToNative } from "./common/type-converters/native-to-typescript.ts";
import { typeTestTmpl } from "./resources/view-types-tests.ts";

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
  naming: ViewPaths;
  schemaVersion: string;
  datetimeType: string;
};

type FieldTok = {
  ident: string;
  access: string;
  testName: string;
  sampleExpr: string;
  nextExpr: string;
  nullable: boolean;
};

const emitOptions = (settings: Record<string, string>): EmitOptions => ({
  naming: viewPaths(settings),
  schemaVersion: settings["codegen.schema_version"] ?? "1.0",
  datetimeType: datetimeToNative(datasource(settings).datetimeRepr),
});

const escapeTestName = (name: string): string =>
  name.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

const primitivePair = (
  base: string,
  datetimeType: string,
): { sample: string; next: string } => {
  switch (base) {
    case "number":
    case "integer":
    case "smallinteger":
    case "biginteger":
    case "reference":
      return { sample: "1", next: "2" };
    case "float":
      return { sample: "1.0", next: "2.0" };
    case "boolean":
      return { sample: "false", next: "true" };
    case "datetime":
      return datetimeType === "string"
        ? {
            sample: `"2024-01-01T00:00:00.000Z"`,
            next: `"2024-01-02T00:00:00.000Z"`,
          }
        : {
            sample: `new Date("2024-01-01T00:00:00.000Z")`,
            next: `new Date("2024-01-02T00:00:00.000Z")`,
          };
    case "decimal":
      return { sample: `"0"`, next: `"1"` };
    case "uuid":
      return {
        sample: `"00000000-0000-0000-0000-000000000000"`,
        next: `"00000000-0000-0000-0000-000000000001"`,
      };
    case "binary":
      return {
        sample: `"AAAAAAAAAAAAAAAAAAAAAA=="`,
        next: `"AQIDBAUGBwgJCgsMDQ4PEA=="`,
      };
    default:
      return { sample: `"sample"`, next: `"sample-next"` };
  }
};

const wrapArray = (expr: string, isArray: boolean): string =>
  isArray ? `[${expr}]` : expr;

const fieldTokens = (field: ViewField, opts: EmitOptions): FieldTok => {
  const ident = opts.naming.fieldIdent(field.name);
  const cls = opts.naming.className(field.base);
  const pair =
    field.kind === "primitive"
      ? primitivePair(field.base, opts.datetimeType)
      : { sample: `{} as ${cls}`, next: `{} as ${cls}` };
  return {
    ident,
    access: ident.startsWith('"') ? `[${ident}]` : `.${ident}`,
    testName: escapeTestName(opts.naming.fieldName(field.name)),
    sampleExpr: wrapArray(pair.sample, field.isArray),
    nextExpr: wrapArray(pair.next, field.isArray),
    nullable: field.isNullable,
  };
};

const testPath = (entity: string, naming: ViewPaths): string => {
  const file = `${naming.fileBase(entity)}.test.ts`;
  if (!naming.byFeature) return file;
  const typeFile = naming.filePath(entity);
  return `${typeFile.slice(0, typeFile.lastIndexOf("/"))}/__tests__/${file}`;
};

const renderTests = (view: ViewType, opts: EmitOptions): GenerateEntry => {
  const fields =
    view.kind === "shaped" ? view.fields.map((f) => fieldTokens(f, opts)) : [];
  return content(
    testPath(view.name, opts.naming),
    fill(typeTestTmpl, {
      schemaVersion: opts.schemaVersion,
      className: opts.naming.className(view.name),
      viewName: view.name,
      typeImport: `../${opts.naming.fileBase(view.name)}`,
      isShaped: view.kind === "shaped",
      isUnion: view.kind === "union",
      fixture:
        fields.length === 0
          ? "{}"
          : `{ ${fields.map((f) => `${f.ident}: ${f.sampleExpr}`).join(", ")} }`,
      fields,
      members:
        view.kind === "union"
          ? view.members.map((name) => ({
              name,
              memberClass: opts.naming.className(name),
              memberImport: opts.naming.importSpecifier(view.name, {
                entity: name,
                kind: "view",
              }),
            }))
          : [],
    }),
  );
};

export const generate = async (
  ctx: GenerateContext,
): Promise<GenerateEntry[]> => {
  const opts = emitOptions(ctx.settings);
  const views = await new SpecificationParser(ctx.reader).loadViewTypes();
  return views.map((view) => renderTests(view, opts));
};
