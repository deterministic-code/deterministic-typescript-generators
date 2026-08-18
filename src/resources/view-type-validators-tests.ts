import { readFile } from "node:fs/promises";

const resource = (rel: string): Promise<string> =>
  readFile(
    new URL(
      `../templates/create-view-type-validators-tests/${rel}`,
      import.meta.url,
    ),
    "utf8",
  );

export const [typeTestTmpl] = await Promise.all([
  resource("type.test.ts.tmpl"),
]);
