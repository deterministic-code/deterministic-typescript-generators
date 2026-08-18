import { fill } from "./common/fill.ts";
import type { GenerateContext } from "./common/generate-context.ts";
import { content, patch, type GenerateEntry } from "./common/generate-entry.ts";
import {
  appTsx,
  dockerComposeServiceYml,
  dockerfile,
  gitignore,
  indexHtml,
  mainTsx,
  packageJson,
  tsconfigJson,
  viteConfigTs,
} from "./resources/frontend-app.ts";

const DEFAULT_APP_NAME = "generated-frontend";

export const generate = async (
  ctx: GenerateContext,
): Promise<GenerateEntry[]> => {
  const appName = ctx.settings.application_name || DEFAULT_APP_NAME;
  const named = { appName };
  const entries: GenerateEntry[] = [
    content("frontend/index.html", fill(indexHtml, named)),
    content("frontend/vite.config.ts", viteConfigTs),
    content("frontend/tsconfig.json", tsconfigJson),
    content("frontend/src/main.tsx", mainTsx),
    content("frontend/src/App.tsx", fill(appTsx, named)),
    patch("frontend/package.json", fill(packageJson, named)),
    patch("frontend/.gitignore", gitignore),
  ];
  if (ctx.settings.application_tier === "full-stack") {
    entries.push(
      patch(
        "docker-compose.yml",
        dockerComposeServiceYml,
        "COMPOSE_SERVICE_FRONTEND",
      ),
      content("frontend/Dockerfile", dockerfile),
    );
  }
  return entries;
};
