import { readFile } from "node:fs/promises";

const resource = (rel: string): Promise<string> =>
  readFile(
    new URL(`../templates/create-frontend-app/svelte/${rel}`, import.meta.url),
    "utf8",
  );

export const [
  packageJson,
  viteConfigTs,
  svelteConfigJs,
  tsconfigJson,
  indexHtml,
  viteEnvDts,
  mainTs,
  appSvelte,
  gitignore,
  dockerComposeServiceYml,
  dockerfile,
] = await Promise.all([
  resource("package.json.tmpl"),
  resource("vite.config.ts.tmpl"),
  resource("svelte.config.js.tmpl"),
  resource("tsconfig.json.tmpl"),
  resource("index.html.tmpl"),
  resource("src/vite-env.d.ts.tmpl"),
  resource("src/main.ts.tmpl"),
  resource("src/App.svelte.tmpl"),
  resource("gitignore.tmpl"),
  resource("docker-compose-service.yml.tmpl"),
  resource("Dockerfile.tmpl"),
]);
