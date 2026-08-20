import { fill } from "@deterministic-code/generators-common/fill";
import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import { content, type GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import { servicePaths, type ServicePaths } from "./common/paths.ts";
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
import { joinImport, libraryImportSpecifier } from "./library-import.ts";
import { genericTmpl } from "./resources/service-tests.ts";

type EmitOptions = {
  naming: ServicePaths;
  datasources: ExpandedDatasourceType[];
  libraryReferenceMode: string | undefined;
};

const emitOptions = (
  settings: Record<string, string>,
  datasources: ExpandedDatasourceType[],
): EmitOptions => ({
  naming: servicePaths(settings),
  libraryReferenceMode: settings["languages.typescript.library_reference_mode"],
  datasources,
});

const renderTest = (
  candidate: ServiceCandidate,
  opts: EmitOptions,
): GenerateEntry => {
  const { naming } = opts;
  const table = opts.datasources.find((d) => d.name === candidate.name);
  const column = table?.primaryKeyColumn ?? "id";
  const idType = table?.idType ?? "integer";
  const path = naming.testPath(candidate.name);
  const fileBase = naming.fileBase(candidate.name);
  return content(
    path,
    fill(genericTmpl, {
      prelude: preludeSource(fakeTestData),
      repositoriesImport: libraryImportSpecifier(
        "repositories",
        opts.libraryReferenceMode,
        naming.byFeature
          ? path
          : `services/generated/__tests__/${fileBase}.test.ts`,
      ),
      className: naming.serviceClassName(candidate.name),
      importPath: joinImport("..", fileBase),
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
      serviceClassName: servicePaths(ctx.settings).serviceClassName,
    }),
    ctx.settings,
  );
};
