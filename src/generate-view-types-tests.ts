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
import { typeTestTmpl } from "./resources/view-types-tests.ts";
import {
  fakeTestData,
  fieldExpr,
  preludeSource,
} from "./common/fake-test-data.ts";

type EmitOptions = {
  naming: ViewPaths;
  schemaVersion: string;
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
});

const escapeTestName = (name: string): string =>
  name.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

const primitiveExpr = (base: string, size?: number): string =>
  fieldExpr(fakeTestData, base, { size });

const wrapArray = (expr: string, isArray: boolean): string =>
  isArray ? `[${expr}]` : expr;

const fieldTokens = (field: ViewField, opts: EmitOptions): FieldTok => {
  const ident = opts.naming.fieldIdent(field.name);
  const cls = opts.naming.className(field.base);
  const expr =
    field.kind === "primitive"
      ? primitiveExpr(field.base, field.size)
      : `{} as ${cls}`;
  return {
    ident,
    access: ident.startsWith('"') ? `[${ident}]` : `.${ident}`,
    testName: escapeTestName(opts.naming.fieldName(field.name)),
    sampleExpr: wrapArray(expr, field.isArray),
    nextExpr: wrapArray(expr, field.isArray),
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
      prelude: preludeSource(fakeTestData),
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
