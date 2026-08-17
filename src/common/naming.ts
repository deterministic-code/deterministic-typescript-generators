import { posix } from "node:path";
import {
  camelCase,
  kebabCase,
  pascalCase,
  snakeCase,
} from "change-case";
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

const fieldIdent = (fieldCase: Convert, field: string): string => {
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

export type ViewArtifactNaming = ArtifactNaming & {
  importSpecifier: (
    fromEntity: string,
    to: { entity: string; kind: ViewImportKind },
  ) => string;
};

export const typescriptNaming = (settings: SettingsDict): ArtifactNaming => {
  const { fileCase, classCase, fieldCase, dirCase, byFeature } =
    typescriptCasing(settings);
  const fileBase = (entity: string): string => fileCase(entity);
  const filePath = (entity: string): string => {
    const file = `${fileBase(entity)}.ts`;
    return byFeature ? `features/${dirCase(entity)}/${file}` : file;
  };
  return {
    ext: ".ts",
    byFeature,
    className: (entity) => classCase(entity),
    fileBase,
    fieldName: (field) => fieldCase(field),
    fieldIdent: (field) => fieldIdent(fieldCase, field),
    filePath,
    projectRelPath: (entity) =>
      byFeature
        ? filePath(entity)
        : `types/generated/datasource/${filePath(entity)}`,
  };
};

export const typescriptViewNaming = (
  settings: SettingsDict,
): ViewArtifactNaming => {
  const { fileCase, classCase, fieldCase, dirCase, byFeature } =
    typescriptCasing(settings);
  const fileBase = (entity: string): string => {
    const stem =
      variantPrefix(entity) !== undefined
        ? entity
        : byFeature
          ? `${entity}_view`
          : entity;
    return fileCase(stem);
  };
  const filePath = (entity: string): string => {
    const file = `${fileBase(entity)}.ts`;
    return byFeature
      ? `features/${dirCase(featureEntity(entity))}/${file}`
      : file;
  };
  const viewSrc = (entity: string): string =>
    byFeature ? filePath(entity) : `types/generated/views/${filePath(entity)}`;
  const datasourceSrc = (entity: string): string => {
    const file = `${fileCase(entity)}.ts`;
    return byFeature
      ? `features/${dirCase(entity)}/${file}`
      : `types/generated/datasource/${file}`;
  };
  return {
    ext: ".ts",
    byFeature,
    className: (entity) => classCase(entity),
    fileBase,
    fieldName: (field) => fieldCase(field),
    fieldIdent: (field) => fieldIdent(fieldCase, field),
    filePath,
    projectRelPath: viewSrc,
    importSpecifier: (fromEntity, to) =>
      importSpec(
        viewSrc(fromEntity),
        to.kind === "view" ? viewSrc(to.entity) : datasourceSrc(to.entity),
      ),
  };
};
