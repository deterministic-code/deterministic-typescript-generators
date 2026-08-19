import { readFile } from "node:fs/promises";

export const e2eTmpl = await readFile(
  new URL(
    "../templates/create-routes-e2e/app.integration.test.ts.tmpl",
    import.meta.url,
  ),
  "utf8",
);
