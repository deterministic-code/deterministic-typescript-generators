import { fill } from "@deterministic-code/generators-common/fill";
import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import { content, type GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import {
  DeterministicParser,
  type IDeterministic,
} from "@deterministic-code/generators-common/specification-parser";
import {
  SERVICES_YAML,
  type ExpandedDatasourceType,
  type ServiceCandidate,
} from "@deterministic-code/generators-common/specification";
import { asIdType, fakeTestData, preludeSource } from "./common/fake-test-data.ts";
import { libraryImportSpecifier } from "./library-import.ts";
import { createImportGenerator } from "./import-generator.ts";
import { genericTmpl } from "./resources/service-tests.ts";

type EmitOptions = {
  imports: ReturnType<typeof createImportGenerator>;
  datasources: ExpandedDatasourceType[];
  libraryReferenceMode: string | undefined;
};

const emitOptions = (
  settings: Record<string, string>,
  datasources: ExpandedDatasourceType[],
): EmitOptions => ({
  imports: createImportGenerator(".", settings),
  libraryReferenceMode: settings["languages.typescript.library_reference_mode"],
  datasources,
});

const renderTest = (
  candidate: ServiceCandidate,
  opts: EmitOptions,
): GenerateEntry => {
  const table = opts.datasources.find((d) => d.name === candidate.name);
  const column = table?.primaryKeyColumn ?? "id";
  const pkType =
    table?.fields.find((f) => f.name === column)?.type ?? "integer";
  const src = opts.imports.service(candidate.name);
  const path = opts.imports.serviceTest(candidate.name);
  const fileBase = `${candidate.name}_service`;
  return content(
    path,
    fill(genericTmpl, {
      prelude: preludeSource(fakeTestData),
      repositoriesImport: libraryImportSpecifier(
        "repositories",
        opts.libraryReferenceMode,
        opts.imports.serviceTestRel(candidate.name),
      ),
      className: `${candidate.name}_service`,
      importPath: opts.imports.testSpec(src, fileBase),
      entityNameJson: JSON.stringify(candidate.name),
      pkExpr: `new PrimaryKey(${JSON.stringify(column)}, ${JSON.stringify(pkType)})`,
      idExpr: fakeTestData.id(asIdType(pkType)),
    }),
  );
};

const generateFrom = (
  deterministic: IDeterministic,
  settings: Record<string, string>,
): GenerateEntry[] => {
  const opts = emitOptions(settings, deterministic.expandedDatasourceTypes);
  return deterministic.services.generics.map((c) => renderTest(c, opts));
};

export const generate = async (
  ctx: GenerateContext,
): Promise<GenerateEntry[]> => {
  await ctx.reader.read(SERVICES_YAML);
  return generateFrom(
    await DeterministicParser(ctx.reader).parse(ctx.settings, {
      serviceClassName: (entity) => `${entity}_service`,
    }),
    ctx.settings,
  );
};
