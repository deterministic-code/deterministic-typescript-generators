import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { memoryReader } from "@deterministic-code/generators-common/deterministic-reader";
import type { GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import { generate } from "../src/generate-frontend-app.ts";

const entryBody = (entry: GenerateEntry): string =>
  "contents" in entry ? String(entry.contents) : entry.content;

const indexEntries = (entries: GenerateEntry[]): Map<string, GenerateEntry> => {
  const map = new Map<string, GenerateEntry>();
  for (const entry of entries) {
    assert.equal(
      map.has(entry.filename),
      false,
      `duplicate generate entry: ${entry.filename}`,
    );
    map.set(entry.filename, entry);
  }
  return map;
};

const requireEntry = (
  map: Map<string, GenerateEntry>,
  filename: string,
): GenerateEntry => {
  const entry = map.get(filename);
  assert.ok(entry, `missing generate entry: ${filename}`);
  return entry;
};

type FrontendPackageJson = {
  name: string;
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};

const packageJsonOf = (
  map: Map<string, GenerateEntry>,
): FrontendPackageJson =>
  JSON.parse(entryBody(requireEntry(map, "frontend/package.json"))) as FrontendPackageJson;

const assertFrontendTestHarness = (
  pkg: FrontendPackageJson,
  opts: { react: boolean } = { react: true },
): void => {
  assert.equal(pkg.scripts.test, "vitest run");
  assert.ok(pkg.dependencies.axios);
  assert.ok(pkg.dependencies["@tanstack/react-query"]);
  assert.ok(pkg.dependencies.zod);
  assert.ok(pkg.devDependencies["@faker-js/faker"]);
  assert.ok(pkg.devDependencies.vitest);
  if (opts.react) {
    assert.ok(pkg.dependencies.react);
    return;
  }
  assert.equal(pkg.dependencies.react, undefined);
  assert.equal(pkg.dependencies["react-dom"], undefined);
};

describe("generate frontend app", () => {
  it("scaffolds a React Vite app under frontend/", async () => {
    const byName = indexEntries(
      await generate({
        reader: memoryReader({}),
        settings: { application_name: "catalog-ui" },
      }),
    );
    assert.deepEqual(
      [...byName.keys()].sort(),
      [
        "frontend/.gitignore",
        "frontend/index.html",
        "frontend/package.json",
        "frontend/src/App.tsx",
        "frontend/src/main.tsx",
        "frontend/tsconfig.json",
        "frontend/vite.config.ts",
      ],
    );
    assert.equal(requireEntry(byName, "frontend/package.json").kind, "patch");
    const pkg = packageJsonOf(byName);
    assert.equal(pkg.name, "catalog-ui");
    assertFrontendTestHarness(pkg);
    assert.match(
      entryBody(requireEntry(byName, "frontend/vite.config.ts")),
      /include: \["src\/\*\*\/\*\.test\.ts"\]/,
    );
    assert.match(
      entryBody(requireEntry(byName, "frontend/tsconfig.json")),
      /src\/\*\*\/\*\.test\.ts/,
    );
    assert.match(
      entryBody(requireEntry(byName, "frontend/src/App.tsx")),
      /catalog-ui/,
    );
    assert.equal(byName.has("frontend/Dockerfile"), false);
    assert.equal(byName.has("docker-compose.yml"), false);
  });

  it("defaults package.json name and the frontend heading from application_name", async () => {
    const byName = indexEntries(
      await generate({
        reader: memoryReader({}),
        settings: {},
      }),
    );
    assert.equal(
      JSON.parse(entryBody(requireEntry(byName, "frontend/package.json"))).name,
      "generated-frontend",
    );
    assert.match(
      entryBody(requireEntry(byName, "frontend/src/App.tsx")),
      /<h1>generated-frontend<\/h1>/,
    );
    assert.match(
      entryBody(requireEntry(byName, "frontend/index.html")),
      /<title>generated-frontend<\/title>/,
    );
  });

  it("adds compose + Dockerfile for full-stack", async () => {
    const byName = indexEntries(
      await generate({
        reader: memoryReader({}),
        settings: {
          application_name: "catalog-ui",
          application_tier: "full-stack",
        },
      }),
    );
    const compose = requireEntry(byName, "docker-compose.yml");
    assert.equal(compose.kind, "patch");
    assert.equal(
      "section" in compose ? compose.section : undefined,
      "COMPOSE_SERVICE_FRONTEND",
    );
    assert.match(entryBody(compose), /^frontend:/m);
    assert.equal(requireEntry(byName, "frontend/Dockerfile").kind, "content");
  });

  it("scaffolds a Next.js app under frontend/", async () => {
    const byName = indexEntries(
      await generate({
        reader: memoryReader({}),
        settings: {
          application_name: "catalog-ui",
          frontend_generate_framework: "next",
        },
      }),
    );
    assert.deepEqual(
      [...byName.keys()].sort(),
      [
        "frontend/.gitignore",
        "frontend/app/layout.tsx",
        "frontend/app/page.tsx",
        "frontend/next-env.d.ts",
        "frontend/next.config.ts",
        "frontend/package.json",
        "frontend/tsconfig.json",
      ],
    );
    const pkg = packageJsonOf(byName);
    assert.equal(pkg.name, "catalog-ui");
    assertFrontendTestHarness(pkg);
    assert.match(
      entryBody(requireEntry(byName, "frontend/tsconfig.json")),
      /\*\*\/\*\.test\.ts/,
    );
    assert.match(
      entryBody(requireEntry(byName, "frontend/app/page.tsx")),
      /<h1>catalog-ui<\/h1>/,
    );
    assert.match(
      entryBody(requireEntry(byName, "frontend/app/layout.tsx")),
      /title: "catalog-ui"/,
    );
    assert.equal(byName.has("frontend/vite.config.ts"), false);
    assert.equal(byName.has("frontend/index.html"), false);
  });

  it("defaults the Next.js package name and heading from application_name", async () => {
    const byName = indexEntries(
      await generate({
        reader: memoryReader({}),
        settings: { frontend_generate_framework: "next" },
      }),
    );
    assert.equal(
      JSON.parse(entryBody(requireEntry(byName, "frontend/package.json"))).name,
      "generated-frontend",
    );
    assert.match(
      entryBody(requireEntry(byName, "frontend/app/page.tsx")),
      /<h1>generated-frontend<\/h1>/,
    );
  });

  it("adds Next.js compose + Dockerfile for full-stack", async () => {
    const byName = indexEntries(
      await generate({
        reader: memoryReader({}),
        settings: {
          frontend_generate_framework: "next",
          application_tier: "full-stack",
        },
      }),
    );
    const compose = requireEntry(byName, "docker-compose.yml");
    assert.equal(compose.kind, "patch");
    assert.match(entryBody(compose), /:3000/);
    assert.match(
      entryBody(requireEntry(byName, "frontend/Dockerfile")),
      /EXPOSE 3000/,
    );
  });

  it("scaffolds a Svelte app under frontend/", async () => {
    const byName = indexEntries(
      await generate({
        reader: memoryReader({}),
        settings: {
          application_name: "catalog-ui",
          frontend_generate_framework: "svelte",
        },
      }),
    );
    assert.deepEqual(
      [...byName.keys()].sort(),
      [
        "frontend/.gitignore",
        "frontend/index.html",
        "frontend/package.json",
        "frontend/src/App.svelte",
        "frontend/src/main.ts",
        "frontend/src/vite-env.d.ts",
        "frontend/svelte.config.js",
        "frontend/tsconfig.json",
        "frontend/vite.config.ts",
      ],
    );
    const pkg = packageJsonOf(byName);
    assert.equal(pkg.name, "catalog-ui");
    assertFrontendTestHarness(pkg, { react: false });
    assert.match(
      entryBody(requireEntry(byName, "frontend/vite.config.ts")),
      /include: \["src\/\*\*\/\*\.test\.ts"\]/,
    );
    assert.match(
      entryBody(requireEntry(byName, "frontend/tsconfig.json")),
      /src\/\*\*\/\*\.test\.ts/,
    );
    assert.match(
      entryBody(requireEntry(byName, "frontend/src/App.svelte")),
      /<h1>catalog-ui<\/h1>/,
    );
  });

  it("scaffolds an Angular app under frontend/", async () => {
    const byName = indexEntries(
      await generate({
        reader: memoryReader({}),
        settings: {
          application_name: "catalog-ui",
          frontend_generate_framework: "angular",
        },
      }),
    );
    assert.deepEqual(
      [...byName.keys()].sort(),
      [
        "frontend/.gitignore",
        "frontend/angular.json",
        "frontend/package.json",
        "frontend/src/app/app.config.ts",
        "frontend/src/app/app.ts",
        "frontend/src/index.html",
        "frontend/src/main.ts",
        "frontend/src/styles.css",
        "frontend/tsconfig.app.json",
        "frontend/tsconfig.json",
      ],
    );
    const pkg = packageJsonOf(byName);
    assert.equal(pkg.name, "catalog-ui");
    assertFrontendTestHarness(pkg, { react: false });
    assert.match(
      entryBody(requireEntry(byName, "frontend/tsconfig.app.json")),
      /src\/\*\*\/\*\.test\.ts/,
    );
    assert.match(
      entryBody(requireEntry(byName, "frontend/src/app/app.ts")),
      /<h1>catalog-ui<\/h1>/,
    );
    assert.match(
      entryBody(requireEntry(byName, "frontend/src/index.html")),
      /<title>catalog-ui<\/title>/,
    );
  });

  it("adds Svelte and Angular compose + Dockerfile for full-stack", async () => {
    const svelte = indexEntries(
      await generate({
        reader: memoryReader({}),
        settings: {
          frontend_generate_framework: "svelte",
          application_tier: "full-stack",
        },
      }),
    );
    assert.match(
      entryBody(requireEntry(svelte, "frontend/Dockerfile")),
      /EXPOSE 5173/,
    );
    const ng = indexEntries(
      await generate({
        reader: memoryReader({}),
        settings: {
          frontend_generate_framework: "angular",
          application_tier: "full-stack",
        },
      }),
    );
    assert.match(entryBody(requireEntry(ng, "docker-compose.yml")), /:4200/);
    assert.match(
      entryBody(requireEntry(ng, "frontend/Dockerfile")),
      /EXPOSE 4200/,
    );
  });

  it("rejects an unknown frontend_generate_framework", async () => {
    await assert.rejects(
      () =>
        generate({
          reader: memoryReader({}),
          settings: { frontend_generate_framework: "remix" },
        }),
      /settings\.frontend_generate_framework must be "vite", "next", "svelte", "angular"/,
    );
  });
});
