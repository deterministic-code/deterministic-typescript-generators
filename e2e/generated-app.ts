import { spawn, type ChildProcess } from "node:child_process";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { memoryReader } from "@deterministic-code/generators-common/deterministic-reader";
import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import { generate } from "../src/generate-backend-app.ts";
import { removeE2eTempDirs } from "./cleanup-temp.ts";
import {
  dumpCodegenEntries,
  dumpFinalFiles,
  verboseOutputEnabled,
} from "./verbose-output.ts";
import { writeGenerateEntries } from "./write-generate-entries.ts";

const execFileAsync = promisify(execFile);

export const MINIMAL_DETERMINISTIC_YAML: Record<string, string> = {
  "settings.yaml": `settings:
  datasource:
    id_type: integer
`,
  "backend-app.yaml": `middleware: []
handlers: []
`,
  "services.yaml": "services: []\n",
  "routes.yaml": "routes: []\n",
  "datasource_types.yaml": "types: []\n",
};

export const npm = async (args: string[], cwd: string): Promise<void> => {
  await execFileAsync("npm", args, {
    cwd,
    env: process.env,
    maxBuffer: 20 * 1024 * 1024,
  });
};

export const freePort = async (): Promise<number> => {
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

export const waitForUrl = async (
  url: string,
  timeoutMs: number,
): Promise<Response> => {
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

export const writeDeterministicYaml = async (
  appDir: string,
  files: Record<string, string> = MINIMAL_DETERMINISTIC_YAML,
): Promise<void> => {
  const dir = join(appDir, "deterministic");
  await mkdir(dir, { recursive: true });
  await Promise.all(
    Object.entries(files).map(([name, body]) =>
      writeFile(join(dir, name), body, "utf8"),
    ),
  );
};

const SQLITE_HOOK = `    beforeCreateBackendApp: async () => ({
      connection: await connectDatabase({
        backend: "sqlite",
        sqliteFile: ":memory:",
        migrationsDir: resolve(process.cwd(), "sqlite/migrations"),
      }),
    }),
`;

const TRACE_MIDDLEWARE_HOOK = `    enableMiddleware: ["traceRoute", "traceService", "traceDatasource"],
`;

export const patchSqliteMigrateHook = async (
  appDir: string,
  options?: { enableTrace?: boolean },
): Promise<void> => {
  const appPath = join(appDir, "app.ts");
  const before = await readFile(appPath, "utf8");
  const withImport = before.replace(
    'import { createBackendApp as createDeterministicApp } from "@deterministic-code/deterministic/app";',
    'import { connectDatabase, createBackendApp as createDeterministicApp } from "@deterministic-code/deterministic/app";',
  );
  const begin = "// === BEGIN APP_BEFORE_HOOK";
  const end = "// === END APP_BEFORE_HOOK ===";
  const start = withImport.indexOf(begin);
  const stop = withImport.indexOf(end);
  if (start < 0 || stop < 0 || stop <= start) {
    throw new Error("generated app.ts is missing APP_BEFORE_HOOK markers");
  }
  const lineStart = withImport.lastIndexOf("\n", start) + 1;
  const hook =
    options?.enableTrace === true
      ? `${SQLITE_HOOK}${TRACE_MIDDLEWARE_HOOK}`
      : SQLITE_HOOK;
  const patched = `${withImport.slice(0, lineStart)}${hook}${withImport.slice(stop)}`;
  await writeFile(appPath, patched, "utf8");
};

export const addBetterSqliteDependency = async (appDir: string): Promise<void> => {
  const pkgPath = join(appDir, "package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf8")) as {
    dependencies?: Record<string, string>;
  };
  pkg.dependencies = { ...pkg.dependencies, "better-sqlite3": "^12.10.0" };
  await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
};

export type BootedApp = {
  appDir: string;
  port: number;
  child: ChildProcess;
  stdoutChunks: Buffer[];
  stderrChunks: Buffer[];
};

export const bootGeneratedApp = async (args: {
  tempPrefix: string;
  settings: GenerateContext["settings"];
  writeYaml: boolean;
}): Promise<BootedApp> => {
  await removeE2eTempDirs([args.tempPrefix]);
  const appDir = await mkdtemp(join(tmpdir(), args.tempPrefix));
  const entries = await generate({
    reader: memoryReader({}),
    settings: args.settings,
  });
  if (verboseOutputEnabled()) dumpCodegenEntries(entries);
  await writeGenerateEntries(appDir, entries);
  if (args.writeYaml) await writeDeterministicYaml(appDir);
  if (verboseOutputEnabled()) await dumpFinalFiles(appDir);
  await npm(["install", "--no-audit", "--no-fund", "--prefer-offline"], appDir);
  await npm(["run", "build"], appDir);

  const port = await freePort();
  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  const child = spawn(process.execPath, ["dist/server.js"], {
    cwd: appDir,
    env: { ...process.env, PORT: String(port) },
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

export const stopGeneratedApp = async (booted: BootedApp | undefined, tempPrefix: string): Promise<void> => {
  if (booted === undefined) {
    await removeE2eTempDirs([tempPrefix]);
    return;
  }
  if (booted.child.exitCode === null && booted.child.signalCode === null) {
    booted.child.kill("SIGTERM");
    await once(booted.child, "exit").catch(() => undefined);
  }
  await rm(booted.appDir, { recursive: true, force: true });
  await removeE2eTempDirs([tempPrefix]);
};
