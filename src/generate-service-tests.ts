import { fill } from "./common/fill.ts";
import type { GenerateContext } from "./common/generate-context.ts";
import { content, type GenerateEntry } from "./common/generate-entry.ts";
import { datasourceSettings } from "./common/datasource-settings.ts";
import { typescriptServiceNaming, type ServiceNaming } from "./common/naming.ts";
import {
  SpecificationParser,
  DATASOURCE_TYPES_YAML,
  primaryKeyFor,
  type DatasourceType,
  type ServiceCandidate,
} from "./common/specification-parser.ts";
import { settingsStr } from "./common/settings.ts";
import { asIdType, fakeTestData, preludeSource } from "./fake-test-data.ts";
import { joinImport, libraryImportSpecifier } from "./library-import.ts";
import { genericTmpl } from "./resources/service-tests.ts";

type EmitOptions = {
  naming: ServiceNaming;
  datasources: DatasourceType[];
  idType: string;
  libraryReferenceMode: string | undefined;
};

const emitOptions = async (
  ctx: GenerateContext,
): Promise<EmitOptions> => {
  const ds = datasourceSettings(ctx.settings);
  const hasDs = await ctx.reader.exists(DATASOURCE_TYPES_YAML);
  return {
    naming: typescriptServiceNaming(ctx.settings),
    idType: ds.idType,
    libraryReferenceMode: settingsStr(
      ctx.settings,
      "languages.typescript.library_reference_mode",
    ),
    datasources: hasDs
      ? new SpecificationParser().parseDatasourceTypes({
          yaml: await ctx.reader.read(DATASOURCE_TYPES_YAML),
          idType: ds.idType,
        })
      : [],
  };
};

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

export const generate = async (
  ctx: GenerateContext,
): Promise<GenerateEntry[]> => {
  const opts = await emitOptions(ctx);
  const { generics } = await new SpecificationParser(ctx.reader).loadServices({
    idType: opts.idType,
    serviceClassName: opts.naming.serviceClassName,
  });
  return generics.map((c) => renderTest(c, opts));
};
