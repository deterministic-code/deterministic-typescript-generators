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
  type CustomRouteEntry,
  type RouteByField,
  type RouteCandidate,
} from "@deterministic-code/generators-common/specification";
import { isRecord } from "@deterministic-code/generators-common/yaml-entry";
import { libraryImportSpecifier } from "./library-import.ts";
import {
  createImportGenerator,
  type TypeScriptImportGenerator,
} from "./import-generator.ts";
import {
  byFieldDeleteListTmpl,
  byFieldDeleteUniqueTmpl,
  byFieldGetListTmpl,
  byFieldGetUniqueTmpl,
  byFieldPutListTmpl,
  byFieldPutUniqueTmpl,
  crudTmpl,
  customStubTmpl,
  indexTmpl,
  readonlyTmpl,
} from "./resources/routes.ts";

const docTokens = (settings: Record<string, string>) => {
  const comments = settings["comments"];
  return {
    simpleDoc: comments !== "none" && comments !== "description",
    descriptionDoc: comments === "description",
  };
};

type EmitOptions = {
  imports: TypeScriptImportGenerator;
  useOptimisticConcurrency: boolean;
  simpleDoc: boolean;
  descriptionDoc: boolean;
  libraryReferenceMode: string | undefined;
  createIndexSetting: string | undefined;
};

const emitOptions = (settings: Record<string, string>): EmitOptions => ({
  imports: createImportGenerator(".", settings),
  useOptimisticConcurrency:
    settings["datasource.use_optimistic_concurrency"] !== "false",
  ...docTokens(settings),
  libraryReferenceMode: settings["languages.typescript.library_reference_mode"],
  createIndexSetting: settings["codegen.create_index"],
});

const libImports = (
  opts: EmitOptions,
  entity: string,
  customService: boolean,
) => {
  const projectRel = opts.imports.routeRel(entity);
  const serviceRel = customService
    ? opts.imports.serviceCustomRel(entity)
    : opts.imports.serviceRel(entity);
  return {
    serviceImport: opts.imports.spec(projectRel, serviceRel),
    routesImport: libraryImportSpecifier(
      "routes",
      opts.libraryReferenceMode,
      projectRel,
    ),
    responsesImport: libraryImportSpecifier(
      "responses",
      opts.libraryReferenceMode,
      projectRel,
    ),
    errorsImport: libraryImportSpecifier(
      "errors",
      opts.libraryReferenceMode,
      projectRel,
    ),
  };
};

const methodsOf = (entry: RouteByField, fallback: string[]): string[] =>
  Array.isArray(entry.methods) ? entry.methods : fallback;

const BY_FIELD_TMPLS = {
  GET: { unique: byFieldGetUniqueTmpl, list: byFieldGetListTmpl },
  PUT: { unique: byFieldPutUniqueTmpl, list: byFieldPutListTmpl },
  DELETE: { unique: byFieldDeleteUniqueTmpl, list: byFieldDeleteListTmpl },
} as const;

const byFieldsBlock = (entity: string, entries: RouteByField[]): string =>
  entries
    .map((entry) => {
      const methods = methodsOf(entry, ["GET", "PUT", "DELETE"]);
      const tokens = { entity, byField: entry.byField };
      const kind = entry.byFieldUnique ? "unique" : "list";
      return (["GET", "PUT", "DELETE"] as const)
        .filter((method) => methods.includes(method))
        .map((method) => fill(BY_FIELD_TMPLS[method][kind], tokens).trimEnd())
        .join("\n");
    })
    .filter(Boolean)
    .join("\n\n");

const byFieldsNeedsZod = (entries: RouteByField[]): boolean =>
  entries.some((e) => methodsOf(e, ["GET", "PUT", "DELETE"]).includes("PUT"));

