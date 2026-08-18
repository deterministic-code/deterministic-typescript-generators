import { readFile } from "node:fs/promises";

const resource = (rel: string): Promise<string> =>
  readFile(
    new URL(`../templates/create-nested-routes/${rel}`, import.meta.url),
    "utf8",
  );

export const [directFkTmpl, m2mTmpl] = await Promise.all([
  resource("direct-fk.ts.tmpl"),
  resource("m2m.ts.tmpl"),
]);
