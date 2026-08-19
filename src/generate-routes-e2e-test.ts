import { fill } from "@deterministic-code/generators-common/fill";
import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import { content, type GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import { SpecificationParser } from "@deterministic-code/generators-common/specification-parser";
import { libraryImportSpecifier } from "./library-import.ts";
import { e2eTmpl } from "./resources/routes-e2e.ts";

export const generate = async (
  ctx: GenerateContext,
): Promise<GenerateEntry[]> => {
  const parsed = await new SpecificationParser(ctx.reader).loadRoutes({
    idType: ctx.settings["datasource.id_type"] ?? "integer",
  });
  return [
    content(
      "app.integration.test.ts",
      fill(e2eTmpl, {
        detRoot: libraryImportSpecifier(
          "",
          ctx.settings["languages.typescript.library_reference_mode"],
          "__tests__/app.integration.test.ts",
        ),
        entitiesJson: JSON.stringify(parsed.candidates.map((c) => c.name)),
      }),
    ),
  ];
};
