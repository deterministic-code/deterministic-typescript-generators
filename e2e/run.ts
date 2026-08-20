import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  filterTestFiles,
  filterTestNeedle,
  stripFilterTestArgs,
} from "./filter-test.ts";
import { stripVerboseArgs, verboseOutputEnabled } from "./verbose-output.ts";

const e2eDir = fileURLToPath(new URL(".", import.meta.url));
const allTests = (await readdir(e2eDir))
  .filter((name) => name.endsWith(".e2e.test.ts"))
  .map((name) => join(e2eDir, name));

const needle = filterTestNeedle();
const tests =
  needle === undefined ? allTests : filterTestFiles(allTests, needle);
if (tests.length === 0) {
  const available = allTests.map((path) => basename(path)).join("\n");
  process.stderr.write(
    `--filter-test=${needle} matched no e2e files. Available:\n${available}\n`,
  );
  process.exit(1);
}

const verbose = verboseOutputEnabled();
const extra = stripFilterTestArgs(stripVerboseArgs(process.argv.slice(2)));
const child = spawn(
  process.execPath,
  [
    "--experimental-strip-types",
    "--test",
    "--test-timeout=360000",
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
