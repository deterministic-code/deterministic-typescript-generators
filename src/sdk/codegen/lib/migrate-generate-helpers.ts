import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CONTENT, type GenerateEntry } from "./generate-result.ts";
import { resolveDatasourceDialects } from "./deterministic-project.ts";
import { makeGenerate, type GenerateContext } from "./make-generate.ts";
import { settingsList, settingsStr } from "../../settings-dict.ts";
import type { MigrateRenderOptions } from "./migrate-scripts-generate-types.ts";

/** A whole-file CONTENT generate entry. */
export const content = (filename: string, contents: string) => ({
  kind: CONTENT,
  filename,
  contents,
});

/** Empty-migrations placeholders for a per-language migrate scaffold. Generated only for a single-lane build whose lane IS the shared sql root; in a multi-language build the shared sql step owns and fills `sql/<dialect>/migrations`, so a lane-relative gitkeep would wrongly spawn `<lang>/sql`. */
export function gitkeepEntries(
  dialects: string[],
  settings: MigrateRenderOptions["settings"],
) {
  if (settingsList(settings, "backend.languages").length > 1) return [];
  return dialects.map((dialect) =>
    content(`sql/${dialect}/migrations/.gitkeep`, ""),
  );
}

/** Template helpers rooted at a language's `create-backend-app` templates dir (subpath segments below `scripts/templates/create-backend-app`). `read(name)` returns raw text. */
const DEFAULT_TEMPLATES_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "templates",
);

function runnerTemplatesAt(templatesDir: string, ...subpath: string[]) {
  const dir = resolve(templatesDir, "create-backend-app", ...subpath);
  const read = (name: string) => readFile(resolve(dir, name), "utf8");
  return { read };
}

export function runnerTemplates(...subpath: string[]) {
  return runnerTemplatesAt(DEFAULT_TEMPLATES_DIR, ...subpath);
}

/** Bind the runner-template reader to a pack-owned `templates` dir, so a language pack reads its own migrate templates instead of the SDK's. */
export function makeRunnerTemplates(templatesDir: string) {
  return (...subpath: string[]) => runnerTemplatesAt(templatesDir, ...subpath);
}

export interface MigrateGenerateContext extends GenerateContext {
  inputs: MigrateRenderOptions["inputs"];
}

/** Build the common `generate` for a migrate language: resolve the configured (deployment) SQL dialects from settings, derive `combined` from `application_tier`, then hand the language's whole-scaffold render fn `{ migrateDir, dialects, inputs, settings }`. The render fn adds the sqlite runner lane itself (via `withSqliteDialect`) so `--provider sqlite` works in verify while the `.env`/docker defaults stay on the configured dialects. `migrateDir` is a per-pack constant the pack binds into `renderEntries` (rust `src/bin`, csharp `MigrateRunner`, ts `migrate`). The render fn is a local closure, never captured across an import cycle. */
export function makeMigrateGenerate(
  renderEntries: (args: MigrateRenderOptions) => Promise<GenerateEntry[]>,
  migrateDir: string,
) {
  return makeGenerate(async ({ inputs, settings }: MigrateGenerateContext) => {
    const dialects = resolveDatasourceDialects(settings);
    const combined = settingsStr(settings, "application_tier") === "full-stack";
    return renderEntries({ migrateDir, dialects, inputs, settings, combined });
  });
}
