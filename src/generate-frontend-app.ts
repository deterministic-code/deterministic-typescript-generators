import { fill } from "@deterministic-code/generators-common/fill";
import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import { content, patch, type GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
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
import {
  dockerComposeServiceYml as nextDockerComposeServiceYml,
  dockerfile as nextDockerfile,
  gitignore as nextGitignore,
  layoutTsx,
  nextConfigTs,
  nextEnvDts,
  packageJson as nextPackageJson,
  pageTsx,
  tsconfigJson as nextTsconfigJson,
} from "./resources/frontend-app-next.ts";

const DEFAULT_APPLICATION_NAME = "generated-frontend";
const DEFAULT_FRAMEWORK = "vite";

type FrontendFramework = "vite" | "next";

const applicationName = (settings: Record<string, string>): string =>
  settings.application_name || DEFAULT_APPLICATION_NAME;

const frameworkOf = (settings: Record<string, string>): FrontendFramework => {
  const raw = settings.frontend_generate_framework;
  if (raw === undefined || raw === "") return DEFAULT_FRAMEWORK;
  if (raw === "vite" || raw === "next") return raw;
  throw new Error(
    `settings.frontend_generate_framework must be "vite" or "next", got ${JSON.stringify(raw)}`,
  );
};

type FileSpec = {
  filename: string;
  tmpl: string;
  kind: "content" | "patch";
  section?: string;
};

const VITE_SCAFFOLD: FileSpec[] = [
  { filename: "frontend/index.html", tmpl: indexHtml, kind: "content" },
  { filename: "frontend/vite.config.ts", tmpl: viteConfigTs, kind: "content" },
  { filename: "frontend/tsconfig.json", tmpl: tsconfigJson, kind: "content" },
  { filename: "frontend/src/main.tsx", tmpl: mainTsx, kind: "content" },
  { filename: "frontend/src/App.tsx", tmpl: appTsx, kind: "content" },
  { filename: "frontend/package.json", tmpl: packageJson, kind: "patch" },
  { filename: "frontend/.gitignore", tmpl: gitignore, kind: "patch" },
];

const VITE_FULL_STACK: FileSpec[] = [
  {
    filename: "docker-compose.yml",
    tmpl: dockerComposeServiceYml,
    kind: "patch",
    section: "COMPOSE_SERVICE_FRONTEND",
  },
  { filename: "frontend/Dockerfile", tmpl: dockerfile, kind: "content" },
];

const NEXT_SCAFFOLD: FileSpec[] = [
  { filename: "frontend/package.json", tmpl: nextPackageJson, kind: "patch" },
  { filename: "frontend/tsconfig.json", tmpl: nextTsconfigJson, kind: "content" },
  { filename: "frontend/next.config.ts", tmpl: nextConfigTs, kind: "content" },
  { filename: "frontend/next-env.d.ts", tmpl: nextEnvDts, kind: "content" },
  { filename: "frontend/app/layout.tsx", tmpl: layoutTsx, kind: "content" },
  { filename: "frontend/app/page.tsx", tmpl: pageTsx, kind: "content" },
  { filename: "frontend/.gitignore", tmpl: nextGitignore, kind: "patch" },
];

const NEXT_FULL_STACK: FileSpec[] = [
  {
    filename: "docker-compose.yml",
    tmpl: nextDockerComposeServiceYml,
    kind: "patch",
    section: "COMPOSE_SERVICE_FRONTEND",
  },
  { filename: "frontend/Dockerfile", tmpl: nextDockerfile, kind: "content" },
];

const emit = (
  spec: FileSpec,
  tokens: Record<string, unknown>,
): GenerateEntry => {
  const body = fill(spec.tmpl, tokens);
  return spec.kind === "patch"
    ? patch(spec.filename, body, spec.section)
    : content(spec.filename, body);
};

const specsFor = (
  framework: FrontendFramework,
  fullStack: boolean,
): FileSpec[] => {
  const scaffold = framework === "next" ? NEXT_SCAFFOLD : VITE_SCAFFOLD;
  if (!fullStack) return scaffold;
  return [
    ...scaffold,
    ...(framework === "next" ? NEXT_FULL_STACK : VITE_FULL_STACK),
  ];
};

export const generate = async (
  ctx: GenerateContext,
): Promise<GenerateEntry[]> => {
  const tokens = { application_name: applicationName(ctx.settings) };
  return specsFor(
    frameworkOf(ctx.settings),
    ctx.settings.application_tier === "full-stack",
  ).map((spec) => emit(spec, tokens));
};
