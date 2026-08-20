import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import type { GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import { frontendViewPaths } from "./common/paths.ts";
import { generate as generateViewTypesTests } from "./generate-view-types-tests.ts";
import { referencesBackend } from "./inline-inherited.ts";

export const generate = async (
  ctx: GenerateContext,
): Promise<GenerateEntry[]> => {
  const referenceBackendType = referencesBackend(ctx.settings);
  return generateViewTypesTests(
    ctx,
    frontendViewPaths(ctx.settings, referenceBackendType),
    referenceBackendType,
  );
};
