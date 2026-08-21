import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import type { GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import { Emit } from "./emit.ts";
import { generateViewTypes } from "./emit-view-types.ts";
import { referencesBackend } from "./inline-inherited.ts";
import { indexTmpl, typeTmpl } from "./resources/frontend-types.ts";

export const generate = async (
  ctx: GenerateContext,
): Promise<GenerateEntry[]> => {
  const referenceBackendType = referencesBackend(ctx.settings);
  const views = new Emit(ctx.settings).imports.frontend("src/types");
  return generateViewTypes(ctx, {
    referenceBackendType,
    templates: { typeTmpl, indexTmpl },
    basePath: views,
    datasourceBasePath: referenceBackendType
      ? "types/generated/datasource"
      : views,
  });
};
