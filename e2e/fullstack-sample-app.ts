import { access, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { memoryReader } from "@deterministic-code/generators-common/deterministic-reader";
import type { GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import { generate as generateSql } from "../../generators-sql/src/generate-sql.ts";
import { generate as generateBackendApp } from "../src/generate-backend-app.ts";
import { generate as generateClientBindings } from "../src/generate-client-bindings.ts";
import { generate as generateFrontendApp } from "../src/generate-frontend-app.ts";
import { generate as generateFrontendTypes } from "../src/generate-frontend-types.ts";
import { removeE2eTempDirs } from "./cleanup-temp.ts";
import {
  loadFullstackSampleYaml,
  fullstackSampleSettings,
  type FullstackSampleName,
} from "./fullstack-sample-yaml.ts";
import {
  generateBundledMigrate,
  installBuildAndMigrateSqlite,
  sqliteAppEnv,
  startGeneratedServer,
  withSqlRoot,
  writeDeterministicYaml,
  type BootedApp,
} from "./generated-app.ts";
import {
  dumpCodegenEntries,
  dumpFinalFiles,
  dumpServerTrace,
  verboseOutputEnabled,
} from "./verbose-output.ts";
import { writeGenerateEntries } from "./write-generate-entries.ts";

const requireNamed = (entries: GenerateEntry[], needle: string): void => {
  const hit = entries.some((entry) => entry.filename.includes(needle));
  if (!hit) {
    throw new Error(
      `codegen missing ${needle}; got ${entries.map((e) => e.filename).join(", ")}`,
    );
  }
};

export const bootFullstackSample = async (
  name: FullstackSampleName,
  tempPrefix: string,
): Promise<BootedApp> => {
  const yaml = await loadFullstackSampleYaml(name);
  const settings = fullstackSampleSettings(name);
  const ctx = { reader: memoryReader(yaml), settings };

  const [
    appEntries,
    frontendEntries,
    typeEntries,
    bindingEntries,
    sqlEntries,
    migrateEntries,
  ] = await Promise.all([
    generateBackendApp(ctx),
    generateFrontendApp(ctx),
    generateFrontendTypes(ctx),
    generateClientBindings(ctx),
    generateSql(ctx),
    generateBundledMigrate(settings),
  ]);
  requireNamed(frontendEntries, "frontend/src/app.tsx");
  requireNamed(bindingEntries, "frontend/src/client/fetch/http.ts");
  requireNamed(bindingEntries, "frontend/src/client/fetch/");
  requireNamed(migrateEntries, "migraters/typescript/package.json");
  requireNamed(migrateEntries, "migraters/typescript/src/bin/migrate-up.ts");

  await removeE2eTempDirs([tempPrefix]);
  const appDir = await mkdtemp(join(tmpdir(), tempPrefix));
  const entries = [
    ...appEntries,
    ...frontendEntries,
    ...typeEntries,
    ...bindingEntries,
    ...withSqlRoot(sqlEntries),
    ...migrateEntries,
  ];
  if (verboseOutputEnabled()) dumpCodegenEntries(entries);
  await writeGenerateEntries(appDir, entries);
  await writeDeterministicYaml(appDir, yaml);
  if (verboseOutputEnabled()) await dumpFinalFiles(appDir);

  await installBuildAndMigrateSqlite(appDir);
  return startGeneratedServer(appDir, {
    ...sqliteAppEnv(appDir),
    DETERMINISTIC_TRACE: "route,service,datasource",
  });
};

export const requireFrontendBinding = async (
  appDir: string,
  rel: string,
): Promise<void> => {
  await access(join(appDir, rel));
};

export const dumpFullstackTrace = (booted: BootedApp): void => {
  if (!verboseOutputEnabled()) return;
  dumpServerTrace(Buffer.concat(booted.stdoutChunks).toString());
};
