import {
  createCasingStrategy,
  type ICasingStrategy,
} from "@deterministic-code/generators-common/casing-strategy";

export const GENERATOR_LANGUAGE = "typescript";

const IDENT_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const VARIANT_PREFIXES = ["update_", "create_"] as const;

export const jsIdent = (name: string): string =>
  IDENT_RE.test(name) ? name : JSON.stringify(name);

const featureEntity = (entity: string): string => {
  const prefix = VARIANT_PREFIXES.find((p) => entity.startsWith(p));
  return prefix === undefined ? entity : entity.slice(prefix.length);
};

export type PackCasing = ICasingStrategy & {
  fileBase: (stem: string) => string
  directory: (entity: string) => string
  filePath: (stem: string) => string
  fieldIdent: (field: string) => string
  serviceClassName: (entity: string) => string
  finderMethod: (field: string) => string
};

/** Language defaults + settings overrides. Layout (by-feature) lives on ImportGenerator. */
export const createCasing = (
  settings: Record<string, string>,
): PackCasing => {
  const casing = createCasingStrategy(GENERATOR_LANGUAGE, settings);
  const fileBase = (stem: string): string => casing.convertFileName(stem);
  const directory = (entity: string): string =>
    casing.convertDirectories(featureEntity(entity));
  const filePath = (stem: string): string => `${fileBase(stem)}.ts`;
  const convertFields = (text: string): string => casing.convertFields(text);
  const fieldIdent = (field: string): string => jsIdent(convertFields(field));
  return {
    convertFileName: (text: string) => casing.convertFileName(text),
    convertTypes: (text: string) => casing.convertTypes(text),
    convertFields,
    convertDirectories: (text: string) => casing.convertDirectories(text),
    fileBase,
    directory,
    filePath,
    fieldIdent,
    serviceClassName: (entity: string) => casing.convertTypes(`${entity}_service`),
    finderMethod: (field: string) => `find_by_${convertFields(field)}`,
  };
};

export const defaultCasing = (
  settings: Record<string, string>,
): ICasingStrategy => createCasing(settings);
