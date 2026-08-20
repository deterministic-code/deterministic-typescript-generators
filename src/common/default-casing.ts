import {
  CasingFactory,
  LANGUAGE_CASING_DEFAULTS,
  casingOverridesFromSettings,
  type ICasingStrategy,
  type LanguageCasingDefaults,
} from "@deterministic-code/generators-common/casing-strategy";

export const GENERATOR_LANGUAGE = "typescript";

export const DEFAULT_CASING: LanguageCasingDefaults =
  LANGUAGE_CASING_DEFAULTS.typescript;

const IDENT_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const VARIANT_PREFIXES = ["update_", "create_"] as const;

const featureEntity = (entity: string): string => {
  const prefix = VARIANT_PREFIXES.find((p) => entity.startsWith(p));
  return prefix === undefined ? entity : entity.slice(prefix.length);
};

export type PackCasing = ICasingStrategy & {
  byFeature: boolean
  fileBase: (stem: string) => string
  directory: (entity: string) => string
  filePath: (stem: string) => string
  fieldIdent: (field: string) => string
  serviceClassName: (entity: string) => string
  finderMethod: (field: string) => string
};

/** Language defaults + settings overrides. Generators call this — not paths.ts. */
export const createCasing = (
  settings: Record<string, string>,
): PackCasing => {
  const casing = CasingFactory.create(
    GENERATOR_LANGUAGE,
    casingOverridesFromSettings(settings, GENERATOR_LANGUAGE),
  );
  const byFeature = settings["other.organize_by_feature"] === "true";
  const fileBase = (stem: string): string => casing.convertFileName(stem);
  const directory = (entity: string): string =>
    casing.convertDirectories(featureEntity(entity));
  const filePath = (stem: string): string => {
    const file = `${fileBase(stem)}.ts`;
    return byFeature ? `features/${directory(stem)}/${file}` : file;
  };
  const convertFields = (text: string): string => casing.convertFields(text);
  const fieldIdent = (field: string): string => {
    const name = convertFields(field);
    return IDENT_RE.test(name) ? name : JSON.stringify(name);
  };
  return {
    convertFileName: (text: string) => casing.convertFileName(text),
    convertTypes: (text: string) => casing.convertTypes(text),
    convertFields,
    convertDirectories: (text: string) => casing.convertDirectories(text),
    byFeature,
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
