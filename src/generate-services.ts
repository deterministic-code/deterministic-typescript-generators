import { toNative } from "./base-type-converter.ts";
import { fill } from "@deterministic-code/generators-common/fill";
import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import { content, type GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
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
import { jsIdent } from "./common/default-casing.ts";
import {
  createImportGenerator,
  type TypeScriptImportGenerator,
} from "./import-generator.ts";
import {
  customStubTmpl,
  genericTmpl,
  indexTmpl,
} from "./resources/services.ts";

const serviceClassName = (entity: string): string => `${entity}_service`;
const serviceFileBase = (entity: string): string => `${entity}_service`;

const docTokens = (settings: Record<string, string>) => {
  const comments = settings["comments"];
  return {
    simpleDoc: comments !== "none" && comments !== "description",
    descriptionDoc: comments === "description",
  };
};

type EmitOptions = {
  imports: TypeScriptImportGenerator;
  simpleDoc: boolean;
  descriptionDoc: boolean;
  libraryReferenceMode: string | undefined;
  createIndexSetting: string | undefined;
};

const emitOptions = (settings: Record<string, string>): EmitOptions => ({
  imports: createImportGenerator(".", settings),
  ...docTokens(settings),
  libraryReferenceMode: settings["languages.typescript.library_reference_mode"],
  createIndexSetting: settings["codegen.create_index"],
});

const renderGeneric = (
  candidate: ServiceCandidate,
  opts: EmitOptions,
): GenerateEntry => {
  const { imports, simpleDoc, descriptionDoc, libraryReferenceMode } = opts;
  const typeName = candidate.name;
  const className = serviceClassName(candidate.name);
  const interfaceName = `I${className}`;
  const generatePath = imports.service(candidate.name);
  const typeImportPath = imports.spec(
    imports.serviceRel(candidate.name),
    candidate.kind === "datasource_type"
      ? imports.datasourceRel(candidate.name)
      : imports.viewRel(candidate.name),
  );
  const servicesImport = libraryImportSpecifier(
    "services",
    libraryReferenceMode,
    imports.serviceRel(candidate.name),
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
        method: `find_by_${bf.field}`,
        param: jsIdent(bf.field),
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
  const { imports, simpleDoc, descriptionDoc } = opts;
  const className = entry.name;
  const interfaceName = `I${className}`;
  return content(
    imports.serviceCustom(entry.name, entry.module),
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
  imports: TypeScriptImportGenerator,
): GenerateEntry[] => {
  const entries: GenerateEntry[] = [];
  if (generics.length > 0) {
    const sorted = [...generics].sort((a, b) =>
      serviceClassName(a.name).localeCompare(serviceClassName(b.name)),
    );
    const index = imports.index(imports.service(sorted[0]!.name));
    if (index) {
      entries.push(
        content(
          index,
          fill(indexTmpl, {
            types: sorted.map((c) => ({
              className: serviceClassName(c.name),
              fileBase: serviceFileBase(c.name),
            })),
          }),
        ),
      );
    }
  }
  const customDirEntries = customs.filter(
    (e) => !e.module || !e.module.startsWith("."),
  );
  if (customDirEntries.length > 0) {
    const sorted = [...customDirEntries].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    const index = imports.index(imports.serviceCustom(sorted[0]!.name));
    if (index) {
      entries.push(
        content(
          index,
          fill(indexTmpl, {
            types: sorted.map((e) => ({
              className: e.name,
              fileBase: e.name,
            })),
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
  const { generics, customs } = deterministic.services;
  const entries: GenerateEntry[] = [
    ...generics.map((c) => renderGeneric(c, opts)),
    ...customs.map((c) => renderCustom(c, opts)),
  ];
  if (
    opts.createIndexSetting === undefined ||
    opts.createIndexSetting === "true"
  ) {
    entries.push(...renderIndex(generics, customs, opts.imports));
  }
  return entries;
};

export const generate = async (
  ctx: GenerateContext,
): Promise<GenerateEntry[]> => {
  await ctx.reader.read(SERVICES_YAML);
  return generateFrom(
    await DeterministicParser(ctx.reader).parse(ctx.settings, {
      serviceClassName,
    }),
    ctx.settings,
  );
};
