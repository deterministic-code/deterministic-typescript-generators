import { camelCase, kebabCase } from "change-case";
import { parse } from "yaml";
import {
  datasourceSettings,
  type DatasourceSettings,
} from "./common/datasource-settings.ts";
import { commentStyle, type CommentStyle } from "./common/doc-comment.ts";
import { fill } from "./common/fill.ts";
import type { GenerateContext, SettingsDict } from "./common/generate-context.ts";
import { content, type GenerateEntry } from "./common/generate-entry.ts";
import {
  featureEntityFromClass,
  typescriptRouteNaming,
  type RouteNaming,
} from "./common/naming.ts";
import {
  entityUsesOptimisticConcurrency,
  loadRoutes,
  SERVICES_YAML,
  type CustomRouteEntry,
  type RouteByField,
  type RouteCandidate,
} from "./common/parse-routes.ts";
import { isRecord } from "./common/yaml-entry.ts";
import { settingsStr } from "./common/settings.ts";
import { libraryImportSpecifier } from "./library-import.ts";
import {
  appWiringTmpl,
  crudByFieldsTmpl,
  crudPlainTmpl,
  customStubTmpl,
  readonlyByFieldsTmpl,
  readonlyPlainTmpl,
} from "./resources/routes.ts";

type EmitOptions = {
  ds: DatasourceSettings;
  naming: RouteNaming;
  style: CommentStyle;
  libraryReferenceMode: string | undefined;
  createIndex: boolean;
  customServiceEntities: Set<string>;
};

const docFlags = (style: CommentStyle) => ({
  simpleDoc: style === "simple",
  descriptionDoc: style === "description",
});

const emitOptions = async (
  settings: SettingsDict,
  reader: GenerateContext["reader"],
): Promise<EmitOptions> => {
  const naming = typescriptRouteNaming(settings);
  const createIndex = settingsStr(settings, "codegen.create_index");
  const customServiceEntities = new Set<string>();
  if (await reader.exists(SERVICES_YAML)) {
    const doc = parse(await reader.read(SERVICES_YAML));
    const services = isRecord(doc) && Array.isArray(doc.services) ? doc.services : [];
    for (const entry of services) {
      if (!isRecord(entry) || typeof entry.name !== "string") continue;
      const derived = featureEntityFromClass(entry.name);
      if (derived) customServiceEntities.add(derived);
    }
  }
  return {
    ds: datasourceSettings(settings),
    naming,
    style: commentStyle(settingsStr(settings, "comments")),
    libraryReferenceMode: settingsStr(
      settings,
      "languages.typescript.library_reference_mode",
    ),
    createIndex:
      !naming.byFeature &&
      (createIndex === undefined || createIndex === "true"),
    customServiceEntities,
  };
};

