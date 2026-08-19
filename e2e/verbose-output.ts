import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { GenerateEntry } from "@deterministic-code/generators-common/generate-entry";

const TRUTHY = new Set(["1", "true", "yes", "on"]);

const isTruthy = (raw: string): boolean => TRUTHY.has(raw.trim().toLowerCase());

const parseVerboseArg = (argv: string[]): boolean => {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--verbose-output") {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("-")) return true;
      return isTruthy(next.replace(/^=/, ""));
    }
    if (arg.startsWith("--verbose-output=")) {
      const value = arg.slice("--verbose-output=".length);
      return value === "" ? true : isTruthy(value);
    }
  }
  return false;
};

export const stripVerboseArgs = (argv: string[]): string[] => {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--verbose-output") {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("-")) i += 1;
      continue;
    }
    if (arg.startsWith("--verbose-output=")) continue;
    out.push(arg);
  }
  return out;
};

export const verboseOutputEnabled = (): boolean => {
  const env = process.env.VERBOSE_OUTPUT;
  if (env !== undefined && env !== "") return isTruthy(env);
  return parseVerboseArg(process.argv);
};

const SKIP_DIR_NAMES = new Set(["node_modules", "dist", ".patch-merger-src"]);

const logSection = (title: string, body: string): void => {
  process.stderr.write(`\n===== ${title} =====\n${body}\n`);
};

export const dumpCodegenEntries = (entries: GenerateEntry[]): void => {
  const blocks = entries.map((entry) => {
    if (entry.kind === "content") {
      return `--- ${entry.kind} ${entry.filename} ---\n${entry.contents}`;
    }
    const section =
      entry.section === undefined ? "" : ` section=${entry.section}`;
    return `--- ${entry.kind} ${entry.filename}${section} ---\n${entry.content}`;
  });
  logSection("codegen output", blocks.join("\n\n"));
};

export const dumpFinalFiles = async (rootDir: string): Promise<void> => {
  const listed = await readdir(rootDir, { recursive: true, withFileTypes: true });
  const files = listed
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const dir = entry.parentPath ?? entry.path;
      return join(dir, entry.name);
    })
    .filter((path) => {
      const rel = path.slice(rootDir.length).replaceAll("\\", "/");
      return !rel.split("/").some((part) => SKIP_DIR_NAMES.has(part));
    })
    .sort();
  const blocks = await Promise.all(
    files.map(async (path) => {
      const rel = path.slice(rootDir.length).replace(/^[\\/]/, "");
      const body = await readFile(path, "utf8");
      return `--- ${rel} ---\n${body}`;
    }),
  );
  logSection(`final files (${rootDir})`, blocks.join("\n\n"));
};
