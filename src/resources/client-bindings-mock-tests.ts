import { readFile } from "node:fs/promises";

const resource = (rel: string): Promise<string> =>
  readFile(
    new URL(
      `../templates/create-client-bindings-mock-tests/${rel}`,
      import.meta.url,
    ),
    "utf8",
  );

export const [httpEntityTmpl, tanstackEntityTmpl] = await Promise.all([
  resource("http-entity.test.ts.tmpl"),
  resource("tanstack-entity.test.ts.tmpl"),
]);
