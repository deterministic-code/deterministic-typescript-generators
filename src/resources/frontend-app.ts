import { readFile } from "node:fs/promises";

const resource = (rel: string): Promise<string> =>
  readFile(
    new URL(`../templates/create-frontend-app/${rel}`, import.meta.url),
    "utf8",
  );

export const [
  indexHtml,
  viteConfigTs,
  tsconfigJson,
  mainTsx,
  appTsx,
  packageJson,
  gitignore,
  dockerComposeServiceYml,
  dockerfile,
] = await Promise.all([
  resource("index.html.tmpl"),
  resource("vite.config.ts.tmpl"),
  resource("tsconfig.json.tmpl"),
  resource("src/main.tsx.tmpl"),
  resource("src/App.tsx.tmpl"),
  resource("package.json.tmpl"),
  resource("gitignore.tmpl"),
  resource("docker-compose-service.yml.tmpl"),
  resource("Dockerfile.tmpl"),
]);
