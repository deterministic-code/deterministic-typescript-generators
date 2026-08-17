import {
  camelCase,
  kebabCase,
  pascalCase,
  snakeCase,
} from "change-case";
import type { SettingsDict } from "./generate-context.ts";
import { settingsBool, settingsStr } from "./settings.ts";

const IDENT_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

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

export const typescriptNaming = (settings: SettingsDict): ArtifactNaming => {
  const fileCase = convertFor(
    settings,
    "languages.typescript.casing.file_names",
    kebabCase,
  );
  const classCase = convertFor(
    settings,
    "languages.typescript.casing.types",
    pascalCase,
  );
  const fieldCase = convertFor(
    settings,
    "languages.typescript.casing.fields",
    snakeCase,
  );
  const dirCase = convertFor(
    settings,
    "languages.typescript.casing.directories",
    kebabCase,
  );
  const byFeature = settingsBool(settings, "other.organize_by_feature");
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
    fieldIdent: (field) => {
      const name = fieldCase(field);
      return IDENT_RE.test(name) ? name : JSON.stringify(name);
    },
    filePath,
    projectRelPath: (entity) =>
      byFeature
        ? filePath(entity)
        : `types/generated/datasource/${filePath(entity)}`,
  };
};
