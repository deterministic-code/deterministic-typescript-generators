import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import type { GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import { Emit } from "./emit.ts";
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
  const validators = new Emit(ctx.settings).imports.frontend(
    "src/validators",
  );
  return generateViewTypeValidators(ctx, {
    referenceBackendType,
    templates: {
      typeTmpl,
      indexTmpl,
      schemaUnionTmpl,
      schemaStandaloneTmpl,
      schemaInheritTmpl,
    },
    basePath: validators,
    datasourceBasePath: referenceBackendType
      ? "types/generated/datasource/validators"
      : validators,
  });
};
