export type CaseFormat = "Camel" | "Pascal" | "Snake" | "Kebab" | "Auto";

export type LanguageCasing = {
  fileFormat: Exclude<CaseFormat, "Auto">;
  classFormat: Exclude<CaseFormat, "Auto">;
  fieldFormat: Exclude<CaseFormat, "Auto">;
  dirFormat: Exclude<CaseFormat, "Auto">;
};

const typescriptCasing: LanguageCasing = {
  fileFormat: "Kebab",
  classFormat: "Pascal",
  fieldFormat: "Snake",
  dirFormat: "Kebab",
};

export const languages = {
  typescript: { casing: typescriptCasing },
  javascript: { casing: typescriptCasing },
  python: {
    casing: {
      fileFormat: "Snake",
      classFormat: "Pascal",
      fieldFormat: "Snake",
      dirFormat: "Snake",
    },
  },
  java: {
    casing: {
      fileFormat: "Pascal",
      classFormat: "Pascal",
      fieldFormat: "Camel",
      dirFormat: "Pascal",
    },
  },
  csharp: {
    casing: {
      fileFormat: "Pascal",
      classFormat: "Pascal",
      fieldFormat: "Pascal",
      dirFormat: "Pascal",
    },
  },
  rust: {
    casing: {
      fileFormat: "Snake",
      classFormat: "Pascal",
      fieldFormat: "Snake",
      dirFormat: "Snake",
    },
  },
} as const satisfies Record<string, { casing: LanguageCasing }>;

export type LanguageName = keyof typeof languages;

const ALIAS: Record<string, LanguageName> = {
  ts: "typescript",
  js: "javascript",
  py: "python",
  cs: "csharp",
  "c#": "csharp",
  rs: "rust",
};

export const languageFor = (name: string): LanguageName => {
  const key = name.toLowerCase();
  if (key in languages) return key as LanguageName;
  const aliased = ALIAS[key];
  if (aliased !== undefined) return aliased;
  throw new Error(
    `unknown language "${name}". Valid: ${Object.keys(languages).join(", ")}.`,
  );
};

export const casingFor = (language: string): LanguageCasing =>
  languages[languageFor(language)].casing;