const libImports = (
  opts: EmitOptions,
  entity: string,
): {
  serviceImport: string;
  routesImport: string;
  responsesImport: string;
  errorsImport: string;
} => {
  const projectRel = opts.naming.projectRelPath(entity);
  const custom = opts.customServiceEntities.has(kebabCase(entity));
  return {
    serviceImport: opts.naming.serviceImport(entity, entity, custom),
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

const notFoundIfZero = (
  entity: string,
  byField: string,
  indent: string,
): string => `${indent}    if (count === 0) {
${indent}      sendError(res, 404, "NOT_FOUND", \`${entity} with ${byField} '\${value}' not found\`);
${indent}      return;
${indent}    }`;

const uniqueCountGuards = (
  entity: string,
  byField: string,
  indent: string,
): string => `${notFoundIfZero(entity, byField, indent)}
${indent}    if (count > 1) {
${indent}      sendError(res, 409, "CONFLICT", \`Multiple ${entity} rows matched ${byField}='\${value}'\`);
${indent}      return;
${indent}    }`;

const byFieldGetBlock = (args: {
  entity: string;
  byField: string;
  fieldCamel: string;
  fieldKebab: string;
  unique: boolean;
  indent: string;
}): string => {
  const { entity, byField, fieldCamel, fieldKebab, unique, indent } = args;
  if (unique) {
    return `${indent}router.get("/${fieldKebab}/:${fieldCamel}", async (req, res, next) => {
${indent}  try {
${indent}    const value = req.params.${fieldCamel} ?? "";
${indent}    const rows = await service.findBy([{ name: "${byField}", value }]);
${indent}    if (rows.length === 0) {
${indent}      sendError(res, 404, "NOT_FOUND", \`${entity} with ${byField} '\${value}' not found\`);
${indent}      return;
${indent}    }
${indent}    if (rows.length > 1) {
${indent}      sendError(res, 409, "CONFLICT", \`Multiple ${entity} rows matched ${byField}='\${value}'\`);
${indent}      return;
${indent}    }
${indent}    sendItem(res, rows[0] as unknown as Record<string, unknown>);
${indent}  } catch (err) {
${indent}    next(err);
${indent}  }
${indent}});`;
  }
  return `${indent}router.get("/${fieldKebab}/:${fieldCamel}", async (req, res, next) => {
${indent}  try {
${indent}    const value = req.params.${fieldCamel} ?? "";
${indent}    const rows = await service.findBy([{ name: "${byField}", value }]);
${indent}    sendItems(res, rows as unknown[]);
${indent}  } catch (err) {
${indent}    next(err);
${indent}  }
${indent}});`;
};

const byFieldPutBlock = (args: {
  entity: string;
  byField: string;
  fieldCamel: string;
  fieldKebab: string;
  unique: boolean;
  indent: string;
}): string => {
  const { entity, byField, fieldCamel, fieldKebab, unique, indent } = args;
  const head = `${indent}router.put("/${fieldKebab}/:${fieldCamel}", async (req, res, next) => {
${indent}  try {
${indent}    const value = req.params.${fieldCamel} ?? "";
${indent}    const parsed = updateSchema.parse(req.body);
${indent}    const count = await service.updateBy(
${indent}      [{ name: "${byField}", value }],
${indent}      parsed as Record<string, unknown>,
${indent}    );`;
  const outcome = unique
    ? `${uniqueCountGuards(entity, byField, indent)}
${indent}    const rows = await service.findBy([{ name: "${byField}", value }]);
${indent}    sendItem(res, (rows[0] ?? null) as unknown as Record<string, unknown>);`
    : `${indent}    sendItem(res, { count });`;
  return `${head}
${outcome}
${indent}  } catch (err) {
${indent}    if (handleZodError(err, res)) return;
${indent}    next(err);
${indent}  }
${indent}});`;
};

const byFieldDeleteBlock = (args: {
  entity: string;
  byField: string;
  fieldCamel: string;
  fieldKebab: string;
  unique: boolean;
  indent: string;
}): string => {
  const { entity, byField, fieldCamel, fieldKebab, unique, indent } = args;
  if (unique) {
    return `${indent}router.delete("/${fieldKebab}/:${fieldCamel}", async (req, res, next) => {
${indent}  try {
${indent}    const value = req.params.${fieldCamel} ?? "";
${indent}    const count = await service.deleteBy([{ name: "${byField}", value }]);
${uniqueCountGuards(entity, byField, indent)}
${indent}    sendItem(res, { success: true });
${indent}  } catch (err) {
${indent}    next(err);
${indent}  }
${indent}});`;
  }
  return `${indent}router.delete("/${fieldKebab}/:${fieldCamel}", async (req, res, next) => {
${indent}  try {
${indent}    const value = req.params.${fieldCamel} ?? "";
${indent}    const count = await service.deleteBy([{ name: "${byField}", value }]);
${notFoundIfZero(entity, byField, indent)}
${indent}    sendItem(res, { count });
${indent}  } catch (err) {
${indent}    next(err);
${indent}  }
${indent}});`;
};

const byFieldsBlock = (
  entity: string,
  entries: RouteByField[],
  methodFilter?: (m: string) => boolean,
): string =>
  entries
    .map((entry) => {
      const methods = (
        Array.isArray(entry.methods) ? entry.methods : ["GET", "PUT", "DELETE"]
      ).filter(methodFilter ?? (() => true));
      const fieldCamel = camelCase(entry.byField);
      const fieldKebab = kebabCase(entry.byField);
      const ctx = {
        entity,
        byField: entry.byField,
        fieldCamel,
        fieldKebab,
        unique: entry.byFieldUnique,
        indent: "  ",
      };
      const blocks: string[] = [];
      if (methods.includes("GET")) blocks.push(byFieldGetBlock(ctx));
      if (methods.includes("PUT")) blocks.push(byFieldPutBlock(ctx));
      if (methods.includes("DELETE")) blocks.push(byFieldDeleteBlock(ctx));
      return blocks.join("\n");
    })
    .filter(Boolean)
    .join("\n\n");

const byFieldsNeedsZod = (entries: RouteByField[]): boolean =>
  entries.some((e) =>
    (Array.isArray(e.methods) ? e.methods : ["GET", "PUT", "DELETE"]).includes(
      "PUT",
    ),
  );

const renderEntityRouter = (
  candidate: RouteCandidate,
  opts: EmitOptions,
): GenerateEntry => {
  const { naming, style, ds } = opts;
  const entity = naming.className(candidate.name);
  const fnName = naming.routerFnName(candidate.name);
  const libs = libImports(opts, candidate.name);
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
        methods: (Array.isArray(e.methods) ? e.methods : ["GET"]).filter(
          (m) => m === "GET",
        ),
      }))
    : candidate.byFields;
  const tokens = {
    ...docFlags(style),
    ...libs,
    entity,
    fnName,
    datasourceType:
      candidate.datasourceType ||
      (readOnly ? "readonly-lookup" : "standard"),
    occ,
    needsZod: byFieldsNeedsZod(byFields),
    byFieldsBlock: byFieldsBlock(entity, byFields),
  };
  const tmpl = readOnly
    ? byFields.length > 0
      ? readonlyByFieldsTmpl
      : readonlyPlainTmpl
    : byFields.length > 0
      ? crudByFieldsTmpl
      : crudPlainTmpl;
  return content(naming.filePath(candidate.name), fill(tmpl, tokens));
};

