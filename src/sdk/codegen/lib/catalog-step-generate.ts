import { makeGenerate, type GenerateContext } from "./make-generate.ts";
import type { GenerateEntry } from "./generate-result.ts";
import type { SettingsDict } from "../../settings-dict.ts";

interface CatalogInputs {
  all(): Promise<Record<string, string>>;
}

interface CatalogContext extends GenerateContext {
  inputs: CatalogInputs;
  settings: SettingsDict;
}

/** The standard-inputs bag `catalogStepGenerate` hands the family dispatcher: the primary YAML as `yamlText`, the resolved siblings, settings, and the fixed language override. */
interface CatalogStepInput {
  yamlText: string;
  viewYamlText: string;
  datasourceYamlText: string;
  datasourceSeedsYamlText: string | null;
  routesYamlText: string;
  servicesYamlText: string;
  settings: SettingsDict;
  overrides: { language: string };
}

interface StepConfig<E> {
  dispatchStep: (generator: E) => (config: CatalogStepInput) => unknown;
  generator: E;
  language: string;
  primary: string;
}

/** Adapt a create-scripts family dispatcher to the catalog `{ inputs, settings }` contract for a fixed language, routing through the common `makeGenerate` core. Reads the whole `deterministic/` folder and hands the dispatcher the standard inputs with `primary` (the step's own YAML key, e.g. `servicesYamlText` or `routesYamlText`) as `yamlText`; the dispatcher's own `resolveStepInputs` picks the siblings it needs and ignores the rest, and its `{ files }` result is normalized to `GenerateEntry[]` by the core. */
export function catalogStepGenerate<E>(
  { dispatchStep, generator, language, primary }: StepConfig<E>,
  ctx: CatalogContext,
): Promise<GenerateEntry[]> {
  return makeGenerate(async ({ inputs, settings }: CatalogContext) => {
    const all = await inputs.all();
    const result = (await dispatchStep(generator)({
      yamlText: all[primary],
      viewYamlText: all.viewYamlText,
      datasourceYamlText: all.datasourceYamlText,
      datasourceSeedsYamlText: all.datasourceSeedsYamlText,
      routesYamlText: all.routesYamlText,
      servicesYamlText: all.servicesYamlText,
      settings,
      overrides: { language },
    })) as { files: { path: string; content: string }[] };
    return { files: result.files };
  })(ctx);
}
