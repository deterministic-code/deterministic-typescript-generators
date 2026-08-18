import { posix } from "node:path";
import {
  camelCase,
  kebabCase,
  pascalCase,
  snakeCase,
} from "change-case";
import pluralize from "pluralize";
import type { SettingsDict } from "./generate-context.ts";
import { settingsBool, settingsStr } from "./settings.ts";

const IDENT_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const VARIANT_PREFIXES = ["update_", "create_"] as const;

type Convert = (name: string) => string;

const CONVERT: Record<string, Convert> = {
  camel: camelCase,
  pascal: pascalCase,
  snake: snakeCase,
  kebab: kebabCase,
};

const convertFor = (
  settings: SettingsDict,
  key: string,
  fallback: Convert,
): Convert => {
  const raw = settingsStr(settings, key)?.toLowerCase();
  if (!raw || raw === "auto") return fallback;
  return CONVERT[raw] ?? fallback;
};

type TsCasing = {
  fileCase: Convert;
  classCase: Convert;
  fieldCase: Convert;
  dirCase: Convert;
  byFeature: boolean;
};

const typescriptCasing = (settings: SettingsDict): TsCasing => ({
  fileCase: convertFor(
    settings,
    "languages.typescript.casing.file_names",
    kebabCase,
  ),
  classCase: convertFor(
    settings,
    "languages.typescript.casing.types",
    pascalCase,
  ),
  fieldCase: convertFor(
    settings,
    "languages.typescript.casing.fields",
    snakeCase,
  ),
  dirCase: convertFor(
    settings,
    "languages.typescript.casing.directories",
    kebabCase,
  ),
  byFeature: settingsBool(settings, "other.organize_by_feature"),
});

const asIdent = (fieldCase: Convert, field: string): string => {
  const name = fieldCase(field);
  return IDENT_RE.test(name) ? name : JSON.stringify(name);
};

const variantPrefix = (entity: string): string | undefined =>
  VARIANT_PREFIXES.find((p) => entity.startsWith(p));

const featureEntity = (entity: string): string => {
  const prefix = variantPrefix(entity);
  return prefix === undefined ? entity : entity.slice(prefix.length);
};

const importSpec = (fromFile: string, toFile: string): string => {
  const toNoExt = toFile.endsWith(".ts") ? toFile.slice(0, -3) : toFile;
  const rel = posix.relative(posix.dirname(fromFile), toNoExt);
  return rel.startsWith(".") ? rel : `./${rel}`;
};

const viewFileBase = (fileCase: Convert, byFeature: boolean, entity: string) =>
  fileCase(
    variantPrefix(entity) !== undefined
      ? entity
      : byFeature
        ? `${entity}_view`
        : entity,
  );

const namingCore = (c: TsCasing, fileBase: (e: string) => string) => ({
  ext: ".ts",
  byFeature: c.byFeature,
  className: (entity: string) => c.classCase(entity),
  fileBase,
  fieldName: (field: string) => c.fieldCase(field),
  fieldIdent: (field: string) => asIdent(c.fieldCase, field),
});

export type ArtifactNaming = {
  ext: string;
  byFeature: boolean;
  className: (entity: string) => string;
  fileBase: (entity: string) => string;
  fieldName: (field: string) => string;
  fieldIdent: (field: string) => string;
  filePath: (entity: string) => string;
  projectRelPath: (entity: string) => string;
};

export type ViewImportKind = "view" | "datasource";
export type ViewValidatorImportKind =
  | "view-validator"
  | "datasource-validator";

export type ViewArtifactNaming = ArtifactNaming & {
  importSpecifier: (
    fromEntity: string,
    to: { entity: string; kind: ViewImportKind },
  ) => string;
};

export type ViewValidatorNaming = ArtifactNaming & {
  importSpecifier: (
    fromEntity: string,
    to: { entity: string; kind: ViewValidatorImportKind },
  ) => string;
};

export type ServiceImportKind = "view" | "datasource";

export type ServiceNaming = ArtifactNaming & {
  serviceClassName: (entity: string) => string;
  finderMethod: (field: string) => string;
  casedFileStem: (stem: string) => string;
  customStubPath: (className: string) => string;
  testPath: (entity: string) => string;
  featureEntityFromClass: (className: string) => string;
  importSpecifier: (
    fromEntity: string,
    to: { entity: string; kind: ServiceImportKind },
  ) => string;
};

