import { readFile } from "node:fs/promises";

const resource = (rel: string): Promise<string> =>
  readFile(new URL(`../templates/create-backend-app/${rel}`, import.meta.url), "utf8");

export const [
  appTs,
  serverTs,
  packageJson,
  tsconfigJson,
  dockerfile,
  entrypointSh,
  dockerComposeYml,
  envFile,
  gitignore,
  vitestConfigTs,
  healthTestTs,
  appBootTestTs,
] = await Promise.all([
  resource("typescript/chunks/app.ts"),
  resource("typescript/chunks/server.ts"),
  resource("package.json.tmpl"),
  resource("tsconfig.json.tmpl"),
  resource("Dockerfile.tmpl"),
  resource("entrypoint.sh"),
  resource("docker-compose.yml.tmpl"),
  resource("env.tmpl"),
  resource("gitignore.tmpl"),
  resource("vitest.config.ts.tmpl"),
  resource("health.test.ts.tmpl"),
  resource("app-boot.test.ts.tmpl"),
]);
