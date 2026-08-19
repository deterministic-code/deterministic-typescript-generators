import { fill } from "@deterministic-code/generators-common/fill";
import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import { content, patch, type GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import {
  appBootTestTs,
  appTs,
  dockerComposeYml,
  dockerfile,
  entrypointSh,
  envFile,
  gitignore,
  healthTestTs,
  packageJson,
  serverTs,
  tsconfigJson,
  vitestConfigTs,
} from "./resources/backend-app.ts";

const DEFAULT_APP_NAME = "generated-app";

export const generate = async (
  ctx: GenerateContext,
): Promise<GenerateEntry[]> => {
  const appName = ctx.settings.application_name || DEFAULT_APP_NAME;
  const named = { appName };
  return [
    patch("app.ts", appTs),
    content("server.ts", fill(serverTs, named)),
    patch("package.json", fill(packageJson, named)),
    content("tsconfig.json", tsconfigJson),
    patch("Dockerfile", dockerfile),
    patch(".dockerignore", "node_modules", "DOCKERIGNORE_TYPESCRIPT"),
    patch("scripts/entrypoint.sh", entrypointSh),
    patch("docker-compose.yml", dockerComposeYml),
    patch(".env", envFile),
    patch(".env.example", envFile),
    patch(".gitignore", gitignore),
    content("vitest.config.ts", vitestConfigTs),
    content("__tests__/health.test.ts", healthTestTs),
    content("__tests__/app-boot.test.ts", appBootTestTs),
  ];
};