const CUSTOM_SUFFIX_TOKENS = new Set(["service", "route"]);

/** HealthCheckService → health-check; bare "Service" → "". */
export const featureEntityFromClass = (className: string): string => {
  const tokens = className
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .replace(/[_\s]+/g, "-")
    .toLowerCase()
    .split("-")
    .filter(Boolean);
  if (tokens.length === 0) return "";
  const last = tokens[tokens.length - 1];
  if (tokens.length > 1 && CUSTOM_SUFFIX_TOKENS.has(last)) tokens.pop();
  return tokens.join("-");
};

export const typescriptNaming = (settings: SettingsDict): ArtifactNaming => {
  const c = typescriptCasing(settings);
  const fileBase = (entity: string) => c.fileCase(entity);
  const filePath = (entity: string) => {
    const file = `${fileBase(entity)}.ts`;
    return c.byFeature ? `features/${c.dirCase(entity)}/${file}` : file;
  };
  return {
    ...namingCore(c, fileBase),
    filePath,
    projectRelPath: (entity) =>
      c.byFeature
        ? filePath(entity)
        : `types/generated/datasource/${filePath(entity)}`,
  };
};

export const typescriptViewNaming = (
  settings: SettingsDict,
): ViewArtifactNaming => {
  const c = typescriptCasing(settings);
  const fileBase = (entity: string) =>
    viewFileBase(c.fileCase, c.byFeature, entity);
  const filePath = (entity: string) => {
    const file = `${fileBase(entity)}.ts`;
    return c.byFeature
      ? `features/${c.dirCase(featureEntity(entity))}/${file}`
      : file;
  };
  const viewSrc = (entity: string) =>
    c.byFeature ? filePath(entity) : `types/generated/views/${filePath(entity)}`;
  const dsSrc = (entity: string) =>
    c.byFeature
      ? `features/${c.dirCase(entity)}/${c.fileCase(entity)}.ts`
      : `types/generated/datasource/${c.fileCase(entity)}.ts`;
  return {
    ...namingCore(c, fileBase),
    filePath,
    projectRelPath: viewSrc,
    importSpecifier: (from, to) =>
      importSpec(
        viewSrc(from),
        to.kind === "view" ? viewSrc(to.entity) : dsSrc(to.entity),
      ),
  };
};

export const typescriptViewValidatorNaming = (
  settings: SettingsDict,
): ViewValidatorNaming => {
  const c = typescriptCasing(settings);
  const fileBase = (entity: string) =>
    viewFileBase(c.fileCase, c.byFeature, entity);
  const filePath = (entity: string) => {
    const base = fileBase(entity);
    return c.byFeature
      ? `features/${c.dirCase(featureEntity(entity))}/${base}.validator.ts`
      : `${base}.ts`;
  };
  const viewSrc = (entity: string) =>
    c.byFeature
      ? filePath(entity)
      : `types/generated/views/validators/${filePath(entity)}`;
  const dsSrc = (entity: string) =>
    c.byFeature
      ? `features/${c.dirCase(entity)}/${c.fileCase(entity)}.validator.ts`
      : `types/generated/datasource/validators/${c.fileCase(entity)}.ts`;
  return {
    ...namingCore(c, fileBase),
    filePath,
    projectRelPath: viewSrc,
    importSpecifier: (from, to) =>
      importSpec(
        viewSrc(from),
        to.kind === "view-validator" ? viewSrc(to.entity) : dsSrc(to.entity),
      ),
  };
};

