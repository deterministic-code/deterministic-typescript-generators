import { readFile } from "node:fs/promises";

const resource = (rel: string): Promise<string> =>
  readFile(
    new URL(`../templates/create-backend-app/minimal/${rel}`, import.meta.url),
    "utf8",
  );

export const [
  minimalAppTs,
  minimalServerTs,
  minimalPackageJson,
  minimalTsconfigJson,
  minimalHealthTestTs,
] = await Promise.all([
  resource("app.ts.tmpl"),
  resource("server.ts.tmpl"),
  resource("package.json.tmpl"),
  resource("tsconfig.json.tmpl"),
  resource("health.test.ts.tmpl"),
]);
