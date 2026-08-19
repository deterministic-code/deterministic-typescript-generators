import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { memoryReader } from "@deterministic-code/generators-common/deterministic-reader";
import type { GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import { generate } from "./generate-backend-app.ts";

function entryBody(entry: GenerateEntry): string {
  if ("contents" in entry) return String(entry.contents);
  return entry.content;
}

function indexEntries(entries: GenerateEntry[]): Map<string, GenerateEntry> {
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
}

function requireEntry(
  map: Map<string, GenerateEntry>,
  filename: string,
): GenerateEntry {
  const entry = map.get(filename);
  assert.ok(entry, `missing generate entry: ${filename}`);
  return entry;
}

describe("generate", () => {
  let byName = new Map<string, GenerateEntry>();

  before(async () => {
    byName = indexEntries(
      await generate({
        reader: memoryReader({}),
        settings: { application_name: "catalog-api" },
      }),
    );
  });

  it("emits the flat single-language scaffold", () => {
    assert.deepEqual(
      [...byName.keys()].sort(),
      [
        ".dockerignore",
        ".env",
        ".env.example",
        ".gitignore",
        "Dockerfile",
        "__tests__/app-boot.test.ts",
        "__tests__/health.test.ts",
        "app.ts",
        "docker-compose.yml",
        "package.json",
        "scripts/entrypoint.sh",
        "server.ts",
        "tsconfig.json",
        "vitest.config.ts",
      ],
    );
    for (const filename of byName.keys()) {
      assert.equal(filename.startsWith("typescript/"), false, filename);
      assert.equal(filename.startsWith("backend/"), false, filename);
      assert.equal(filename.startsWith("features/"), false, filename);
      assert.equal(filename.startsWith("_deterministic/"), false, filename);
    }
    const dockerignore = requireEntry(byName, ".dockerignore");
    assert.equal(dockerignore.kind, "patch");
    assert.equal(
      "section" in dockerignore ? dockerignore.section : undefined,
      "DOCKERIGNORE_TYPESCRIPT",
    );
    assert.equal(entryBody(dockerignore), "node_modules");
  });

  it("renders app.ts against the npm library", () => {
    const app = entryBody(requireEntry(byName, "app.ts"));
    assert.equal(requireEntry(byName, "app.ts").kind, "patch");
    assert.match(
      app,
      /from "@deterministic-code\/deterministic\/app"/,
    );
    assert.doesNotMatch(app, /app-wiring/);
    assert.doesNotMatch(app, /composeRouter/);
    assert.doesNotMatch(app, /customModulePaths/);
    assert.doesNotMatch(app, /_deterministic\/app/);
    assert.match(app, /BEGIN APP_DB_IMPORTS/);
    assert.match(app, /BEGIN APP_BEFORE_HOOK/);
    assert.match(app, /BEGIN APP_AFTER_HOOK/);
    assert.match(app, /export async function createBackendApp/);
  });

  it("renders server.ts with the typescript lane port and application name", () => {
    const server = entryBody(requireEntry(byName, "server.ts"));
    assert.equal(requireEntry(byName, "server.ts").kind, "content");
    assert.match(server, /process\.env\.PORT \?\? 4001/);
    assert.match(server, /catalog-api listening on http:\/\/localhost:/);
    assert.match(server, /await createBackendApp\(\)/);
    assert.doesNotMatch(server, /\.then\(/);
  });

  it("renders package.json for the npm library, not bundled runtime deps", () => {
    const pkg = JSON.parse(entryBody(requireEntry(byName, "package.json")));
    assert.equal(pkg.name, "catalog-api");
    assert.equal(pkg.type, "module");
    assert.equal(
      pkg.dependencies["@deterministic-code/deterministic"],
      "^0.0.6",
    );
    assert.equal(pkg.dependencies.express, undefined);
  });

  it("copies the project from the image root, not a language lane", () => {
    const dockerfile = entryBody(requireEntry(byName, "Dockerfile"));
    assert.match(dockerfile, /^COPY package\*\.json tsconfig\.json \.\/$/m);
    assert.match(dockerfile, /^COPY \. \.\/$/m);
    assert.doesNotMatch(dockerfile, /typescript\//);
    assert.doesNotMatch(dockerfile, /COPY deterministic /);
    assert.doesNotMatch(dockerfile, /_deterministic/);
  });

  it("renders a root compose service without a lane dockerfile path", () => {
    const compose = entryBody(requireEntry(byName, "docker-compose.yml"));
    assert.match(compose, /^app:/m);
    assert.match(compose, /HOST_PORT/);
    assert.match(compose, /deterministic\.language=typescript/);
    assert.doesNotMatch(compose, /dockerfile:/);
    assert.doesNotMatch(compose, /typescript\/Dockerfile/);
  });

  it("emits health and boot tests from templates", () => {
    const health = entryBody(requireEntry(byName, "__tests__/health.test.ts"));
    assert.match(health, /GET \/api\/health/);
    assert.match(health, /await createBackendApp\(\)/);
    assert.doesNotMatch(health, /\.then\(/);
    const boot = entryBody(requireEntry(byName, "__tests__/app-boot.test.ts"));
    assert.match(boot, /createBackendApp/);
    assert.match(boot, /await createBackendApp\(\)/);
  });

  it("treats omitted app_generate_complexity as deterministic", async () => {
    const omitted = await generate({
      reader: memoryReader({}),
      settings: { application_name: "catalog-api" },
    });
    const explicit = await generate({
      reader: memoryReader({}),
      settings: {
        application_name: "catalog-api",
        app_generate_complexity: "deterministic",
      },
    });
    assert.deepEqual(
      omitted.map((e) => e.filename).sort(),
      explicit.map((e) => e.filename).sort(),
    );
  });

  it("rejects an unknown app_generate_complexity", async () => {
    await assert.rejects(
      () =>
        generate({
          reader: memoryReader({}),
          settings: {
            application_name: "catalog-api",
            app_generate_complexity: "full",
          },
        }),
      /settings\.app_generate_complexity must be "minimal" or "deterministic"/,
    );
  });
});

describe("generate minimal", () => {
  let byName = new Map<string, GenerateEntry>();

  before(async () => {
    byName = indexEntries(
      await generate({
        reader: memoryReader({}),
        settings: {
          application_name: "catalog-api",
          app_generate_complexity: "minimal",
        },
      }),
    );
  });

  it("emits only the boot and health-check scaffold", () => {
    assert.deepEqual(
      [...byName.keys()].sort(),
      [
        "__tests__/health.test.ts",
        "app.ts",
        "package.json",
        "server.ts",
        "tsconfig.json",
      ],
    );
  });

  it("omits docker, vitest, migrate hooks, and extra test tooling", () => {
    const app = entryBody(requireEntry(byName, "app.ts"));
    assert.doesNotMatch(app, /BEGIN APP_DB_IMPORTS/);
    assert.doesNotMatch(app, /BEGIN APP_BEFORE_HOOK/);
    assert.doesNotMatch(app, /@deterministic-code\/deterministic/);
    assert.doesNotMatch(app, /createDeterministicApp/);
    assert.doesNotMatch(app, /settingsConfig/);
    const pkg = JSON.parse(entryBody(requireEntry(byName, "package.json")));
    assert.equal(pkg.name, "catalog-api");
    assert.equal(pkg.dependencies, undefined);
    assert.deepEqual(Object.keys(pkg.devDependencies).sort(), [
      "@types/node",
      "typescript",
    ]);
    assert.equal(
      pkg.scripts.test,
      "node --experimental-strip-types --test __tests__/health.test.ts",
    );
    const tsconfig = JSON.parse(entryBody(requireEntry(byName, "tsconfig.json")));
    assert.deepEqual(tsconfig.include, ["app.ts", "server.ts"]);
    const health = entryBody(requireEntry(byName, "__tests__/health.test.ts"));
    assert.match(health, /GET \/api\/health/);
    assert.match(health, /from "node:test"/);
    const server = entryBody(requireEntry(byName, "server.ts"));
    assert.match(server, /await createBackendApp\(\)/);
    assert.match(server, /createServer\(app\)/);
    assert.doesNotMatch(server, /\.then\(/);
  });
});

