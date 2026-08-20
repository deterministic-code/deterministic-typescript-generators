import { readFile } from "node:fs/promises";

const resource = (rel: string): Promise<string> =>
  readFile(
    new URL(`../templates/create-view-types-tests/${rel}`, import.meta.url),
    "utf8",
  );

export const [typeTestTmpl, fieldTestsTmpl, valueTmpl] = await Promise.all([
  resource("type.test.ts.tmpl"),
  resource("field-tests.ts.tmpl"),
  resource("value.ts.tmpl"),
]);
