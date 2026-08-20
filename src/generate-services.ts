import { toNative } from "./base-type-converter.ts";
import { fill } from "@deterministic-code/generators-common/fill";
import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import { content, type GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import {
  modulePathParts,
  servicePaths,
  type ServicePaths,
} from "./common/paths.ts";
import {
  DeterministicParser,
  type IDeterministic,
} from "@deterministic-code/generators-common/specification-parser";
import {
  SERVICES_YAML,
  type CustomServiceEntry,
  type ServiceCandidate,
} from "@deterministic-code/generators-common/specification";
import { libraryImportSpecifier } from "./library-import.ts";
import {
  customStubTmpl,
  genericTmpl,
  indexTmpl,
} from "./resources/services.ts";

const docTokens = (settings: Record<string, string>) => {
  const comments = settings["comments"];
  return {
    simpleDoc: comments !== "none" && comments !== "description",
    descriptionDoc: comments === "description",
  };
};

type EmitOptions = {
  idType: string;
  naming: ServicePaths;
  simpleDoc: boolean;
  descriptionDoc: boolean;
  libraryReferenceMode: string | undefined;
  createIndex: boolean;
};

const emitOptions = (settings: Record<string, string>): EmitOptions => {
  const naming = servicePaths(settings);
  const createIndex = settings["codegen.create_index"];
  return {
    idType: settings["datasource.id_type"] ?? "integer",
    naming,
    ...docTokens(settings),
    libraryReferenceMode: settings["languages.typescript.library_reference_mode"],
    createIndex:
      !naming.byFeature &&
      (createIndex === undefined || createIndex === "true"),
  };
};

const resolveCustomGeneratePath = (
  entry: CustomServiceEntry,
  naming: ServicePaths,
  byFeature: boolean,
): string => {
  const fileBase = naming.casedFileStem(entry.name);
  const mod = entry.module;

  if (byFeature) {
    if (!mod || !mod.startsWith(".")) return naming.customStubPath(entry.name);
    if (mod.startsWith("./services/") || mod.startsWith("./routes/")) {
      return naming.customStubPath(entry.name);
    }
    const parts = modulePathParts(mod);
    if (parts[0] !== "features") {
      const suggestion = naming.customStubPath(entry.name);
      throw new Error(
        `generateCustomServiceStub: service "${entry.name}" has module "${mod}" which is outside ./features/. ` +
          `When organize=by-feature, custom services must live under features/<entity>/custom/. ` +
          `Drop the module: field to use the convention default (${suggestion.replace(/\.ts$/, "")}), ` +
          `or point module: into ./features/.`,
      );
    }
    return `${parts.join("/")}.ts`;
  }

  if (!mod || !mod.startsWith(".")) return `../custom/${fileBase}.ts`;
  const parts = modulePathParts(mod);
  if (parts[0] === "services") parts.shift();
  return `../${parts.join("/")}.ts`;
};

const renderGeneric = (
  candidate: ServiceCandidate,
  opts: EmitOptions,
): GenerateEntry => {
  const { naming, simpleDoc, descriptionDoc, libraryReferenceMode } = opts;
  const typeName = naming.className(candidate.name);
  const className = naming.serviceClassName(candidate.name);
  const interfaceName = `I${className}`;
  const generatePath = naming.filePath(candidate.name);
  const typeImportPath = naming.importSpecifier(candidate.name, {
    entity: candidate.name,
    kind: candidate.kind === "datasource_type" ? "datasource" : "view",
  });
  const servicesImport = libraryImportSpecifier(
    "services",
    libraryReferenceMode,
    naming.projectRelPath(candidate.name),
  );
  return content(
    generatePath,
    fill(genericTmpl, {
      simpleDoc,
      descriptionDoc,
      typeImport: true,
      typeName,
      typeImportPath,
      servicesImport,
      interfaceName,
      className,
      datasourceType: candidate.datasourceType ?? "standard",
      finders: candidate.byFields.map((bf) => ({
        method: naming.finderMethod(bf.field),
        param: naming.fieldIdent(bf.field),
        paramType: toNative(bf.type),
        field: bf.field,
        typeName,
      })),
    }),
  );
};

const renderCustom = (
  entry: CustomServiceEntry,
  opts: EmitOptions,
): GenerateEntry => {
  const { naming, simpleDoc, descriptionDoc } = opts;
  const className = entry.name;
  const interfaceName = `I${className}`;
  return content(
    resolveCustomGeneratePath(entry, naming, naming.byFeature),
    fill(customStubTmpl, {
      simpleDoc,
      descriptionDoc,
      interfaceName,
      className,
      hasMethods: entry.methods.length > 0,
      methods: entry.methods.map((name) => ({ name })),
    }),
  );
};

const renderIndex = (
  generics: ServiceCandidate[],
  customs: CustomServiceEntry[],
  opts: EmitOptions,
): GenerateEntry[] => {
  const { naming } = opts;
  const entries: GenerateEntry[] = [];
  if (generics.length > 0) {
    const sorted = [...generics].sort((a, b) =>
      naming.serviceClassName(a.name).localeCompare(naming.serviceClassName(b.name)),
    );
    entries.push(
      content(
        "index.ts",
        fill(indexTmpl, {
          types: sorted.map((c) => ({
            className: naming.serviceClassName(c.name),
            fileBase: naming.fileBase(c.name),
          })),
        }),
      ),
    );
  }
  const customDirEntries = customs.filter(
    (e) => !e.module || !e.module.startsWith("."),
  );
  if (customDirEntries.length > 0) {
    const sorted = [...customDirEntries].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    entries.push(
      content(
        "../custom/index.ts",
        fill(indexTmpl, {
          types: sorted.map((e) => ({
            className: e.name,
            fileBase: naming.casedFileStem(e.name),
          })),
        }),
      ),
    );
  }
  return entries;
};

const generateFrom = (
  deterministic: IDeterministic,
  settings: Record<string, string>,
): GenerateEntry[] => {
  const opts = emitOptions(settings);
  const { generics, customs } = deterministic.services;
  const entries: GenerateEntry[] = [
    ...generics.map((c) => renderGeneric(c, opts)),
    ...customs.map((c) => renderCustom(c, opts)),
  ];
  if (opts.createIndex) entries.push(...renderIndex(generics, customs, opts));
  return entries;
};

export const generate = async (
  ctx: GenerateContext,
): Promise<GenerateEntry[]> => {
  await ctx.reader.read(SERVICES_YAML);
  const naming = servicePaths(ctx.settings);
  return generateFrom(
    await DeterministicParser(ctx.reader).parse(ctx.settings, {
      serviceClassName: naming.serviceClassName,
    }),
    ctx.settings,
  );
};
