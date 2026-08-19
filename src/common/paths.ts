import { posix } from "node:path";
import type { SettingsDict } from "./generate-context.ts";
import { settingsBool } from "./settings.ts";

const IDENT_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const VARIANT_PREFIXES = ["update_", "create_"] as const;

export const ident = (name: string): string =>
  IDENT_RE.test(name) ? name : JSON.stringify(name);

export const importSpec = (fromFile: string, toFile: string): string => {
  const toNoExt = toFile.endsWith(".ts") ? toFile.slice(0, -3) : toFile;
  const rel = posix.relative(posix.dirname(fromFile), toNoExt);
  return rel.startsWith(".") ? rel : `./${rel}`;
};

/** Strip `.` / leading `..` from a YAML `module:` path so the remainder is project-relative. */
export const modulePathParts = (mod: string): string[] => {
  const parts = mod.split("/").filter((p) => p !== "" && p !== ".");
  while (parts.length && parts[0] === "..") parts.shift();
  return parts;
};

const variantPrefix = (entity: string): string | undefined =>
  VARIANT_PREFIXES.find((p) => entity.startsWith(p));

const featureEntity = (entity: string): string => {
  const prefix = variantPrefix(entity);
  return prefix === undefined ? entity : entity.slice(prefix.length);
};

const organizeByFeature = (settings: SettingsDict): boolean =>
  settingsBool(settings, "other.organize_by_feature");

export type ArtifactPaths = {
  byFeature: boolean;
  className: (entity: string) => string;
  fileBase: (entity: string) => string;
  fieldName: (field: string) => string;
  fieldIdent: (field: string) => string;
  filePath: (entity: string) => string;
  projectRelPath: (entity: string) => string;
};

export type ViewImportKind = "view" | "datasource";

export type ViewPaths = ArtifactPaths & {
  importSpecifier: (
    fromEntity: string,
    to: { entity: string; kind: ViewImportKind },
  ) => string;
};

export type ViewValidatorImportKind =
  | "view-validator"
  | "datasource-validator";

export type ViewValidatorPaths = ArtifactPaths & {
  importSpecifier: (
    fromEntity: string,
    to: { entity: string; kind: ViewValidatorImportKind },
  ) => string;
};

export type ServiceImportKind = "view" | "datasource";

export type ServicePaths = ArtifactPaths & {
  serviceClassName: (entity: string) => string;
  finderMethod: (field: string) => string;
  casedFileStem: (stem: string) => string;
  customStubPath: (className: string) => string;
  customProjectRelPath: (entity: string) => string;
  testPath: (entity: string) => string;
  importSpecifier: (
    fromEntity: string,
    to: { entity: string; kind: ServiceImportKind },
  ) => string;
};

export type RoutePaths = ArtifactPaths & {
  testPath: (entity: string) => string;
  customStubPath: (name: string) => string;
};

const core = (
  byFeature: boolean,
  fileBase: (entity: string) => string,
): Pick<
  ArtifactPaths,
  "byFeature" | "className" | "fileBase" | "fieldName" | "fieldIdent"
> => ({
  byFeature,
  className: (entity) => entity,
  fileBase,
  fieldName: (field) => field,
  fieldIdent: ident,
});

export const datasourcePaths = (settings: SettingsDict): ArtifactPaths => {
  const byFeature = organizeByFeature(settings);
  const fileBase = (entity: string) => entity;
  const filePath = (entity: string) => {
    const file = `${fileBase(entity)}.ts`;
    return byFeature ? `features/${entity}/${file}` : file;
  };
  return {
    ...core(byFeature, fileBase),
    filePath,
    projectRelPath: (entity) =>
      byFeature ? filePath(entity) : `types/generated/datasource/${filePath(entity)}`,
  };
};

export const viewPaths = (settings: SettingsDict): ViewPaths => {
  const byFeature = organizeByFeature(settings);
  const fileBase = (entity: string) => entity;
  const filePath = (entity: string) => {
    const file = `${fileBase(entity)}.ts`;
    return byFeature
      ? `features/${featureEntity(entity)}/${file}`
      : file;
  };
  const viewSrc = (entity: string) =>
    byFeature ? filePath(entity) : `types/generated/views/${filePath(entity)}`;
  const dsSrc = (entity: string) =>
    byFeature
      ? `features/${entity}/${entity}.ts`
      : `types/generated/datasource/${entity}.ts`;
  return {
    ...core(byFeature, fileBase),
    filePath,
    projectRelPath: viewSrc,
    importSpecifier: (from, to) =>
      importSpec(
        viewSrc(from),
        to.kind === "view" ? viewSrc(to.entity) : dsSrc(to.entity),
      ),
  };
};

