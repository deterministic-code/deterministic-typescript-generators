import { fill } from "@deterministic-code/generators-common/fill";
import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import { content, patch, type GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import * as angular from "./resources/frontend-app-angular.ts";
import * as next from "./resources/frontend-app-next.ts";
import * as svelte from "./resources/frontend-app-svelte.ts";
import * as vite from "./resources/frontend-app.ts";

const DEFAULT_APPLICATION_NAME = "generated-frontend";
const DEFAULT_FRAMEWORK = "vite";

type FileSpec = {
  filename: string;
  tmpl: string;
  kind: "content" | "patch";
  section?: string;
};

const FRAMEWORKS = {
  vite: {
    scaffold: [
      { filename: "frontend/index.html", tmpl: vite.indexHtml, kind: "content" },
      { filename: "frontend/vite.config.ts", tmpl: vite.viteConfigTs, kind: "content" },
      { filename: "frontend/tsconfig.json", tmpl: vite.tsconfigJson, kind: "content" },
      { filename: "frontend/src/main.tsx", tmpl: vite.mainTsx, kind: "content" },
      { filename: "frontend/src/App.tsx", tmpl: vite.appTsx, kind: "content" },
      { filename: "frontend/package.json", tmpl: vite.packageJson, kind: "patch" },
      { filename: "frontend/.gitignore", tmpl: vite.gitignore, kind: "patch" },
    ] satisfies FileSpec[],
    fullStack: [
      {
        filename: "docker-compose.yml",
        tmpl: vite.dockerComposeServiceYml,
        kind: "patch",
        section: "COMPOSE_SERVICE_FRONTEND",
      },
      { filename: "frontend/Dockerfile", tmpl: vite.dockerfile, kind: "content" },
    ] satisfies FileSpec[],
  },
  next: {
    scaffold: [
      { filename: "frontend/package.json", tmpl: next.packageJson, kind: "patch" },
      { filename: "frontend/tsconfig.json", tmpl: next.tsconfigJson, kind: "content" },
      { filename: "frontend/next.config.ts", tmpl: next.nextConfigTs, kind: "content" },
      { filename: "frontend/next-env.d.ts", tmpl: next.nextEnvDts, kind: "content" },
      { filename: "frontend/app/layout.tsx", tmpl: next.layoutTsx, kind: "content" },
      { filename: "frontend/app/page.tsx", tmpl: next.pageTsx, kind: "content" },
      { filename: "frontend/.gitignore", tmpl: next.gitignore, kind: "patch" },
    ] satisfies FileSpec[],
    fullStack: [
      {
        filename: "docker-compose.yml",
        tmpl: next.dockerComposeServiceYml,
        kind: "patch",
        section: "COMPOSE_SERVICE_FRONTEND",
      },
      { filename: "frontend/Dockerfile", tmpl: next.dockerfile, kind: "content" },
    ] satisfies FileSpec[],
  },
  svelte: {
    scaffold: [
      { filename: "frontend/index.html", tmpl: svelte.indexHtml, kind: "content" },
      { filename: "frontend/vite.config.ts", tmpl: svelte.viteConfigTs, kind: "content" },
      { filename: "frontend/svelte.config.js", tmpl: svelte.svelteConfigJs, kind: "content" },
      { filename: "frontend/tsconfig.json", tmpl: svelte.tsconfigJson, kind: "content" },
      { filename: "frontend/src/vite-env.d.ts", tmpl: svelte.viteEnvDts, kind: "content" },
      { filename: "frontend/src/main.ts", tmpl: svelte.mainTs, kind: "content" },
      { filename: "frontend/src/App.svelte", tmpl: svelte.appSvelte, kind: "content" },
      { filename: "frontend/package.json", tmpl: svelte.packageJson, kind: "patch" },
      { filename: "frontend/.gitignore", tmpl: svelte.gitignore, kind: "patch" },
    ] satisfies FileSpec[],
    fullStack: [
      {
        filename: "docker-compose.yml",
        tmpl: svelte.dockerComposeServiceYml,
        kind: "patch",
        section: "COMPOSE_SERVICE_FRONTEND",
      },
      { filename: "frontend/Dockerfile", tmpl: svelte.dockerfile, kind: "content" },
    ] satisfies FileSpec[],
  },
  angular: {
    scaffold: [
      { filename: "frontend/package.json", tmpl: angular.packageJson, kind: "patch" },
      { filename: "frontend/angular.json", tmpl: angular.angularJson, kind: "content" },
      { filename: "frontend/tsconfig.json", tmpl: angular.tsconfigJson, kind: "content" },
      { filename: "frontend/tsconfig.app.json", tmpl: angular.tsconfigAppJson, kind: "content" },
      { filename: "frontend/src/index.html", tmpl: angular.indexHtml, kind: "content" },
      { filename: "frontend/src/main.ts", tmpl: angular.mainTs, kind: "content" },
      { filename: "frontend/src/styles.css", tmpl: angular.stylesCss, kind: "content" },
      { filename: "frontend/src/app/app.config.ts", tmpl: angular.appConfigTs, kind: "content" },
      { filename: "frontend/src/app/app.ts", tmpl: angular.appTs, kind: "content" },
      { filename: "frontend/.gitignore", tmpl: angular.gitignore, kind: "patch" },
    ] satisfies FileSpec[],
    fullStack: [
      {
        filename: "docker-compose.yml",
        tmpl: angular.dockerComposeServiceYml,
        kind: "patch",
        section: "COMPOSE_SERVICE_FRONTEND",
      },
      { filename: "frontend/Dockerfile", tmpl: angular.dockerfile, kind: "content" },
    ] satisfies FileSpec[],
  },
} as const;

type FrontendFramework = keyof typeof FRAMEWORKS;

const FRAMEWORK_NAMES = Object.keys(FRAMEWORKS)
  .map((name) => JSON.stringify(name))
  .join(", ");

const applicationName = (settings: Record<string, string>): string =>
  settings.application_name || DEFAULT_APPLICATION_NAME;

const frameworkOf = (settings: Record<string, string>): FrontendFramework => {
  const raw = settings.frontend_generate_framework;
  if (raw === undefined || raw === "") return DEFAULT_FRAMEWORK;
  if (raw in FRAMEWORKS) return raw as FrontendFramework;
  throw new Error(
    `settings.frontend_generate_framework must be ${FRAMEWORK_NAMES}, got ${JSON.stringify(raw)}`,
  );
};

const emit = (
  spec: FileSpec,
  tokens: Record<string, unknown>,
): GenerateEntry => {
  const body = fill(spec.tmpl, tokens);
  return spec.kind === "patch"
    ? patch(spec.filename, body, spec.section)
    : content(spec.filename, body);
};

export const generate = async (
  ctx: GenerateContext,
): Promise<GenerateEntry[]> => {
  const tokens = { application_name: applicationName(ctx.settings) };
  const { scaffold, fullStack } = FRAMEWORKS[frameworkOf(ctx.settings)];
  const specs =
    ctx.settings.application_tier === "full-stack"
      ? [...scaffold, ...fullStack]
      : [...scaffold];
  return specs.map((spec) => emit(spec, tokens));
};