const moduleParts = (mod: string): string[] => {
  const parts = mod.split("/").filter((p) => p !== "" && p !== ".");
  while (parts.length && parts[0] === "..") parts.shift();
  return parts;
};

export const resolveCustomRoutePath = (
  entry: CustomRouteEntry,
  naming: RouteNaming,
  byFeature: boolean,
): string => {
  const fileBase = naming.customRouteFileBase(entry.name);
  const raw = entry.entry[entry.name];
  const mod =
    isRecord(raw) && typeof raw.module === "string" ? raw.module : null;
  const routeClass =
    isRecord(raw) && typeof raw.routeClass === "string" && raw.routeClass
      ? raw.routeClass
      : `${entry.name}Route`;

  if (byFeature) {
    const isRelative = typeof mod === "string" && mod.startsWith(".");
    const isLegacyLayer =
      isRelative &&
      (mod.startsWith("./services/") || mod.startsWith("./routes/"));
    if (!isRelative || isLegacyLayer) {
      return naming.customStubPath(routeClass, fileBase);
    }
    const parts = moduleParts(mod);
    if (parts[0] !== "features") {
      const suggestion = naming.customStubPath(routeClass, fileBase);
      throw new Error(
        `generateCustomRouteStub: route "${entry.name}" has module "${mod}" which is outside ./features/. ` +
          `When organize=by-feature, custom routes must live under features/<entity>/custom/. ` +
          `Drop the module: field to use the convention default (${suggestion.replace(/\.ts$/, "")}), ` +
          `or point module: into ./features/.`,
      );
    }
    return `${parts.join("/")}.ts`;
  }

  if (!mod || !mod.startsWith(".")) return `../custom/${fileBase}.ts`;
  const parts = moduleParts(mod);
  if (parts[0] === "routes") parts.shift();
  return `../${parts.join("/")}.ts`;
};

const renderCustom = (
  entry: CustomRouteEntry,
  opts: EmitOptions,
): GenerateEntry => {
  const { naming, style } = opts;
  const className = `${naming.className(entry.name)}Route`;
  const interfaceName = `I${className}`;
  return content(
    resolveCustomRoutePath(entry, naming, naming.byFeature),
    fill(customStubTmpl, {
      ...docFlags(style),
      interfaceName,
      className,
    }),
  );
};

