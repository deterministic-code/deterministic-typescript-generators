import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import type { GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import { frontendViewPaths } from "./common/paths.ts";
import { generateViewTypes } from "./emit-view-types.ts";
import { referencesBackend } from "./inline-inherited.ts";
import { indexTmpl, typeTmpl } from "./resources/frontend-types.ts";

export const generate = async (
  ctx: GenerateContext,
): Promise<GenerateEntry[]> => {
  const referenceBackendType = referencesBackend(ctx.settings);
  return generateViewTypes(
    ctx,
    frontendViewPaths(ctx.settings, referenceBackendType),
    {
      referenceBackendType,
      templates: { typeTmpl, indexTmpl },
    },
  );
};
