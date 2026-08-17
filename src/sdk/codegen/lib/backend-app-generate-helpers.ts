import { makeGenerate, type GenerateContext } from "./make-generate.ts";
import { settingsStr } from "../../settings-dict.ts";
import type { GenerateEntry } from "./generate-result.ts";

type BackendAppDriver = (opts: {
  input: string;
  language: string;
  combined: boolean;
}) => Promise<GenerateEntry[]>;

export interface BackendAppGenerateContext extends GenerateContext {
  inputs: { dir: string };
}

/** Build the common `generate` for a `backend_app` language: derive `combined` from `application_tier`, then hand the language's whole-scaffold driver the resolved input dir. The driver reads its own settings + YAML from that dir and returns a CONTENT + PATCH entry mix, which `makeGenerate` validates. The driver is a local closure, never captured across an import cycle. */
export function makeBackendAppGenerate(
  driver: BackendAppDriver,
  language: string,
) {
  return makeGenerate(async ({ inputs, settings }: BackendAppGenerateContext) => {
    const combined = settingsStr(settings, "application_tier") === "full-stack";
    return driver({ input: inputs.dir, language, combined });
  });
}
