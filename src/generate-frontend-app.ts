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

const DEFAULT_APPLICATION_NAME = "generated-frontend";

const applicationName = (settings: Record<string, string>): string =>
  settings.application_name || DEFAULT_APPLICATION_NAME;

type FileSpec = {
  filename: string;
  tmpl: string;
  kind: "content" | "patch";
  section?: string;
};

const SCAFFOLD: FileSpec[] = [
  { filename: "frontend/index.html", tmpl: indexHtml, kind: "content" },
  { filename: "frontend/vite.config.ts", tmpl: viteConfigTs, kind: "content" },
  { filename: "frontend/tsconfig.json", tmpl: tsconfigJson, kind: "content" },
  { filename: "frontend/src/main.tsx", tmpl: mainTsx, kind: "content" },
  { filename: "frontend/src/App.tsx", tmpl: appTsx, kind: "content" },
  { filename: "frontend/package.json", tmpl: packageJson, kind: "patch" },
  { filename: "frontend/.gitignore", tmpl: gitignore, kind: "patch" },
];

const FULL_STACK: FileSpec[] = [
  {
    filename: "docker-compose.yml",
    tmpl: dockerComposeServiceYml,
    kind: "patch",
    section: "COMPOSE_SERVICE_FRONTEND",
  },
  { filename: "frontend/Dockerfile", tmpl: dockerfile, kind: "content" },
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

export const generate = async (
  ctx: GenerateContext,
): Promise<GenerateEntry[]> => {
  const tokens = { application_name: applicationName(ctx.settings) };
  const specs =
    ctx.settings.application_tier === "full-stack"
      ? [...SCAFFOLD, ...FULL_STACK]
      : SCAFFOLD;
  return specs.map((spec) => emit(spec, tokens));
};