const renderAppWiring = (
  candidates: RouteCandidate[],
  opts: EmitOptions,
): GenerateEntry => {
  const { naming, libraryReferenceMode } = opts;
  const generatePath = naming.byFeature
    ? "features/app-wiring.ts"
    : "app-wiring.ts";
  const fileRelPath = naming.byFeature
    ? generatePath
    : "routes/generated/app-wiring.ts";
  const appImport = libraryImportSpecifier(
    "app",
    libraryReferenceMode,
    fileRelPath,
  );
  const imports = candidates.map((c) => {
    const fnName = naming.routerFnName(c.name);
    const importPath = naming.byFeature
      ? `./${naming.filePath(c.name).slice("features/".length).replace(/\.ts$/, ".js")}`
      : `./${naming.fileBase(c.name)}.js`;
    return { fnName, importPath };
  });
  const mounts = candidates.map((c) => {
    const fnName = naming.routerFnName(c.name);
    const key = JSON.stringify(c.name);
    const readOnly = c.datasourceType === "readonly-lookup";
    const args = readOnly
      ? `ctx.entityService(${key})`
      : `ctx.entityService(${key}), ctx.bodySchema(${key}, "create"), ctx.bodySchema(${key}, "update")`;
    return { fnName, apiPath: naming.apiPath(c.name), args };
  });
  return content(
    generatePath,
    fill(appWiringTmpl, { appImport, imports, mounts }),
  );
};

const dirOf = (p: string): string => {
  const idx = p.lastIndexOf("/");
  return idx === -1 ? "" : p.slice(0, idx);
};

const basenameNoExt = (p: string): string => {
  const idx = p.lastIndexOf("/");
  const stem = idx === -1 ? p : p.slice(idx + 1);
  return stem.replace(/\.ts$/, "");
};

const parseExports = (
  fileContent: string,
): { valueNames: Set<string>; typeNames: Set<string> } => {
  const valueNames = new Set<string>();
  const typeNames = new Set<string>();
  const re =
    /^\s*export\s+(?:async\s+)?(type|interface|class|function|const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fileContent)) !== null) {
    if (m[1] === "type" || m[1] === "interface") typeNames.add(m[2]!);
    else valueNames.add(m[2]!);
  }
  return { valueNames, typeNames };
};

const renderIndexes = (files: GenerateEntry[]): GenerateEntry[] => {
  const byDir = new Map<
    string,
    Array<{ stem: string; valueNames: Set<string>; typeNames: Set<string> }>
  >();
  for (const f of files) {
    if (f.kind !== "content") continue;
    const dir = dirOf(f.filename);
    const stem = basenameNoExt(f.filename);
    if (stem === "index") continue;
    const siblings = byDir.get(dir) ?? [];
    siblings.push({ stem, ...parseExports(f.contents) });
    byDir.set(dir, siblings);
  }
  const indexes: GenerateEntry[] = [];
  for (const [dir, siblings] of byDir) {
    siblings.sort((a, b) => a.stem.localeCompare(b.stem));
    const lines: string[] = [];
    for (const s of siblings) {
      const valueList = [...s.valueNames].sort();
      const typeList = [...s.typeNames].sort();
      if (valueList.length > 0) {
        lines.push(`export { ${valueList.join(", ")} } from "./${s.stem}";`);
      }
      if (typeList.length > 0) {
        lines.push(
          `export type { ${typeList.join(", ")} } from "./${s.stem}";`,
        );
      }
    }
    if (lines.length === 0) continue;
    indexes.push(
      content(dir ? `${dir}/index.ts` : "index.ts", `${lines.join("\n")}\n`),
    );
  }
  return indexes;
};

export const generate = async (
  ctx: GenerateContext,
): Promise<GenerateEntry[]> => {
  const opts = await emitOptions(ctx.settings, ctx.reader);
  const parsed = await loadRoutes(ctx.reader, { idType: opts.ds.idType });
  const entries: GenerateEntry[] = [
    ...parsed.candidates.map((c) => renderEntityRouter(c, opts)),
    ...parsed.customs.map((c) => renderCustom(c, opts)),
    ...(parsed.candidates.length > 0
      ? [renderAppWiring(parsed.candidates, opts)]
      : []),
  ];
  if (opts.createIndex) entries.push(...renderIndexes(entries));
  return entries;
};
