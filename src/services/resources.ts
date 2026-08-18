import { readFile } from "node:fs/promises";

const resource = (rel: string): Promise<string> =>
  readFile(
    new URL(`../templates/create-services/${rel}`, import.meta.url),
    "utf8",
  );

export const [genericTmpl, customStubTmpl, indexTmpl] = await Promise.all([
  resource("generic.ts.tmpl"),
  resource("custom-stub.ts.tmpl"),
  resource("index.ts.tmpl"),
]);
