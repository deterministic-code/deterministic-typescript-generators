import npmPluralize from "pluralize";

export type CaseFormat = "Camel" | "Pascal" | "Snake" | "Kebab" | "Auto";

export interface LanguageCasing {
  fileFormat: CaseFormat;
  classFormat: CaseFormat;
  fieldFormat: CaseFormat;
  dirFormat: CaseFormat;
}

type LanguageKey =
  | "typescript"
  | "javascript"
  | "python"
  | "java"
  | "csharp"
  | "rust";

export const CASE_FORMATS: readonly CaseFormat[] = [
  "Camel",
  "Pascal",
  "Snake",
  "Kebab",
  "Auto",
];

export const LANGUAGE_CASING_CONVENTIONS: Record<LanguageKey, LanguageCasing> =
  {
    typescript: {
      fileFormat: "Kebab",
      classFormat: "Pascal",
      fieldFormat: "Snake",
      dirFormat: "Kebab",
    },
    javascript: {
      fileFormat: "Kebab",
      classFormat: "Pascal",
      fieldFormat: "Snake",
      dirFormat: "Kebab",
    },
    python: {
      fileFormat: "Snake",
      classFormat: "Pascal",
      fieldFormat: "Snake",
      dirFormat: "Snake",
    },
    java: {
      fileFormat: "Pascal",
      classFormat: "Pascal",
      fieldFormat: "Camel",
      dirFormat: "Pascal",
    },
    csharp: {
      fileFormat: "Pascal",
      classFormat: "Pascal",
      fieldFormat: "Pascal",
      dirFormat: "Pascal",
    },
    rust: {
      fileFormat: "Snake",
      classFormat: "Pascal",
      fieldFormat: "Snake",
      dirFormat: "Snake",
    },
  };

const LANGUAGE_ALIASES: Record<string, LanguageKey> = {
  ts: "typescript",
  typescript: "typescript",
  js: "javascript",
  javascript: "javascript",
  py: "python",
  python: "python",
  cs: "csharp",
  csharp: "csharp",
  "c#": "csharp",
  java: "java",
  rs: "rust",
  rust: "rust",
};

const normalizeCasingLanguage = (
  raw: string | null | undefined,
): LanguageKey | null => {
  if (!raw) return null;
  const key = String(raw)
    .toLowerCase()
    .replace(/[\s_\-]/g, "");
  return LANGUAGE_ALIASES[key] ?? null;
};

export const resolveAutoCasing = (
  language: string,
  options: LanguageCasing,
): LanguageCasing => {
  const key = normalizeCasingLanguage(language);
  if (!key) {
    throw new Error(
      `resolveAutoCasing: unknown language "${language}". Valid: ${Object.keys(LANGUAGE_CASING_CONVENTIONS).join(", ")}.`,
    );
  }
  const conventions = LANGUAGE_CASING_CONVENTIONS[key];
  const out: LanguageCasing = { ...options };
  if (out.fileFormat === "Auto") out.fileFormat = conventions.fileFormat;
  if (out.classFormat === "Auto") out.classFormat = conventions.classFormat;
  if (out.fieldFormat === "Auto") out.fieldFormat = conventions.fieldFormat;
  if (out.dirFormat === "Auto") out.dirFormat = conventions.dirFormat;
  return out;
};

export const tokenize = (name: string): string[] =>
  name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[\s_\-]+/)
    .filter((s) => s.length > 0)
    .map((s) => s.toLowerCase());

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export const toCase = (name: string, format: CaseFormat): string => {
  const tokens = tokenize(name);
  switch (format) {
    case "Camel":
      return tokens.map((t, i) => (i === 0 ? t : cap(t))).join("");
    case "Pascal":
      return tokens.map(cap).join("");
    case "Snake":
      return tokens.join("_");
    case "Kebab":
      return tokens.join("-");
    default:
      throw new Error(
        `Unknown case format: ${format}. Valid: ${CASE_FORMATS.join(", ")}.`,
      );
  }
};

export const kebab = (name: string): string => toCase(name, "Kebab");

export const snake = (name: string): string => toCase(name, "Snake");

export const pascal = (name: string): string => toCase(name, "Pascal");

/** Literal dash→underscore for already-kebab input; unlike snake() it does not re-tokenize camelCase. */
export const kebabToSnake = (name: string): string => name.replace(/-/g, "_");

const CASE_VARIANT_FORMATS: readonly CaseFormat[] = [
  "Camel",
  "Pascal",
  "Snake",
  "Kebab",
];

export const caseVariantsOf = (name: string): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const format of CASE_VARIANT_FORMATS) {
    const v = toCase(name, format);
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
};

export const snakeToCamel = (name: string): string =>
  name
    .split(/[_-]/)
    .map((part, i) => (i === 0 ? part : cap(part)))
    .join("");

export const snakeToPascal = (name: string): string => cap(snakeToCamel(name));

export const snakeToKebab = (name: string): string => name.replace(/_/g, "-");

/** camelCase/PascalCase → snake_case (tokenizes acronyms); identical to snake(). */
export const camelToSnake = (name: string): string => toCase(name, "Snake");

/** npm `pluralize` — irregulars + already-plural + -f/-fe. */
export const pluralize = (word: string): string => npmPluralize.plural(word);

export const kebabPlural = (name: string): string => {
  const kebabName = snakeToKebab(name);
  const parts = kebabName.split("-");
  parts[parts.length - 1] = pluralize(parts[parts.length - 1]!);
  return parts.join("-");
};

export const apiPathSegment = (entity: string): string =>
  kebabPlural(entity).replace(/_/g, "-");

export const camelPlural = (entity: string): string =>
  snakeToCamel(kebabPlural(entity).replace(/-/g, "_"));
