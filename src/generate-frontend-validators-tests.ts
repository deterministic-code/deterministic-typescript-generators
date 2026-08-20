import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import type { GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import { frontendViewValidatorPaths } from "./common/paths.ts";
import { generate as generateViewTypeValidatorsTests } from "./generate-view-type-validators-tests.ts";
import { referencesBackend } from "./inline-inherited.ts";

export const generate = async (
  ctx: GenerateContext,
): Promise<GenerateEntry[]> =>
  generateViewTypeValidatorsTests(
    ctx,
    frontendViewValidatorPaths(
      ctx.settings,
      referencesBackend(ctx.settings),
    ),
  );
