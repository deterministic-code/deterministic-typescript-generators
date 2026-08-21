import { fill } from "@deterministic-code/generators-common/fill";
import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import { content, type GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import {
  DeterministicParser,
  type IDeterministic,
} from "@deterministic-code/generators-common/specification-parser";
import {
  entityUsesOptimisticConcurrency,
  ROUTES_YAML,
  type ExpandedDatasourceType,
  type RouteByField,
  type RouteCandidate,
  type ViewEnrichment,
} from "@deterministic-code/generators-common/specification";
import { asIdType, fakeTestData, preludeSource } from "./common/fake-test-data.ts";
import { createImportGenerator } from "./import-generator.ts";
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
  imports: ReturnType<typeof createImportGenerator>;
  datasources: ExpandedDatasourceType[];
  libraryReferenceMode: string | undefined;
  useOcc: boolean;
  enrichmentsByEntity: Map<string, ViewEnrichment[]>;
};

const emitOptions = (
  settings: Record<string, string>,
  datasources: ExpandedDatasourceType[],
  enrichmentsByEntity: Map<string, ViewEnrichment[]>,
): EmitOptions => {
  return {
    imports: createImportGenerator(".", settings),
    libraryReferenceMode: settings["languages.typescript.library_reference_mode"],
    useOcc: settings["datasource.use_optimistic_concurrency"] !== "false",
    datasources,
    enrichmentsByEntity,
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
  const table = opts.datasources.find((d) => d.name === candidate.name);
  const column = table?.primaryKeyColumn ?? "id";
  const pkType =
    table?.fields.find((f) => f.name === column)?.type ?? "integer";
  const path = opts.imports.routeTest(candidate.name);
  const fileBase = candidate.name;
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
    pkExpr: `new PrimaryKey(${JSON.stringify(column)}, ${JSON.stringify(pkType)})`,
    mountPath,
    idFieldName: column,
    idExpr: fakeTestData.id(asIdType(pkType)),
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

const generateFrom = (
  deterministic: IDeterministic,
  settings: Record<string, string>,
): GenerateEntry[] => {
  const parsed = deterministic.routes;
  const views = deterministic.viewTypes;
  const opts = emitOptions(
    settings,
    deterministic.expandedDatasourceTypes,
    new Map(
      views.map((v) => [v.name, v.kind === "shaped" ? v.enrichments : []]),
    ),
  );
  return parsed.candidates.map((c) => renderTest(c, opts));
};

export const generate = async (
  ctx: GenerateContext,
): Promise<GenerateEntry[]> => {
  await ctx.reader.read(ROUTES_YAML);
  return generateFrom(
    await DeterministicParser(ctx.reader).parse(ctx.settings),
    ctx.settings,
  );
};
