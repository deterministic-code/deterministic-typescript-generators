import { readFile } from "node:fs/promises";

export const [serverTmpl, vitestPerfTmpl] = await Promise.all([
  readFile(
    new URL("../templates/create-perf-server/perf-server.ts.tmpl", import.meta.url),
    "utf8",
  ),
  readFile(
    new URL(
      "../templates/create-backend-app/vitest.perf.config.ts.tmpl",
      import.meta.url,
    ),
    "utf8",
  ),
]);
