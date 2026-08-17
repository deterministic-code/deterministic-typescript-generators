import { caseOptionsFromSettings } from "./ts-codegen-naming.ts";
import { datasourceSettingsForSettings } from "./ts-datasource-settings.ts";
import { resolveLibraryReferenceMode } from "../../read-settings.ts";
import {
  settingsStr,
  settingsBool,
  languageEntryFromDict,
  type SettingsDict,
} from "../../settings-dict.ts";
import {
  datasourceTestsGenerateFromSchema,
  datasourceTestsGenerator,
} from "../../codegen-context.ts";
import { makeGenerate } from "./make-generate.ts";
import { parseDatasourceTypes } from "./parse-datasource-types.ts";
import type {
  DatasourceTypesGenerateConfig,
  GeneratedFile,
} from "./datasource-types-generate-types.ts";

/** The flat settings contract every knob is read off — the language-neutral `SettingsDict`. */
type ResolvedSettings = SettingsDict;

type GenerateConfig = { settings: ResolvedSettings; language: string };

/** The project's resolved library-reference mode for `language` — the explicit `languages.<lang>.library_reference_mode` if set, else the language default. */
export function libraryReferenceModeFromSettings(
  settings: SettingsDict,
  language: string,
): string {
  return resolveLibraryReferenceMode(
    { [language]: languageEntryFromDict(settings, language) },
    language,
  );
}

/** Resolve the settings-driven generation knobs each generator reads off `config` (comment style, library-reference mode, index/version). Undefined settings are omitted so the generator's own DEFAULT_GENERATE_OPTIONS stay authoritative. */
export function configKnobsFromSettings(
  settings: ResolvedSettings,
  language: string,
) {
  const knobs: Record<string, unknown> = {
    libraryReferenceMode: libraryReferenceModeFromSettings(settings, language),
  };
  const organizeByFeature = settingsStr(settings, "other.organize_by_feature");
  if (organizeByFeature !== undefined)
    knobs.organizeByFeature = organizeByFeature === "true";
  const style = settingsStr(settings, "comments");
  if (style !== undefined) knobs.style = style;
  const createIndex = settingsStr(settings, "codegen.create_index");
  if (createIndex !== undefined) knobs.createIndex = createIndex === "true";
  const schemaVersion = settingsStr(settings, "codegen.schema_version");
  if (schemaVersion !== undefined) knobs.schemaVersion = schemaVersion;
  return knobs;
}

/** Datasource-type generate options read off `settings.datasource`: id representation, datetime/uuid reprs, and whether a separate uuid column is carried (only when the id is not itself a uuid). */
export function datasourceOptionsFromSettings(settings: ResolvedSettings) {
  const ds = datasourceSettingsForSettings(settings);
  return {
    idType: ds.idType,
    datetime: ds.datetimeRepr,
    uuid: ds.uuidRepr,
    withUuidColumn: ds.withUuidColumn,
  };
}

/** Datasource-validator generate options: the id representation plus the datetime repr. */
export function validatorOptionsFromSettings(settings: ResolvedSettings) {
  const ds = datasourceSettingsForSettings(settings);
  return {
    idType: ds.idType,
    datetime: ds.datetimeRepr,
  };
}

/** Every datasource-tests dialect exposes the same `generateFromSchema` (colocated unit tests) and `createGenerator` tail — only the module's `generateForTable` and `defaultGenerateOptions` differ. This factory builds both from those two locals so the dialect files carry no boilerplate tail. */
export function datasourceTestsModule({
  generateForTable,
  defaultGenerateOptions,
}: {
  generateForTable: Parameters<typeof datasourceTestsGenerator>[0];
  defaultGenerateOptions: Record<string, unknown>;
}) {
  const base = datasourceTestsGenerator(generateForTable);
  return {
    generateFromSchema: datasourceTestsGenerateFromSchema(generateForTable),
    createGenerator: () => ({
      generate: (config: GenerateConfig) =>
        base().generate({
          ...defaultGenerateOptions,
          ...testCasingOptionsFromSettings(config),
          ...config,
        }),
    }),
  };
}

export interface DatasourceTypesGenerateInput {
  inputs: { all: () => Promise<{ datasourceYamlText: string }> };
  settings: ResolvedSettings;
}

/** Every datasource-types dialect exposes the same `render`/`createGenerator`/self-describing `generate` tail — only its `baseGenerate` (dialect renderer), `defaultGenerateOptions`, and `language` differ. This factory builds all three from those, so the dialect files carry no boilerplate tail: `render` merges defaults + datasource-from-settings under the dispatched config, and `generate` parses the folder's datasource YAML and applies the language's settings knobs. */
export function datasourceTypesModule({
  baseGenerate,
  defaultGenerateOptions,
  language,
}: {
  baseGenerate: { generate: (config: Record<string, unknown>) => GeneratedFile[] };
  defaultGenerateOptions: object;
  language: string;
}) {
  const render = (config: DatasourceTypesGenerateConfig): GeneratedFile[] =>
    baseGenerate.generate({
      ...defaultGenerateOptions,
      ...datasourceOptionsFromSettings(config.settings),
      ...config,
    });
  return {
    render,
    createGenerator: () => ({ generate: render }),
    generate: makeGenerate(
      async ({ inputs, settings }: DatasourceTypesGenerateInput) => ({
        files: render({
          language,
          datasourceTypes: parseDatasourceTypes(
            (await inputs.all()).datasourceYamlText,
            settings,
          ),
          settings,
          ...configKnobsFromSettings(settings, language),
        }),
      }),
    ),
  };
}

/** The layout label reported for a step's generate: `by-feature` when `organizeByFeature` is set, else `by-business-concern`. */
export function organizeLayoutFromSettings(settings: ResolvedSettings) {
  return settingsBool(settings, "other.organize_by_feature")
    ? "by-feature"
    : "by-business-concern";
}

/** The lone datetime-repr option most view/validator generators carry off `settings.datasource`. */
export function datetimeOptionFromSettings(settings: ResolvedSettings) {
  return { datetime: datasourceSettingsForSettings(settings).datetimeRepr };
}

/** The shared `createGenerator` tail for TS view/view-validator generators: bind the imports adapter, then merge DEFAULT_GENERATE_OPTIONS + datetime-from-settings under the dispatched config. */
export function datetimeMergeGenerator<Imports>(
  baseCreateGenerator: (imports: Imports) => { generate: (config: any) => unknown },
  imports: Imports,
  defaultGenerateOptions: Record<string, unknown>,
) {
  const base = baseCreateGenerator(imports);
  return {
    generate: (config: { settings: ResolvedSettings }) =>
      base.generate({
        ...defaultGenerateOptions,
        ...datetimeOptionFromSettings(config.settings),
        ...config,
      }),
  };
}

/** Resolved casing formats for the test generators, which read casing off `opts` (not `ctx.names`): the shared settings→casing bridge plus the datetime repr. */
export function testCasingOptionsFromSettings(config: GenerateConfig) {
  const ds = datasourceSettingsForSettings(config.settings);
  return {
    ...caseOptionsFromSettings(config.settings, config.language),
    datetime: ds.datetimeRepr,
    idType: ds.idType,
  };
}
