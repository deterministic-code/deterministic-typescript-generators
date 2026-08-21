import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import type { GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import { FRONTEND_VIEW_DIR } from "./import-generator.ts";
import { generateViewTypes } from "./emit-view-types.ts";
import { referencesBackend } from "./inline-inherited.ts";
import { indexTmpl, typeTmpl } from "./resources/frontend-types.ts";

export const generate = async (
  ctx: GenerateContext,
): Promise<GenerateEntry[]> => {
  const referenceBackendType = referencesBackend(ctx.settings);
  return generateViewTypes(ctx, {
    referenceBackendType,
    templates: { typeTmpl, indexTmpl },
    basePath: FRONTEND_VIEW_DIR,
    datasourceBasePath: referenceBackendType
      ? "types/generated/datasource"
      : FRONTEND_VIEW_DIR,
  });
};
