import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import type { GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import { FRONTEND_VIEW_VALIDATOR_DIR } from "./import-generator.ts";
import { generate as generateViewTypeValidatorsTests } from "./generate-view-type-validators-tests.ts";
import { referencesBackend } from "./inline-inherited.ts";

export const generate = async (
  ctx: GenerateContext,
): Promise<GenerateEntry[]> => {
  const referenceBackendType = referencesBackend(ctx.settings);
  return generateViewTypeValidatorsTests(
    ctx,
    FRONTEND_VIEW_VALIDATOR_DIR,
    referenceBackendType,
  );
};
