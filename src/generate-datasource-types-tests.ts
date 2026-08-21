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
import { typeTestTmpl } from "./resources/datasource-types-tests.ts";
import {
  fakeTestData,
  fieldExpr,
  preludeSource,
} from "./common/fake-test-data.ts";

type EmitOptions = {
  imports: ReturnType<typeof createImportGenerator>;
  schemaVersion: string;
};

const emitOptions = (settings: Record<string, string>): EmitOptions => {
  return {
    imports: createImportGenerator(".", settings),
    schemaVersion: settings["codegen.schema_version"] ?? "1.0",
  };
};

const escapeTestName = (name: string): string =>
  name.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

const fieldTokens = (field: DatasourceField) => {
  const ident = jsIdent(field.name);
  const expr = fieldExpr(fakeTestData, field.type, {
    nativeType: toNative(field.type),
    size: field.size,
  });
  return {
    ident,
    access: ident.startsWith('"') ? `[${ident}]` : `.${ident}`,
    testName: escapeTestName(field.name),
    sampleExpr: expr,
    nextExpr: expr,
    nullable: field.isNullable,
  };
};

const renderTests = (
  table: DatasourceType,
  opts: EmitOptions,
): GenerateEntry => {
  const fields = table.fields.map((f) => fieldTokens(f));
  return content(
    opts.imports.test(opts.imports.datasource(table.name), table.name),
    fill(typeTestTmpl, {
      prelude: preludeSource(fakeTestData),
      schemaVersion: opts.schemaVersion,
      className: table.name,
      tableName: table.name,
      typeImport: `../${table.name}`,
      fixture: `{ ${fields.map((f) => `${f.ident}: ${f.sampleExpr}`).join(", ")} }`,
      fields,
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
