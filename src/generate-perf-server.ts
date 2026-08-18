import { fill } from "./common/fill.ts";
import type { GenerateContext } from "./common/generate-context.ts";
import { content, patch, type GenerateEntry } from "./common/generate-entry.ts";
import {
  DATASOURCE_TYPES_YAML,
} from "./common/specification-parser.ts";
import { settingsStr } from "./common/settings.ts";
import { libraryImportSpecifier } from "./library-import.ts";
import { serverTmpl, vitestPerfTmpl } from "./resources/perf-server.ts";

export const generate = async (
  ctx: GenerateContext,
): Promise<GenerateEntry[]> => {
  if (!(await ctx.reader.exists(DATASOURCE_TYPES_YAML))) {
    throw new Error("generate-perf-server: datasource_types.yaml is required");
  }
  await ctx.reader.read(DATASOURCE_TYPES_YAML);
  const appImport = libraryImportSpecifier(
    "app",
    settingsStr(ctx.settings, "languages.typescript.library_reference_mode"),
    "perf-server.ts",
  );
  return [
    content("perf-server.ts", fill(serverTmpl, { appImport })),
    content("vitest.perf.config.ts", vitestPerfTmpl),
    patch(
      "package.json",
      JSON.stringify({
        scripts: { "test:perf": "vitest run --config vitest.perf.config.ts" },
      }),
    ),
  ];
};
