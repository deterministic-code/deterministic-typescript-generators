import { spawn } from "node:child_process";
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
  addBetterSqliteDependency,
  freePort,
  npm,
  patchSqliteMigrateHook,
  waitForUrl,
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

  const [appEntries, frontendEntries, typeEntries, bindingEntries, sqlEntries] =
    await Promise.all([
      generateBackendApp(ctx),
      generateFrontendApp(ctx),
      generateFrontendTypes(ctx),
      generateClientBindings(ctx),
      generateSql(ctx),
    ]);
  requireNamed(frontendEntries, "frontend/src/App.tsx");
  requireNamed(bindingEntries, "frontend/src/client/fetch/http.ts");
  requireNamed(bindingEntries, "frontend/src/client/fetch/");

  await removeE2eTempDirs([tempPrefix]);
  const appDir = await mkdtemp(join(tmpdir(), tempPrefix));
  const entries = [
    ...appEntries,
    ...frontendEntries,
    ...typeEntries,
    ...bindingEntries,
    ...sqlEntries,
  ];
  if (verboseOutputEnabled()) dumpCodegenEntries(entries);
  await writeGenerateEntries(appDir, entries);
  await writeDeterministicYaml(appDir, yaml);
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
