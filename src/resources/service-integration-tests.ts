import { readFile } from "node:fs/promises";

export const genericTmpl = await readFile(
  new URL(
    "../templates/create-service-integration-tests/generic.integration.test.ts.tmpl",
    import.meta.url,
  ),
  "utf8",
);
