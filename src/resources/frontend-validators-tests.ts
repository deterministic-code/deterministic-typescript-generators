import { readFile } from "node:fs/promises";

const resource = (rel: string): Promise<string> =>
  readFile(
    new URL(
      `../templates/create-frontend-validators-tests/${rel}`,
      import.meta.url,
    ),
    "utf8",
  );

export const [validatorsTestTmpl] = await Promise.all([
  resource("validators.test.ts.tmpl"),
]);
