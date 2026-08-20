import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import type { GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import { frontendViewValidatorPaths } from "./common/paths.ts";
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
  return generateViewTypeValidators(
    ctx,
    frontendViewValidatorPaths(ctx.settings, referenceBackendType),
    {
      referenceBackendType,
      templates: {
        typeTmpl,
        indexTmpl,
        schemaUnionTmpl,
        schemaStandaloneTmpl,
        schemaInheritTmpl,
      },
    },
  );
};
