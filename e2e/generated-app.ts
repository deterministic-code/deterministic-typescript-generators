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
import type { GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import { generate as generateMigrate } from "../../generators-migraters/typescript/generate.ts";
import { generate } from "../src/generate-backend-app.ts";
import { removeE2eTempDirs } from "./cleanup-temp.ts";
import {
  dumpCodegenEntries,
  dumpFinalFiles,
  verboseOutputEnabled,
} from "./verbose-output.ts";
import { writeGenerateEntries } from "./write-generate-entries.ts";

const execFileAsync = promisify(execFile);

export const SQLITE_DB_FILE = "dev.sqlite";

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

export const npm = async (
  args: string[],
  cwd: string,
  extraEnv: Record<string, string> = {},
): Promise<void> => {
  await execFileAsync("npm", args, {
    cwd,
    env: { ...process.env, ...extraEnv },
    maxBuffer: 20 * 1024 * 1024,
  });
};

export const installFrontend = async (appDir: string): Promise<void> => {
  await npm(
    ["install", "--no-audit", "--no-fund", "--prefer-offline"],
    join(appDir, "frontend"),
  );
};

export const testFrontend = async (
  appDir: string,
  extraEnv: Record<string, string> = {},
): Promise<void> => {
  await npm(["test"], join(appDir, "frontend"), extraEnv);
};

export const installAndTestFrontend = async (
  appDir: string,
  extraEnv: Record<string, string> = {},
): Promise<void> => {
  await installFrontend(appDir);
  await testFrontend(appDir, extraEnv);
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

/** SQL generator emits `<dialect>/migrations/…`; migrate scripts look under `sql/`. */
export const withSqlRoot = (entries: GenerateEntry[]): GenerateEntry[] =>
  entries.map((entry) =>
    entry.kind === "content" && !entry.filename.startsWith("sql/")
      ? { ...entry, filename: `sql/${entry.filename}` }
      : entry,
  );

export const generateBundledMigrate = (
  settings: GenerateContext["settings"],
): Promise<GenerateEntry[]> =>
  generateMigrate({
    reader: memoryReader({}),
    settings: {
      ...settings,
      "languages.typescript.migrate_mode": "bundled",
    },
  });

export const sqliteAppEnv = (appDir: string): Record<string, string> => ({
  DATABASE_BACKEND: "sqlite",
  DB_PATH: join(appDir, SQLITE_DB_FILE),
});

const rewriteBundledMigratePrepare = async (appDir: string): Promise<void> => {
  const pkgPath = join(appDir, "migraters/typescript/package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf8")) as {
    scripts?: Record<string, string>;
  };
  // Bundled migrate omits generate-help.ts; keep prepare as build so
  // `npm run migrate:build` can install better-sqlite3 and compile the CLI.
  pkg.scripts = { ...pkg.scripts, prepare: "npm run build" };
  await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
};

export const addBetterSqliteDependency = async (appDir: string): Promise<void> => {
  const pkgPath = join(appDir, "package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf8")) as {
    dependencies?: Record<string, string>;
  };
  pkg.dependencies = { ...pkg.dependencies, "better-sqlite3": "^12.10.0" };
  await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
};

export const installBuildAndMigrateSqlite = async (
  appDir: string,
): Promise<string> => {
  const dbPath = join(appDir, SQLITE_DB_FILE);
  await addBetterSqliteDependency(appDir);
  await rewriteBundledMigratePrepare(appDir);
  await npm(["run", "migrate:build"], appDir);
  await npm(
    [
      "install",
      "./migraters/typescript",
      "--no-audit",
      "--no-fund",
      "--prefer-offline",
    ],
    appDir,
  );
  const env = sqliteAppEnv(appDir);
  await npm(["run", "migrate:setup"], appDir, env);
  await npm(["run", "migrate"], appDir, env);
  await npm(["run", "build"], appDir);
  return dbPath;
};

export type BootedApp = {
  appDir: string;
  port: number;
  child: ChildProcess;
  stdoutChunks: Buffer[];
  stderrChunks: Buffer[];
};

export const startGeneratedServer = async (
  appDir: string,
  extraEnv: Record<string, string> = {},
): Promise<BootedApp> => {
  const port = await freePort();
  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  const child = spawn(process.execPath, ["dist/server.js"], {
    cwd: appDir,
    env: { ...process.env, ...extraEnv, PORT: String(port) },
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
  return startGeneratedServer(appDir);
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
