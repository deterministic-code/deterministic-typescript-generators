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
import {
  minimalAppTs,
  minimalHealthTestTs,
  minimalPackageJson,
  minimalServerTs,
  minimalTsconfigJson,
} from "./resources/backend-app-minimal.ts";

const DEFAULT_APP_NAME = "generated-app";
const DEFAULT_COMPLEXITY = "deterministic";

type AppGenerateComplexity = "minimal" | "deterministic";

const complexityOf = (settings: Record<string, string>): AppGenerateComplexity => {
  const raw = settings.app_generate_complexity;
  if (raw === undefined || raw === "") return DEFAULT_COMPLEXITY;
  if (raw === "minimal" || raw === "deterministic") return raw;
  throw new Error(
    `settings.app_generate_complexity must be "minimal" or "deterministic", got ${JSON.stringify(raw)}`,
  );
};

const emitMinimal = (appName: string): GenerateEntry[] => {
  const named = { appName };
  return [
    content("app.ts", fill(minimalAppTs, named)),
    content("server.ts", fill(minimalServerTs, named)),
    content("package.json", fill(minimalPackageJson, named)),
    content("tsconfig.json", fill(minimalTsconfigJson, named)),
    content("__tests__/health.test.ts", fill(minimalHealthTestTs, named)),
  ];
};

// Files the deterministic lane owns outright. Spreading emitMinimal then
// emitting a second kind:content for the same path trips the orchestrator
// CONTENT collision guard (server.ts / tsconfig / health.test differ from
// the scaffold). app.ts and package.json stay content+patch.
const DETERMINISTIC_CONTENT = new Set([
  "server.ts",
  "tsconfig.json",
  "__tests__/health.test.ts",
]);

const emitDeterministic = (appName: string): GenerateEntry[] => {
  const named = { appName };
  return [
    ...emitMinimal(appName).filter((e) => !DETERMINISTIC_CONTENT.has(e.filename)),
    patch("app.ts", appTs),
    content("server.ts", fill(serverTs, named)),
    patch("package.json", fill(packageJson, named)),
    content("tsconfig.json", tsconfigJson),
    patch("Dockerfile", dockerfile),
    patch(".dockerignore", "node_modules"),
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

export const generate = async (
  ctx: GenerateContext,
): Promise<GenerateEntry[]> => {
  const appName = ctx.settings.application_name || DEFAULT_APP_NAME;
  const complexity = complexityOf(ctx.settings);
  return complexity === "minimal"
    ? emitMinimal(appName)
    : emitDeterministic(appName);
};
