import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import type { GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import { frontendViewPaths } from "./common/paths.ts";
import { generateViewTypes } from "./emit-view-types.ts";

export const generate = async (
  ctx: GenerateContext,
): Promise<GenerateEntry[]> =>
  generateViewTypes(ctx, frontendViewPaths(ctx.settings));
