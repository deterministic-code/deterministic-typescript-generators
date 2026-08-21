import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import type { GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import { FRONTEND_VIEW_DIR } from "./import-generator.ts";
import { generate as generateViewTypesTests } from "./generate-view-types-tests.ts";
import { referencesBackend } from "./inline-inherited.ts";

export const generate = async (
  ctx: GenerateContext,
): Promise<GenerateEntry[]> => {
  const referenceBackendType = referencesBackend(ctx.settings);
  return generateViewTypesTests(
    ctx,
    FRONTEND_VIEW_DIR,
    referenceBackendType,
  );
};
