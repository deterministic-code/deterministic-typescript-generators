import { fill } from "@deterministic-code/generators-common/fill";
import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import { content, type GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import {
  importSpec,
  modulePathParts,
  routePaths,
  servicePaths,
  type RoutePaths,
  type ServicePaths,
} from "./common/paths.ts";
import {
  SpecificationParser,
  entityUsesOptimisticConcurrency,
  SERVICES_YAML,
  type CustomRouteEntry,
  type RouteByField,
  type RouteCandidate,
} from "@deterministic-code/generators-common/specification-parser";
import { isRecord } from "@deterministic-code/generators-common/yaml-entry";
import { YamlNode } from "@deterministic-code/generators-common/yaml-node";
import { libraryImportSpecifier } from "./library-import.ts";
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

type Datasource = {
  idType: string;
  withUuidColumn: boolean;
  useOptimisticConcurrency: boolean;
};

const datasource = (settings: Record<string, string>): Datasource => {
  const idType = settings["datasource.id_type"] ?? "integer";
  return {
    idType,
    withUuidColumn: idType !== "uuid",
    useOptimisticConcurrency:
      settings["datasource.use_optimistic_concurrency"] === "true",
  };
};

type EmitOptions = {
  ds: Datasource;
  naming: RoutePaths;
  services: ServicePaths;
  simpleDoc: boolean;
  descriptionDoc: boolean;
  libraryReferenceMode: string | undefined;
  createIndex: boolean;
};

const emitOptions = (settings: Record<string, string>): EmitOptions => {
  const naming = routePaths(settings);
  const createIndex = settings["codegen.create_index"];
  return {
    ds: datasource(settings),
    naming,
    services: servicePaths(settings),
    ...docTokens(settings),
    libraryReferenceMode: settings["languages.typescript.library_reference_mode"],
    createIndex:
      !naming.byFeature && (createIndex === undefined || createIndex === "true"),
  };
};

const customServiceEntities = async (
  reader: GenerateContext["reader"],
): Promise<Set<string>> => {
  const names = new Set<string>();
  if (!(await reader.exists(SERVICES_YAML))) return names;
  const root = YamlNode.fromYaml(await reader.read(SERVICES_YAML));
  for (const entry of root.child("services").items()) {
    const name = entry.str("name");
    if (name !== undefined) names.add(name);
  }
  return names;
};

const libImports = (
  opts: EmitOptions,
  entity: string,
  customService: boolean,
) => {
  const projectRel = opts.naming.projectRelPath(entity);
  const serviceRel = customService
    ? opts.services.customProjectRelPath(entity)
    : opts.services.projectRelPath(entity);
  return {
    serviceImport: importSpec(projectRel, serviceRel),
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
  const { simpleDoc, descriptionDoc, ds, naming } = opts;
  const entity = candidate.name;
  const occ = entityUsesOptimisticConcurrency(
    {
      datasourceType: candidate.datasourceType,
      optimisticConcurrency: candidate.optimisticConcurrency,
    },
    ds.useOptimisticConcurrency,
  );
  const readOnly = candidate.datasourceType === "readonly-lookup";
  const byFields = readOnly
    ? candidate.byFields.map((e) => ({
        ...e,
        methods: methodsOf(e, ["GET"]).filter((m) => m === "GET"),
      }))
    : candidate.byFields;
  return content(
    naming.filePath(entity),
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

const resolveCustomRoutePath = (
  entry: CustomRouteEntry,
  naming: RoutePaths,
): string => {
  const { module: mod } = customRouteMeta(entry);
  const defaultStub = naming.customStubPath(entry.name);
  const { byFeature } = naming;

  if (byFeature) {
    const isRelative = typeof mod === "string" && mod.startsWith(".");
    const isLegacyLayer =
      isRelative &&
      (mod.startsWith("./services/") || mod.startsWith("./routes/"));
    if (!isRelative || isLegacyLayer) return defaultStub;
    const parts = modulePathParts(mod);
    if (parts[0] !== "features") {
      throw new Error(
        `generateCustomRouteStub: route "${entry.name}" has module "${mod}" which is outside ./features/. ` +
          `When organize=by-feature, custom routes must live under features/<entity>/custom/. ` +
          `Drop the module: field to use the convention default (${defaultStub.replace(/\.ts$/, "")}), ` +
          `or point module: into ./features/.`,
      );
    }
    return `${parts.join("/")}.ts`;
  }

  if (mod === undefined || !mod.startsWith(".")) return defaultStub;
  const parts = modulePathParts(mod);
  if (parts[0] === "routes") parts.shift();
  return `../${parts.join("/")}.ts`;
};

const renderCustom = (
  entry: CustomRouteEntry,
  opts: EmitOptions,
): GenerateEntry => {
  const { simpleDoc, descriptionDoc, naming } = opts;
  const { className, interfaceName } = customRouteMeta(entry);
  return content(
    resolveCustomRoutePath(entry, naming),
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
  opts: EmitOptions,
): GenerateEntry[] => {
  const { naming } = opts;
  const entries: GenerateEntry[] = [];
  if (candidates.length > 0) {
    const sorted = [...candidates].sort((a, b) => a.name.localeCompare(b.name));
    entries.push(
      content(
        "index.ts",
        fill(indexTmpl, {
          routers: sorted.map((c) => ({
            fnName: `${c.name}Router`,
            fileBase: naming.fileBase(c.name),
          })),
        }),
      ),
    );
  }
  const customDir = customs.filter((e) => {
    const { module } = customRouteMeta(e);
    return module === undefined || !module.startsWith(".");
  });
  if (customDir.length > 0) {
    const sorted = [...customDir].sort((a, b) => a.name.localeCompare(b.name));
    entries.push(
      content(
        "../custom/index.ts",
        fill(indexTmpl, {
          types: sorted.map((e) => {
            const { className } = customRouteMeta(e);
            return { className, fileBase: `${e.name}_route` };
          }),
        }),
      ),
    );
  }
  return entries;
};

export const generate = async (
  ctx: GenerateContext,
): Promise<GenerateEntry[]> => {
  const opts = emitOptions(ctx.settings);
  const parser = new SpecificationParser(ctx.reader);
  const [parsed, customServices] = await Promise.all([
    parser.loadRoutes({ idType: opts.ds.idType }),
    customServiceEntities(ctx.reader),
  ]);
  const entries: GenerateEntry[] = [
    ...parsed.candidates.map((c) => renderEntityRouter(c, opts, customServices)),
    ...parsed.customs.map((c) => renderCustom(c, opts)),
  ];
  if (opts.createIndex) {
    entries.push(...renderIndexes(parsed.candidates, parsed.customs, opts));
  }
  return entries;
};
