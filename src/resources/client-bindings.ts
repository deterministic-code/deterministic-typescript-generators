import { readFile } from "node:fs/promises";

const resource = (rel: string): Promise<string> =>
  readFile(
    new URL(`../templates/create-client-bindings/${rel}`, import.meta.url),
    "utf8",
  );

export const [
  fetchHttpTmpl,
  axiosHttpTmpl,
  entityTmpl,
  transportIndexTmpl,
  tanstackTmpl,
  tanstackIndexTmpl,
  rootIndexTmpl,
] = await Promise.all([
  resource("fetch-http.ts.tmpl"),
  resource("axios-http.ts.tmpl"),
  resource("entity.ts.tmpl"),
  resource("transport-index.ts.tmpl"),
  resource("tanstack.ts.tmpl"),
  resource("tanstack-index.ts.tmpl"),
  resource("root-index.ts.tmpl"),
]);