export const viewValidatorPaths = (
  settings: SettingsDict,
): ViewValidatorPaths => {
  const byFeature = organizeByFeature(settings);
  const fileBase = (entity: string) => entity;
  const filePath = (entity: string) =>
    byFeature
      ? `features/${featureEntity(entity)}/${fileBase(entity)}.validator.ts`
      : `${fileBase(entity)}.ts`;
  const viewSrc = (entity: string) =>
    byFeature
      ? filePath(entity)
      : `types/generated/views/validators/${filePath(entity)}`;
  const dsSrc = (entity: string) =>
    byFeature
      ? `features/${entity}/${entity}.validator.ts`
      : `types/generated/datasource/validators/${entity}.ts`;
  return {
    ...core(byFeature, fileBase),
    filePath,
    projectRelPath: viewSrc,
    importSpecifier: (from, to) =>
      importSpec(
        viewSrc(from),
        to.kind === "view-validator" ? viewSrc(to.entity) : dsSrc(to.entity),
      ),
  };
};

export const servicePaths = (settings: SettingsDict): ServicePaths => {
  const byFeature = organizeByFeature(settings);
  const fileBase = (entity: string) => `${entity}_service`;
  const filePath = (entity: string) => {
    const file = `${fileBase(entity)}.ts`;
    return byFeature ? `features/${entity}/${file}` : file;
  };
  const serviceSrc = (entity: string) =>
    byFeature ? filePath(entity) : `services/generated/${filePath(entity)}`;
  const viewSrc = (entity: string) =>
    byFeature
      ? `features/${featureEntity(entity)}/${entity}.ts`
      : `types/generated/views/${entity}.ts`;
  const dsSrc = (entity: string) =>
    byFeature
      ? `features/${entity}/${entity}.ts`
      : `types/generated/datasource/${entity}.ts`;
  return {
    ...core(byFeature, fileBase),
    filePath,
    projectRelPath: serviceSrc,
    serviceClassName: (entity) => `${entity}_service`,
    finderMethod: (field) => `find_by_${field}`,
    casedFileStem: (stem) => stem,
    customStubPath: (className) =>
      `features/${className}/custom/${className}.ts`,
    customProjectRelPath: (entity) =>
      byFeature
        ? `features/${entity}/custom/${fileBase(entity)}.ts`
        : `services/custom/${fileBase(entity)}.ts`,
    testPath: (entity) => {
      const file = `${fileBase(entity)}.test.ts`;
      return byFeature
        ? `features/${entity}/__tests__/${file}`
        : file;
    },
    importSpecifier: (from, to) =>
      importSpec(
        serviceSrc(from),
        to.kind === "view" ? viewSrc(to.entity) : dsSrc(to.entity),
      ),
  };
};

export const routePaths = (settings: SettingsDict): RoutePaths => {
  const byFeature = organizeByFeature(settings);
  const fileBase = (entity: string) => entity;
  const filePath = (entity: string) => {
    const file = `${fileBase(entity)}.ts`;
    return byFeature ? `features/${entity}/${file}` : file;
  };
  const routeSrc = (entity: string) =>
    byFeature ? filePath(entity) : `routes/generated/${filePath(entity)}`;
  return {
    ...core(byFeature, fileBase),
    filePath,
    projectRelPath: routeSrc,
    testPath: (entity) => {
      const file = `${fileBase(entity)}.integration.test.ts`;
      return byFeature ? `features/${entity}/__tests__/${file}` : file;
    },
    customStubPath: (name) =>
      byFeature
        ? `features/${name}/custom/${name}_route.ts`
        : `../custom/${name}_route.ts`,
  };
};

export const frontendPaths = (_settings: SettingsDict) => ({
  validatorFile: (
    ds: string,
    entity: string,
    { test = false }: { test?: boolean },
  ): string => {
    const file = test ? "validators.test.ts" : "validators.ts";
    return `${ds}/${entity}/${file}`;
  },
});
