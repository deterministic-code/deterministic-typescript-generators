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
  primaryKeyFor,
  type DatasourceType,
  type ServiceCandidate,
} from "@deterministic-code/generators-common/specification";
import { asIdType, fakeTestData, preludeSource } from "./common/fake-test-data.ts";
import { joinImport, libraryImportSpecifier } from "./library-import.ts";
import { genericTmpl } from "./resources/service-tests.ts";

type EmitOptions = {
  naming: ServicePaths;
  datasources: DatasourceType[];
  idType: string;
  libraryReferenceMode: string | undefined;
};

const emitOptions = (
  settings: Record<string, string>,
  datasources: DatasourceType[],
): EmitOptions => ({
  naming: servicePaths(settings),
  idType: settings["datasource.id_type"] ?? "integer",
  libraryReferenceMode: settings["languages.typescript.library_reference_mode"],
  datasources,
});

const renderTest = (
  candidate: ServiceCandidate,
  opts: EmitOptions,
): GenerateEntry => {
  const { naming } = opts;
  const pk = primaryKeyFor(candidate.name, opts.datasources, opts.idType);
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
      pkExpr: `new PrimaryKey(${JSON.stringify(pk.column)}, ${JSON.stringify(pk.idType)})`,
      idExpr: fakeTestData.id(asIdType(pk.idType)),
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
