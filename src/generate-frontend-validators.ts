import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import type { GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import { FRONTEND_VIEW_VALIDATOR_DIR } from "./import-generator.ts";
import { generate as generateViewTypeValidators } from "./generate-view-type-validators.ts";
import { referencesBackend } from "./inline-inherited.ts";
import {
  indexTmpl,
  schemaInheritTmpl,
  schemaStandaloneTmpl,
  schemaUnionTmpl,
  typeTmpl,
} from "./resources/frontend-validators.ts";

export const generate = async (
  ctx: GenerateContext,
): Promise<GenerateEntry[]> => {
  const referenceBackendType = referencesBackend(ctx.settings);
  return generateViewTypeValidators(ctx, {
    referenceBackendType,
    templates: {
      typeTmpl,
      indexTmpl,
      schemaUnionTmpl,
      schemaStandaloneTmpl,
      schemaInheritTmpl,
    },
    basePath: FRONTEND_VIEW_VALIDATOR_DIR,
    datasourceBasePath: referenceBackendType
      ? "types/generated/datasource/validators"
      : FRONTEND_VIEW_VALIDATOR_DIR,
  });
};
