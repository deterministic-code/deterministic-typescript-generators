import { parseDatasourceTypes } from "./parse-datasource-types.ts";
import { configKnobsFromSettings } from "./generate-settings-options.ts";
import { makeGenerate, type GenerateContext } from "./make-generate.ts";
import type { SettingsDict } from "../../settings-dict.ts";

export interface DatasourceGenerateContext extends GenerateContext {
  inputs: { all(): Promise<{ datasourceYamlText: string }> };
  settings: SettingsDict;
}

/** Build a self-describing catalog-runner `generate` for a datasource step (types / validators / tests): read the datasource YAML from the folder inputs and render via the language generator's `createGenerator`. The generated paths are output-root-relative (bare when flat, `features/<dir>/` under by-feature); the runner's `--output` (from `outputFor`) supplies the step's artifact directory. Mirrors `makeViewGenerate`. */
export function makeDatasourceGenerate<C>(
  createGenerator: () => { generate: (config: C) => unknown },
  language: string,
) {
  return makeGenerate(
    async ({ inputs, settings }: DatasourceGenerateContext) => {
      const { datasourceYamlText } = await inputs.all();
      const config = {
        language,
        datasourceTypes: parseDatasourceTypes(datasourceYamlText, settings),
        settings,
        ...configKnobsFromSettings(settings, language),
      };
      // dynamic loader→SDK boundary: the built config bag is the generator's own config shape.
      const files = createGenerator().generate(config as unknown as C) as {
        path: string;
        content: string;
      }[];
      return { files };
    },
  );
}
