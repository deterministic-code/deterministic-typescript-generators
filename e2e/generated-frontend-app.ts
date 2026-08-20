import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { memoryReader } from "@deterministic-code/generators-common/deterministic-reader";
import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import { generate } from "../src/generate-frontend-app.ts";
import { removeE2eTempDirs } from "./cleanup-temp.ts";
import {
  freePort,
  npm,
  waitForUrl,
  type BootedApp,
} from "./generated-app.ts";
import {
  dumpCodegenEntries,
  dumpFinalFiles,
  verboseOutputEnabled,
} from "./verbose-output.ts";
import { writeGenerateEntries } from "./write-generate-entries.ts";

export const bootGeneratedFrontend = async (args: {
  tempPrefix: string;
  settings: GenerateContext["settings"];
}): Promise<BootedApp> => {
  await removeE2eTempDirs([args.tempPrefix]);
  const appDir = await mkdtemp(join(tmpdir(), args.tempPrefix));
  const entries = await generate({
    reader: memoryReader({}),
    settings: args.settings,
  });
  if (verboseOutputEnabled()) dumpCodegenEntries(entries);
  await writeGenerateEntries(appDir, entries);
  if (verboseOutputEnabled()) await dumpFinalFiles(appDir);

  const frontendDir = join(appDir, "frontend");
  await npm(["install", "--no-audit", "--no-fund", "--prefer-offline"], frontendDir);
  await npm(["run", "build"], frontendDir);

  const port = await freePort();
  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  const child = spawn(
    "npm",
    ["run", "preview", "--", "--host", "127.0.0.1", "--port", String(port)],
    {
      cwd: frontendDir,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.stdout?.on("data", (chunk: Buffer) => {
    stdoutChunks.push(chunk);
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    stderrChunks.push(chunk);
  });
  try {
    await waitForUrl(`http://127.0.0.1:${port}/`, 30_000);
  } catch (err) {
    const dumped = Buffer.concat([...stdoutChunks, ...stderrChunks]).toString();
    throw new Error(
      `frontend preview did not come up (exitCode=${child.exitCode})\n${dumped}\n${err}`,
    );
  }
  return { appDir, port, child, stdoutChunks, stderrChunks };
};
