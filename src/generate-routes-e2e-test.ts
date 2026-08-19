import { fill } from "./common/fill.ts";
import type { GenerateContext } from "./common/generate-context.ts";
import { content, type GenerateEntry } from "./common/generate-entry.ts";
import { datasourceSettings } from "./common/datasource-settings.ts";
import { SpecificationParser } from "./common/specification-parser.ts";
import { settingsStr } from "./common/settings.ts";
import { libraryImportSpecifier } from "./library-import.ts";
import { e2eTmpl } from "./resources/routes-e2e.ts";

export const generate = async (
  ctx: GenerateContext,
): Promise<GenerateEntry[]> => {
  const ds = datasourceSettings(ctx.settings);
  const parsed = await new SpecificationParser(ctx.reader).loadRoutes({
    idType: ds.idType,
  });
  return [
    content(
      "app.integration.test.ts",
      fill(e2eTmpl, {
        detRoot: libraryImportSpecifier(
          "",
          settingsStr(
            ctx.settings,
            "languages.typescript.library_reference_mode",
          ),
          "__tests__/app.integration.test.ts",
        ),
        entitiesJson: JSON.stringify(parsed.candidates.map((c) => c.name)),
      }),
    ),
  ];
};
