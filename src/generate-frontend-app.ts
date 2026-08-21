import { fill } from "@deterministic-code/generators-common/fill";
import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import { content, patch, type GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import * as angular from "./resources/frontend-app-angular.ts";
import * as next from "./resources/frontend-app-next.ts";
import * as svelte from "./resources/frontend-app-svelte.ts";
import * as vite from "./resources/frontend-app.ts";
import { Emit } from "./emit.ts";
import type { TypeScriptImportGenerator } from "./import-generator.ts";
import type { FrontendFramework } from "@deterministic-code/generators-common/settings";

type FileSpec = {
  filename: string;
  tmpl: string;
  kind: "content" | "patch";
  section?: string;
};

const frameworks = (
  imports: TypeScriptImportGenerator,
): Record<
  FrontendFramework,
  { scaffold: FileSpec[]; fullStack: FileSpec[] }
> => ({
  vite: {
    scaffold: [
      { filename: imports.frontend("index.html"), tmpl: vite.indexHtml, kind: "content" },
      { filename: imports.frontend("vite.config.ts"), tmpl: vite.viteConfigTs, kind: "content" },
      { filename: imports.frontend("tsconfig.json"), tmpl: vite.tsconfigJson, kind: "content" },
      { filename: imports.frontend("src/main.tsx"), tmpl: vite.mainTsx, kind: "content" },
      { filename: imports.frontend("src/App.tsx"), tmpl: vite.appTsx, kind: "content" },
      { filename: imports.frontend("package.json"), tmpl: vite.packageJson, kind: "patch" },
      { filename: imports.frontend(".gitignore"), tmpl: vite.gitignore, kind: "patch" },
    ] satisfies FileSpec[],
    fullStack: [
      {
        filename: "docker-compose.yml",
        tmpl: vite.dockerComposeServiceYml,
        kind: "patch",
        section: "COMPOSE_SERVICE_FRONTEND",
      },
      { filename: imports.frontend("Dockerfile"), tmpl: vite.dockerfile, kind: "content" },
    ] satisfies FileSpec[],
  },
  next: {
    scaffold: [
      { filename: imports.frontend("package.json"), tmpl: next.packageJson, kind: "patch" },
      { filename: imports.frontend("tsconfig.json"), tmpl: next.tsconfigJson, kind: "content" },
      { filename: imports.frontend("next.config.ts"), tmpl: next.nextConfigTs, kind: "content" },
      { filename: imports.frontend("next-env.d.ts"), tmpl: next.nextEnvDts, kind: "content" },
      { filename: imports.frontend("app/layout.tsx"), tmpl: next.layoutTsx, kind: "content" },
      { filename: imports.frontend("app/page.tsx"), tmpl: next.pageTsx, kind: "content" },
      { filename: imports.frontend(".gitignore"), tmpl: next.gitignore, kind: "patch" },
    ] satisfies FileSpec[],
    fullStack: [
      {
        filename: "docker-compose.yml",
        tmpl: next.dockerComposeServiceYml,
        kind: "patch",
        section: "COMPOSE_SERVICE_FRONTEND",
      },
      { filename: imports.frontend("Dockerfile"), tmpl: next.dockerfile, kind: "content" },
    ] satisfies FileSpec[],
  },
  svelte: {
    scaffold: [
      { filename: imports.frontend("index.html"), tmpl: svelte.indexHtml, kind: "content" },
      { filename: imports.frontend("vite.config.ts"), tmpl: svelte.viteConfigTs, kind: "content" },
      { filename: imports.frontend("svelte.config.js"), tmpl: svelte.svelteConfigJs, kind: "content" },
      { filename: imports.frontend("tsconfig.json"), tmpl: svelte.tsconfigJson, kind: "content" },
      { filename: imports.frontend("src/vite-env.d.ts"), tmpl: svelte.viteEnvDts, kind: "content" },
      { filename: imports.frontend("src/main.ts"), tmpl: svelte.mainTs, kind: "content" },
      { filename: imports.frontend("src/App.svelte"), tmpl: svelte.appSvelte, kind: "content" },
      { filename: imports.frontend("package.json"), tmpl: svelte.packageJson, kind: "patch" },
      { filename: imports.frontend(".gitignore"), tmpl: svelte.gitignore, kind: "patch" },
    ] satisfies FileSpec[],
    fullStack: [
      {
        filename: "docker-compose.yml",
        tmpl: svelte.dockerComposeServiceYml,
        kind: "patch",
        section: "COMPOSE_SERVICE_FRONTEND",
      },
      { filename: imports.frontend("Dockerfile"), tmpl: svelte.dockerfile, kind: "content" },
    ] satisfies FileSpec[],
  },
  angular: {
    scaffold: [
      { filename: imports.frontend("package.json"), tmpl: angular.packageJson, kind: "patch" },
      { filename: imports.frontend("angular.json"), tmpl: angular.angularJson, kind: "content" },
      { filename: imports.frontend("tsconfig.json"), tmpl: angular.tsconfigJson, kind: "content" },
      { filename: imports.frontend("tsconfig.app.json"), tmpl: angular.tsconfigAppJson, kind: "content" },
      { filename: imports.frontend("src/index.html"), tmpl: angular.indexHtml, kind: "content" },
      { filename: imports.frontend("src/main.ts"), tmpl: angular.mainTs, kind: "content" },
      { filename: imports.frontend("src/styles.css"), tmpl: angular.stylesCss, kind: "content" },
      { filename: imports.frontend("src/app/app.config.ts"), tmpl: angular.appConfigTs, kind: "content" },
      { filename: imports.frontend("src/app/app.ts"), tmpl: angular.appTs, kind: "content" },
      { filename: imports.frontend(".gitignore"), tmpl: angular.gitignore, kind: "patch" },
    ] satisfies FileSpec[],
    fullStack: [
      {
        filename: "docker-compose.yml",
        tmpl: angular.dockerComposeServiceYml,
        kind: "patch",
        section: "COMPOSE_SERVICE_FRONTEND",
      },
      { filename: imports.frontend("Dockerfile"), tmpl: angular.dockerfile, kind: "content" },
    ] satisfies FileSpec[],
  },
} );

class Generator extends Emit {
  from(): GenerateEntry[] {
    const tokens = { application_name: this.settings.applicationName };
    const { scaffold, fullStack } = frameworks(this.imports)[
      this.settings.frontendFramework
    ];
    const specs =
      this.settings.fullStack
        ? [...scaffold, ...fullStack]
        : [...scaffold];
    return specs.map((spec) => {
      const body = fill(spec.tmpl, tokens);
      return spec.kind === "patch"
        ? patch(spec.filename, body, spec.section)
        : content(spec.filename, body);
    });
  }
}

export const generate = async (
  ctx: GenerateContext,
): Promise<GenerateEntry[]> => new Generator(ctx.settings).from();
