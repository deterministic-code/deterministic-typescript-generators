import { readFile } from "node:fs/promises";

const resource = (rel: string): Promise<string> =>
  readFile(
    new URL(`../templates/create-routes/${rel}`, import.meta.url),
    "utf8",
  );

export const [
  readonlyPlainTmpl,
  readonlyByFieldsTmpl,
  crudPlainTmpl,
  crudByFieldsTmpl,
  customStubTmpl,
  appWiringTmpl,
] = await Promise.all([
  resource("readonly-plain.ts.tmpl"),
  resource("readonly-by-fields.ts.tmpl"),
  resource("crud-plain.ts.tmpl"),
  resource("crud-by-fields.ts.tmpl"),
  resource("custom-stub.ts.tmpl"),
  resource("app-wiring.ts.tmpl"),
]);
