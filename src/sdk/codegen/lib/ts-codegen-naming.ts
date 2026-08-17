import { CodegenNames } from "../../codegen-naming.ts";
import { CodegenLayout } from "../../codegen-layout.ts";
import {
  casingFromDict,
  settingsBool,
  settingsList,
  type SettingsDict,
} from "../../settings-dict.ts";
import type { CaseFormat } from "../../case.ts";

type NamesSettings = ConstructorParameters<typeof CodegenNames>[0];

/** Reconstruct the structured `{ languages, other, backend }` shape `CodegenNames`/`CodegenLayout` read, from the flat `SettingsDict` — the single settings-dict→naming bridge every casing/layout accessor funnels through. */
function namesSettingsFromDict(
  settings: SettingsDict,
  language: string,
): NamesSettings {
  return {
    languages: { [language]: { casing: casingFromDict(settings, language) } },
    other: { organizeByFeature: settingsBool(settings, "other.organize_by_feature") },
    backend: { languages: settingsList(settings, "backend.languages") },
  };
}

export interface NamesForOptions {
  language?: string;
  fileFormat?: CaseFormat;
  classFormat?: CaseFormat;
  fieldFormat?: CaseFormat;
  dirFormat?: CaseFormat;
  organizeByFeature?: boolean;
}

/** CodegenNames from a generic (possibly partial) generate-options object — the low-level opts→names adapter used by direct generator call sites and their unit tests. It shapes the opts into the `{ languages: { [lang]: { casing } }, other }` settings the constructor reads; Auto here resolves an omitted field to the language convention. This is NOT the settings path (that is `namesForSettings`, which reads the loader-resolved settings with no defaults). */
export function namesFor(opts: NamesForOptions): CodegenNames {
  const language = opts.language ?? "typescript";
  const settings = {
    languages: {
      [language]: {
        casing: {
          fileNames: opts.fileFormat ?? "Auto",
          types: opts.classFormat ?? "Auto",
          fields: opts.fieldFormat ?? "Auto",
          directories: opts.dirFormat ?? "Auto",
        },
      },
    },
    other: { organizeByFeature: opts.organizeByFeature === true },
  };
  return new CodegenNames(settings, language);
}

/** CodegenLayout (paths + dirs + imports) from a resolved generate-options object; feature dirs follow the resolved `names.dirFormat`. */
export function layoutFor(opts: NamesForOptions): CodegenLayout {
  return new CodegenLayout(namesFor(opts));
}

/** The single settings→naming bridge: CodegenNames straight from the loader-resolved `settings` (casing + `other.organizeByFeature`, never undefined — default-settings.yaml supplies every leaf), so no generator re-copies or re-defaults a knob. */
export function namesForSettings(
  settings: SettingsDict,
  language: string,
): CodegenNames {
  return new CodegenNames(namesSettingsFromDict(settings, language), language);
}

/** The single settings→layout bridge: CodegenLayout from the loader-resolved `settings`, so placement (incl. the multi-language-aware `migrationsPath`/`migrateDockerCopyPrefixes`) is derived from `settings.yaml` — never from a bare `layoutFor({})`. */
export function layoutForSettings(
  settings: SettingsDict,
  language: string,
): CodegenLayout {
  return new CodegenLayout(namesForSettings(settings, language));
}

/** The resolved `{fileFormat,classFormat,fieldFormat,dirFormat}` an generator that still threads a casing object needs — derived once from `settings`, Auto already resolved to the language convention. */
export function caseOptionsFromSettings(
  settings: SettingsDict,
  language: string,
): {
  fileFormat: CaseFormat;
  classFormat: CaseFormat;
  fieldFormat: CaseFormat;
  dirFormat: CaseFormat;
} {
  const names = namesForSettings(settings, language);
  return {
    fileFormat: names.fileFormat,
    classFormat: names.classFormat,
    fieldFormat: names.fieldFormat,
    dirFormat: names.dirFormat,
  };
}
