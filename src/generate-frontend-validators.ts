import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import type { GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import { frontendViewValidatorPaths } from "./common/paths.ts";
import { generate as generateViewTypeValidators } from "./generate-view-type-validators.ts";

export const generate = async (
  ctx: GenerateContext,
): Promise<GenerateEntry[]> =>
  generateViewTypeValidators(ctx, frontendViewValidatorPaths(ctx.settings));
