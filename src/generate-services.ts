import {
  datasourceSettings,
  nativeFieldType,
  type DatasourceSettings,
} from "./common/datasource-settings.ts";
import { commentStyle, type CommentStyle } from "./common/doc-comment.ts";
import { fill } from "./common/fill.ts";
import type { GenerateContext, SettingsDict } from "./common/generate-context.ts";
import { content, type GenerateEntry } from "./common/generate-entry.ts";
import {
  typescriptServiceNaming,
  type ServiceNaming,
} from "./common/naming.ts";
import {
  loadServices,
  type CustomServiceEntry,
  type ServiceCandidate,
} from "./common/parse-services.ts";
import { settingsStr } from "./common/settings.ts";
import { libraryImportSpecifier } from "./library-import.ts";
import {
  customStubTmpl,
  genericTmpl,
  indexTmpl,
} from "./resources/services.ts";

type EmitOptions = {
  ds: DatasourceSettings;
  naming: ServiceNaming;
  style: CommentStyle;
  libraryReferenceMode: string | undefined;
  createIndex: boolean;
};

const emitOptions = (settings: SettingsDict): EmitOptions => {
  const naming = typescriptServiceNaming(settings);
  const createIndex = settingsStr(settings, "codegen.create_index");
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
  };
};

const moduleParts = (mod: string): string[] => {
  const parts = mod.split("/").filter((p) => p !== "" && p !== ".");
  while (parts.length && parts[0] === "..") parts.shift();
  return parts;
};

export const resolveCustomGeneratePath = (
  entry: CustomServiceEntry,
  naming: ServiceNaming,
  byFeature: boolean,
): string => {
  const fileBase = naming.casedFileStem(entry.name);
  const mod = entry.module;

  if (byFeature) {
    if (!mod || !mod.startsWith(".")) return naming.customStubPath(entry.name);
    if (mod.startsWith("./services/") || mod.startsWith("./routes/")) {
      return naming.customStubPath(entry.name);
    }
    const parts = moduleParts(mod);
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
  const parts = moduleParts(mod);
  if (parts[0] === "services") parts.shift();
  return `../${parts.join("/")}.ts`;
};

const docFlags = (style: CommentStyle) => ({
  simpleDoc: style === "simple",
  descriptionDoc: style === "description",
});

const renderGeneric = (
  candidate: ServiceCandidate,
  opts: EmitOptions,
): GenerateEntry => {
  const { naming, style, ds, libraryReferenceMode } = opts;
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
      ...docFlags(style),
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
        paramType: nativeFieldType(ds, { type: bf.type }),
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
  const { naming, style } = opts;
  const className = entry.name;
  const interfaceName = `I${className}`;
  return content(
    resolveCustomGeneratePath(entry, naming, naming.byFeature),
    fill(customStubTmpl, {
      ...docFlags(style),
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

export const generate = async (
  ctx: GenerateContext,
): Promise<GenerateEntry[]> => {
  const opts = emitOptions(ctx.settings);
  const { generics, customs } = await loadServices(ctx.reader, {
    idType: opts.ds.idType,
    serviceClassName: opts.naming.serviceClassName,
  });
  const entries: GenerateEntry[] = [
    ...generics.map((c) => renderGeneric(c, opts)),
    ...customs.map((c) => renderCustom(c, opts)),
  ];
  if (opts.createIndex) entries.push(...renderIndex(generics, customs, opts));
  return entries;
};
