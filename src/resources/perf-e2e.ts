import { readFile } from "node:fs/promises";

export const e2eTmpl = await readFile(
  new URL("../templates/create-perf-e2e/app.perf.client.test.ts.tmpl", import.meta.url),
  "utf8",
);
