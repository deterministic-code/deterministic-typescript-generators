import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { memoryReader } from "@deterministic-code/generators-common/deterministic-reader";
import type { GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import { generate as generateSql } from "../../generators-sql/src/generate-sql.ts";
import { createCasing } from "../src/common/default-casing.ts";
import { generate as generateBackendApp } from "../src/generate-backend-app.ts";
import { generate as generateDatasourceTypes } from "../src/generate-datasource-types.ts";
import { generate as generateRoutes } from "../src/generate-routes.ts";
import { generate as generateServices } from "../src/generate-services.ts";
import { generate as generateViewTypes } from "../src/generate-view-types.ts";
import { removeE2eTempDirs } from "./cleanup-temp.ts";
import {
  generateBundledMigrate,
  installBuildAndMigrateSqlite,
  sqliteAppEnv,
  startGeneratedServer,
  withSqlRoot,
  writeDeterministicYaml,
  type BootedApp,
} from "./generated-app.ts";
import { writeGenerateEntries } from "./write-generate-entries.ts";
import {
  PARENT_CHILD_EAGER_YAML,
  PARENT_CHILD_SETTINGS,
} from "./parent-child-eager-yaml.ts";
import {
  dumpCodegenEntries,
  dumpFinalFiles,
  dumpServerTrace,
  verboseOutputEnabled,
} from "./verbose-output.ts";

const filenames = (entries: GenerateEntry[]): string[] =>
  entries.map((e) => e.filename);

const requireNamed = (entries: GenerateEntry[], needle: string): void => {
  const hit = filenames(entries).some((name) => name.includes(needle));
  if (!hit) {
    throw new Error(
      `codegen missing ${needle}; got ${filenames(entries).join(", ")}`,
    );
  }
};

export const assertParentChildGenerators = async (): Promise<void> => {
  const reader = memoryReader(PARENT_CHILD_EAGER_YAML);
  const settings = PARENT_CHILD_SETTINGS;
  const [datasource, views, services, routes] = await Promise.all([
    generateDatasourceTypes({ reader, settings }),
    generateViewTypes({ reader, settings }),
    generateServices({ reader, settings }),
    generateRoutes({ reader, settings }),
  ]);
  requireNamed(datasource, "project");
  requireNamed(datasource, "task");
  requireNamed(datasource, "status");
  requireNamed(views, "project");
  const casing = createCasing(settings);
  requireNamed(services, casing.fileBase("project_service"));
  requireNamed(services, casing.fileBase("task_service"));
  requireNamed(routes, "project");
};

export const bootParentChildEagerApp = async (
  tempPrefix: string,
): Promise<BootedApp> => {
  await assertParentChildGenerators();
  await removeE2eTempDirs([tempPrefix]);
  const appDir = await mkdtemp(join(tmpdir(), tempPrefix));
  const reader = memoryReader(PARENT_CHILD_EAGER_YAML);
  const [appEntries, sqlEntries, migrateEntries] = await Promise.all([
    generateBackendApp({
      reader: memoryReader({}),
      settings: PARENT_CHILD_SETTINGS,
    }),
    generateSql({ reader, settings: PARENT_CHILD_SETTINGS }),
    generateBundledMigrate(PARENT_CHILD_SETTINGS),
  ]);
  requireNamed(migrateEntries, "migraters/typescript/package.json");
  requireNamed(migrateEntries, "migraters/typescript/src/bin/migrate-up.ts");
  const entries = [
    ...appEntries,
    ...withSqlRoot(sqlEntries),
    ...migrateEntries,
  ];
  if (verboseOutputEnabled()) dumpCodegenEntries(entries);
  await writeGenerateEntries(appDir, entries);
  await writeDeterministicYaml(appDir, PARENT_CHILD_EAGER_YAML);
  if (verboseOutputEnabled()) await dumpFinalFiles(appDir);

  await installBuildAndMigrateSqlite(appDir);
  return startGeneratedServer(appDir, {
    ...sqliteAppEnv(appDir),
    DETERMINISTIC_TRACE: "route,service,datasource",
  });
};

export const dumpParentChildTrace = (booted: BootedApp): void => {
  if (!verboseOutputEnabled()) return;
  dumpServerTrace(Buffer.concat(booted.stdoutChunks).toString());
};
