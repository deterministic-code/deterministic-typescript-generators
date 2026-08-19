import { fill } from "./common/fill.ts";
import type { GenerateContext } from "./common/generate-context.ts";
import { content, type GenerateEntry } from "./common/generate-entry.ts";
import { datasourceSettings } from "./common/datasource-settings.ts";
import {
  SpecificationParser,
  primaryKeyFor,
  entityUsesOptimisticConcurrency,
  type DatasourceType,
  type RouteByField,
  type RouteCandidate,
  type ViewEnrichment,
} from "./common/specification-parser.ts";
import { settingsStr } from "./common/settings.ts";
import { asIdType, fakeTestData, preludeSource } from "./common/fake-test-data.ts";
import { routePaths, type RoutePaths } from "./common/paths.ts";
import { libraryImportSpecifier } from "./library-import.ts";
import {
  byFieldDeleteListTmpl,
  byFieldDeleteUniqueTmpl,
  byFieldGetListTmpl,
  byFieldGetUniqueTmpl,
  byFieldPutListTmpl,
  byFieldPutUniqueTmpl,
  crudTmpl,
  mockFactoryTmpl,
  readonlyTmpl,
} from "./resources/routes-tests.ts";

type EmitOptions = {
  naming: RoutePaths;
  datasources: DatasourceType[];
  idType: string;
  libraryReferenceMode: string | undefined;
  useOcc: boolean;
  enrichmentsByEntity: Map<string, ViewEnrichment[]>;
};

const emitOptions = async (ctx: GenerateContext): Promise<EmitOptions> => {
  const ds = datasourceSettings(ctx.settings);
  const views = (await ctx.reader.exists("view_types.yaml"))
    ? await new SpecificationParser(ctx.reader).loadViewTypes()
    : [];
  return {
    naming: routePaths(ctx.settings),
    idType: ds.idType,
    libraryReferenceMode: settingsStr(
      ctx.settings,
      "languages.typescript.library_reference_mode",
    ),
    useOcc: ds.useOptimisticConcurrency,
    datasources: [],
    enrichmentsByEntity: new Map(
      views.map((v) => [v.name, v.kind === "shaped" ? v.enrichments : []]),
    ),
  };
};

const fkMockSuffix = (enrichments: ViewEnrichment[]): string =>
  enrichments.map((e) => `, ${e.fkColumn}: 1`).join("");

const requestNameSuffix = (enrichments: ViewEnrichment[]): string =>
  enrichments.map((e) => `, ${e.newField}: "${e.targetTable}-1"`).join("");

const byFieldTokens = (
  mountPath: string,
  entry: RouteByField,
  ifMatch: string,
) => ({
  mountPath,
  kebab: entry.byField,
  byField: entry.byField,
  ifMatch,
});

const byFieldsBlock = (
  mountPath: string,
  byFields: RouteByField[],
  ifMatch: string,
): string =>
  byFields
    .flatMap((entry) => {
      const methods = entry.methods ?? ["GET", "PUT", "DELETE"];
      const tokens = byFieldTokens(mountPath, entry, ifMatch);
      const out: string[] = [];
      if (methods.includes("GET")) {
        out.push(
          fill(
            entry.byFieldUnique ? byFieldGetUniqueTmpl : byFieldGetListTmpl,
            tokens,
          ),
        );
      }
      if (methods.includes("PUT")) {
        out.push(
          fill(
            entry.byFieldUnique ? byFieldPutUniqueTmpl : byFieldPutListTmpl,
            tokens,
          ),
        );
      }
      if (methods.includes("DELETE")) {
        out.push(
          fill(
            entry.byFieldUnique
              ? byFieldDeleteUniqueTmpl
              : byFieldDeleteListTmpl,
            tokens,
          ),
        );
      }
      return out;
    })
    .join("");

const renderTest = (
  candidate: RouteCandidate,
  opts: EmitOptions,
): GenerateEntry => {
  const pk = primaryKeyFor(candidate.name, opts.datasources, opts.idType);
  const path = opts.naming.testPath(candidate.name);
  const fileBase = opts.naming.fileBase(candidate.name);
  const mountPath = `/api/${candidate.name}`;
  const enrichments = opts.enrichmentsByEntity.get(candidate.name) ?? [];
  const occ = entityUsesOptimisticConcurrency(candidate, opts.useOcc);
  const ifMatch = occ ? `.set("If-Match", occToken)` : "";
  const shared = {
    prelude: preludeSource(fakeTestData),
    pkImport: `import { PrimaryKey } from "${libraryImportSpecifier(
      "repositories",
      opts.libraryReferenceMode,
      path,
    )}";`,
    fnName: `${candidate.name}Router`,
    fileBase,
    mockFactory: mockFactoryTmpl,
    pkExpr: `new PrimaryKey(${JSON.stringify(pk.column)}, ${JSON.stringify(pk.idType)})`,
    mountPath,
    idFieldName: pk.column,
    idExpr: fakeTestData.id(asIdType(pk.idType)),
    fkSuffix: fkMockSuffix(enrichments),
    byFieldsBlock: byFieldsBlock(mountPath, candidate.byFields, ifMatch),
  };
  if (candidate.datasourceType === "readonly-lookup") {
    return content(path, fill(readonlyTmpl, shared));
  }
  return content(
    path,
    fill(crudTmpl, {
      ...shared,
      entity: candidate.name,
      nameSuffix: requestNameSuffix(enrichments),
      occDecl: occ ? `  const occToken = new Date().toISOString();\n` : "",
      ifMatch,
      occCallArg: occ ? `, { expectedUpdated: occToken }` : "",
    }),
  );
};

export const generate = async (
  ctx: GenerateContext,
): Promise<GenerateEntry[]> => {
  const opts = await emitOptions(ctx);
  const parsed = await new SpecificationParser(ctx.reader).loadRoutes({ idType: opts.idType });
  return parsed.candidates.map((c) =>
    renderTest(c, { ...opts, datasources: parsed.datasources }),
  );
};
