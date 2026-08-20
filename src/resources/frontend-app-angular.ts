import { readFile } from "node:fs/promises";

const resource = (rel: string): Promise<string> =>
  readFile(
    new URL(`../templates/create-frontend-app/angular/${rel}`, import.meta.url),
    "utf8",
  );

export const [
  packageJson,
  angularJson,
  tsconfigJson,
  tsconfigAppJson,
  indexHtml,
  mainTs,
  appConfigTs,
  appTs,
  stylesCss,
  gitignore,
  dockerComposeServiceYml,
  dockerfile,
] = await Promise.all([
  resource("package.json.tmpl"),
  resource("angular.json.tmpl"),
  resource("tsconfig.json.tmpl"),
  resource("tsconfig.app.json.tmpl"),
  resource("src/index.html.tmpl"),
  resource("src/main.ts.tmpl"),
  resource("src/app/app.config.ts.tmpl"),
  resource("src/app/app.ts.tmpl"),
  resource("src/styles.css.tmpl"),
  resource("gitignore.tmpl"),
  resource("docker-compose-service.yml.tmpl"),
  resource("Dockerfile.tmpl"),
]);