const renderEntityRouter = (
  candidate: RouteCandidate,
  opts: EmitOptions,
  customServices: Set<string>,
): GenerateEntry => {
  const { simpleDoc, descriptionDoc, imports } = opts;
  const entity = candidate.name;
  const occ = entityUsesOptimisticConcurrency(
    {
      datasourceType: candidate.datasourceType,
      optimisticConcurrency: candidate.optimisticConcurrency,
    },
    opts.useOptimisticConcurrency,
  );
  const readOnly = candidate.datasourceType === "readonly-lookup";
  const byFields = readOnly
    ? candidate.byFields.map((e) => ({
        ...e,
        methods: methodsOf(e, ["GET"]).filter((m) => m === "GET"),
      }))
    : candidate.byFields;
  return content(
    imports.route(entity),
    fill(readOnly ? readonlyTmpl : crudTmpl, {
      simpleDoc,
      descriptionDoc,
      ...libImports(opts, entity, customServices.has(entity)),
      entity,
      fnName: `${entity}Router`,
      datasourceType:
        candidate.datasourceType || (readOnly ? "readonly-lookup" : "standard"),
      occ,
      needsZod: byFieldsNeedsZod(byFields),
      hasByFields: byFields.length > 0,
      byFieldsBlock: byFieldsBlock(entity, byFields),
    }),
  );
};

const customRouteMeta = (entry: CustomRouteEntry) => {
  const raw = entry.entry[entry.name];
  const rec = isRecord(raw) ? raw : undefined;
  const module =
    rec !== undefined && typeof rec.module === "string" ? rec.module : undefined;
  const className =
    rec !== undefined && typeof rec.routeClass === "string" && rec.routeClass
      ? rec.routeClass
      : entry.name;
  return { module, className, interfaceName: `I${className}` };
};

const renderCustom = (
  entry: CustomRouteEntry,
  opts: EmitOptions,
): GenerateEntry => {
  const { simpleDoc, descriptionDoc, imports } = opts;
  const { module, className, interfaceName } = customRouteMeta(entry);
  return content(
    imports.routeCustom(entry.name, module),
    fill(customStubTmpl, {
      simpleDoc,
      descriptionDoc,
      interfaceName,
      className,
    }),
  );
};

const renderIndexes = (
  candidates: RouteCandidate[],
  customs: CustomRouteEntry[],
  imports: TypeScriptImportGenerator,
): GenerateEntry[] => {
  const entries: GenerateEntry[] = [];
  if (candidates.length > 0) {
    const sorted = [...candidates].sort((a, b) => a.name.localeCompare(b.name));
    const index = imports.index(imports.route(sorted[0]!.name));
    if (index) {
      entries.push(
        content(
          index,
          fill(indexTmpl, {
            routers: sorted.map((c) => ({
              fnName: `${c.name}Router`,
              fileBase: c.name,
            })),
          }),
        ),
      );
    }
  }
  const customDir = customs.filter((e) => {
    const { module } = customRouteMeta(e);
    return module === undefined || !module.startsWith(".");
  });
  if (customDir.length > 0) {
    const sorted = [...customDir].sort((a, b) => a.name.localeCompare(b.name));
    const index = imports.index(imports.routeCustom(sorted[0]!.name));
    if (index) {
      entries.push(
        content(
          index,
          fill(indexTmpl, {
            types: sorted.map((e) => {
              const { className } = customRouteMeta(e);
              return { className, fileBase: `${e.name}_route` };
            }),
          }),
        ),
      );
    }
  }
  return entries;
};

const generateFrom = (
  deterministic: IDeterministic,
  settings: Record<string, string>,
): GenerateEntry[] => {
  const opts = emitOptions(settings);
  const parsed = deterministic.routes;
  const customServices = new Set(
    deterministic.services.customs.map((entry) => entry.name),
  );
  const entries: GenerateEntry[] = [
    ...parsed.candidates.map((c) => renderEntityRouter(c, opts, customServices)),
    ...parsed.customs.map((c) => renderCustom(c, opts)),
  ];
  if (
    opts.createIndexSetting === undefined ||
    opts.createIndexSetting === "true"
  ) {
    entries.push(...renderIndexes(parsed.candidates, parsed.customs, opts.imports));
  }
  return entries;
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
