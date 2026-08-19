import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { stripVerboseArgs, verboseOutputEnabled } from "./verbose-output.ts";

const e2eDir = fileURLToPath(new URL(".", import.meta.url));
const tests = (await readdir(e2eDir))
  .filter((name) => name.endsWith(".e2e.test.ts"))
  .map((name) => join(e2eDir, name));

const verbose = verboseOutputEnabled();
const extra = stripVerboseArgs(process.argv.slice(2));
const child = spawn(
  process.execPath,
  [
    "--experimental-strip-types",
    "--test",
    "--test-timeout=180000",
    ...tests,
    ...extra,
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      ...(verbose ? { VERBOSE_OUTPUT: "true" } : {}),
    },
  },
);

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