export const typescriptServiceNaming = (
  settings: SettingsDict,
): ServiceNaming => {
  const c = typescriptCasing(settings);
  const fileBase = (entity: string) => c.fileCase(`${entity}_service`);
  const filePath = (entity: string) => {
    const file = `${fileBase(entity)}.ts`;
    return c.byFeature ? `features/${c.dirCase(entity)}/${file}` : file;
  };
  const serviceSrc = (entity: string) =>
    c.byFeature
      ? filePath(entity)
      : `services/generated/${filePath(entity)}`;
  const viewSrc = (entity: string) =>
    c.byFeature
      ? `features/${c.dirCase(featureEntity(entity))}/${viewFileBase(c.fileCase, c.byFeature, entity)}.ts`
      : `types/generated/views/${viewFileBase(c.fileCase, c.byFeature, entity)}.ts`;
  const dsSrc = (entity: string) =>
    c.byFeature
      ? `features/${c.dirCase(entity)}/${c.fileCase(entity)}.ts`
      : `types/generated/datasource/${c.fileCase(entity)}.ts`;
  const casedFileStem = (stem: string) => c.fileCase(stem);
  return {
    ...namingCore(c, fileBase),
    filePath,
    projectRelPath: serviceSrc,
    serviceClassName: (entity) => c.classCase(`${entity}_service`),
    finderMethod: (field) => camelCase(`find_by_${field}`),
    casedFileStem,
    featureEntityFromClass,
    testPath: (entity) => {
      const file = `${fileBase(entity)}.test.ts`;
      return c.byFeature
        ? `features/${c.dirCase(entity)}/__tests__/${file}`
        : file;
    },
    customStubPath: (className) => {
      const entity = featureEntityFromClass(className) || "shared";
      return `features/${entity}/custom/${casedFileStem(className)}.ts`;
    },
    importSpecifier: (from, to) =>
      importSpec(
        serviceSrc(from),
        to.kind === "view" ? viewSrc(to.entity) : dsSrc(to.entity),
      ),
  };
};

export type RouteNaming = ArtifactNaming & {
  routerFnName: (entity: string) => string;
  apiPath: (entity: string) => string;
  testPath: (entity: string) => string;
  customRouteFileBase: (name: string) => string;
  customStubPath: (className: string, fileBase: string) => string;
  serviceImport: (
    fromEntity: string,
    targetEntity: string,
    customSubdir: boolean,
  ) => string;
  validatorImport: (fromEntity: string, targetEntity: string) => string;
};

const pluralSnake = (entity: string): string => {
  const parts = entity.split(/[_-]/);
  parts[parts.length - 1] = pluralize.plural(parts[parts.length - 1]!);
  return parts.join("_");
};

export const typescriptRouteNaming = (
  settings: SettingsDict,
): RouteNaming => {
  const c = typescriptCasing(settings);
  const fileBase = (entity: string) => c.fileCase(pluralSnake(entity));
  const filePath = (entity: string) => {
    const file = `${fileBase(entity)}.ts`;
    return c.byFeature
      ? `features/${c.dirCase(featureEntity(entity))}/${file}`
      : file;
  };
  const routeSrc = (entity: string) =>
    c.byFeature ? filePath(entity) : `routes/generated/${filePath(entity)}`;
  const serviceSrc = (entity: string, customSubdir: boolean) => {
    if (c.byFeature) {
      const dir = c.dirCase(entity);
      const stem = c.fileCase(`${entity}_service`);
      return customSubdir
        ? `features/${dir}/custom/${stem}.ts`
        : `features/${dir}/${stem}.ts`;
    }
    return customSubdir
      ? `services/custom/${c.fileCase(`${entity}_service`)}.ts`
      : `services/generated/${c.fileCase(`${entity}_service`)}.ts`;
  };
  const validatorSrc = (entity: string) =>
    c.byFeature
      ? `features/${c.dirCase(featureEntity(entity))}/${viewFileBase(c.fileCase, c.byFeature, entity)}.validator.ts`
      : `types/generated/views/validators/${viewFileBase(c.fileCase, c.byFeature, entity)}.ts`;
  return {
    ...namingCore(c, fileBase),
    filePath,
    projectRelPath: routeSrc,
    routerFnName: (entity) => camelCase(pluralSnake(entity) + "_router"),
    apiPath: (entity) =>
      kebabCase(pluralSnake(entity)).replace(/_/g, "-"),
    testPath: (entity) => {
      const file = `${fileBase(entity)}.integration.test.ts`;
      return c.byFeature
        ? `features/${c.dirCase(featureEntity(entity))}/__tests__/${file}`
        : file;
    },
    customRouteFileBase: (name) => c.fileCase(`${name}_route`),
    customStubPath: (className, fileBaseName) => {
      const entity = featureEntityFromClass(className) || "shared";
      return `features/${entity}/custom/${fileBaseName}.ts`;
    },
    serviceImport: (from, target, customSubdir) =>
      importSpec(routeSrc(from), serviceSrc(target, customSubdir)),
    validatorImport: (from, target) =>
      importSpec(routeSrc(from), validatorSrc(target)),
  };
};
