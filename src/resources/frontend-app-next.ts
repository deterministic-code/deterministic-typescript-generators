import { readFile } from "node:fs/promises";

const resource = (rel: string): Promise<string> =>
  readFile(
    new URL(`../templates/create-frontend-app/next/${rel}`, import.meta.url),
    "utf8",
  );

export const [
  packageJson,
  tsconfigJson,
  nextConfigTs,
  nextEnvDts,
  layoutTsx,
  pageTsx,
  gitignore,
  dockerComposeServiceYml,
  dockerfile,
] = await Promise.all([
  resource("package.json.tmpl"),
  resource("tsconfig.json.tmpl"),
  resource("next.config.ts.tmpl"),
  resource("next-env.d.ts.tmpl"),
  resource("app/layout.tsx.tmpl"),
  resource("app/page.tsx.tmpl"),
  resource("gitignore.tmpl"),
  resource("docker-compose-service.yml.tmpl"),
  resource("Dockerfile.tmpl"),
]);
