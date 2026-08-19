import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { promisify } from "node:util";
import { memoryReader } from "@deterministic-code/generators-common/deterministic-reader";
import { generate } from "../src/generate-backend-app.ts";
import { removeE2eTempDirs } from "./cleanup-temp.ts";
import {
  dumpCodegenEntries,
  dumpFinalFiles,
  verboseOutputEnabled,
} from "./verbose-output.ts";
import { writeGenerateEntries } from "./write-generate-entries.ts";

const execFileAsync = promisify(execFile);

const npm = async (args: string[], cwd: string): Promise<void> => {
  await execFileAsync("npm", args, {
    cwd,
    env: process.env,
    maxBuffer: 20 * 1024 * 1024,
  });
};

const freePort = async (): Promise<number> => {
  const server = createServer();
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address() as AddressInfo;
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
  return port;
};

const waitForUrl = async (url: string, timeoutMs: number): Promise<Response> => {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
      lastError = new Error(`${url} -> ${res.status}`);
    } catch (err) {
      lastError = err;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`timed out waiting for ${url}`);
};

describe("backend-app generate + writer e2e", { timeout: 180_000 }, () => {
  let appDir = "";
  let child: ChildProcess | undefined;
  let port = 0;
  const stderrChunks: Buffer[] = [];

  before(async () => {
    await removeE2eTempDirs();
    appDir = await mkdtemp(join(tmpdir(), "ts-backend-app-e2e-"));
    const entries = await generate({
      reader: memoryReader({}),
      settings: {
        application_name: "health-e2e",
        app_generate_complexity: "minimal",
      },
    });
    if (verboseOutputEnabled()) dumpCodegenEntries(entries);
    await writeGenerateEntries(appDir, entries);
    if (verboseOutputEnabled()) await dumpFinalFiles(appDir);
    await npm(["install", "--no-audit", "--no-fund", "--prefer-offline"], appDir);
    await npm(["run", "build"], appDir);

    port = await freePort();
    child = spawn(
      process.execPath,
      ["dist/server.js"],
      {
        cwd: appDir,
        env: { ...process.env, PORT: String(port) },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    child.stderr?.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });
    try {
      await waitForUrl(`http://127.0.0.1:${port}/api/health`, 30_000);
    } catch (err) {
      const dumped = Buffer.concat(stderrChunks).toString();
      const code = child.exitCode;
      throw new Error(
        `health check did not come up (exitCode=${code})\n${dumped}\n${err}`,
      );
    }
  });

  after(async () => {
    if (child !== undefined && child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      await once(child, "exit").catch(() => undefined);
    }
    if (appDir !== "") await rm(appDir, { recursive: true, force: true });
    await removeE2eTempDirs();
  });

  it("serves GET /api/health with 200 { status: ok }", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: "ok" });
  });
});
