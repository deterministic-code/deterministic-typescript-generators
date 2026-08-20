import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { memoryReader } from "@deterministic-code/generators-common/deterministic-reader";
import type { GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import { generate as generateSql } from "../../generators-sql/src/generate-sql.ts";
import { generate as generateBackendApp } from "../src/generate-backend-app.ts";
import { generate as generateDatasourceTypes } from "../src/generate-datasource-types.ts";
import { generate as generateRoutes } from "../src/generate-routes.ts";
import { generate as generateServices } from "../src/generate-services.ts";
import { generate as generateViewTypes } from "../src/generate-view-types.ts";
import { removeE2eTempDirs } from "./cleanup-temp.ts";
import {
  addBetterSqliteDependency,
  freePort,
  npm,
  patchSqliteMigrateHook,
  waitForUrl,
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
  requireNamed(services, "project_service");
  requireNamed(services, "task_service");
  requireNamed(routes, "project");
};

export const bootParentChildEagerApp = async (
  tempPrefix: string,
): Promise<BootedApp> => {
  await assertParentChildGenerators();
  await removeE2eTempDirs([tempPrefix]);
  const appDir = await mkdtemp(join(tmpdir(), tempPrefix));
  const appEntries = await generateBackendApp({
    reader: memoryReader({}),
    settings: PARENT_CHILD_SETTINGS,
  });
  if (verboseOutputEnabled()) dumpCodegenEntries(appEntries);
  await writeGenerateEntries(appDir, appEntries);
  await writeDeterministicYaml(appDir, PARENT_CHILD_EAGER_YAML);

  const sqlEntries = await generateSql({
    reader: memoryReader(PARENT_CHILD_EAGER_YAML),
    settings: PARENT_CHILD_SETTINGS,
  });
  if (verboseOutputEnabled()) dumpCodegenEntries(sqlEntries);
  await writeGenerateEntries(appDir, sqlEntries);
  await patchSqliteMigrateHook(appDir, { enableTrace: true });
  await addBetterSqliteDependency(appDir);
  if (verboseOutputEnabled()) await dumpFinalFiles(appDir);

  await npm(["install", "--no-audit", "--no-fund", "--prefer-offline"], appDir);
  await npm(["run", "build"], appDir);

  const port = await freePort();
  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  const child = spawn(process.execPath, ["dist/server.js"], {
    cwd: appDir,
    env: {
      ...process.env,
      PORT: String(port),
      DETERMINISTIC_TRACE: "route,service,datasource",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (chunk: Buffer) => {
    stdoutChunks.push(chunk);
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    stderrChunks.push(chunk);
  });
  try {
    await waitForUrl(`http://127.0.0.1:${port}/api/health`, 30_000);
  } catch (err) {
    const dumped = Buffer.concat(stderrChunks).toString();
    throw new Error(
      `health check did not come up (exitCode=${child.exitCode})\n${dumped}\n${err}`,
    );
  }
  return { appDir, port, child, stdoutChunks, stderrChunks };
};

export const dumpParentChildTrace = (booted: BootedApp): void => {
  if (!verboseOutputEnabled()) return;
  dumpServerTrace(Buffer.concat(booted.stdoutChunks).toString());
};
