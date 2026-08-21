import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { memoryReader } from "@deterministic-code/generators-common/deterministic-reader";
import type { GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import { createCasing } from "../src/common/default-casing.ts";
import { generate } from "../src/generate-backend-app.ts";
import { createImportGenerator } from "../src/import-generator.ts";

const entryBody = (entry: GenerateEntry): string => {
  if ("contents" in entry) return String(entry.contents);
  return entry.content;
};

const byFilename = async (settings: Record<string, string>) => {
  const map = new Map<string, string>();
  for (const entry of await generate({
    reader: memoryReader({}),
    settings,
  })) {
    map.set(entry.filename, entryBody(entry));
  }
  return map;
};

describe("generate backend app casing", () => {
  it("Auto uses Camel files, Pascal types, and Snake fields", async () => {
    const settings = { application_name: "catalog-api" };
    const files = await byFilename(settings);
    const casing = createCasing(settings);
    const imports = createImportGenerator(".", settings);
    assert.ok(files.has(imports.app()));
    assert.ok(files.has(imports.server()));
    assert.ok(files.has(imports.appTest("app_boot")));
    const app = files.get(imports.app())!;
    const server = files.get(imports.server())!;
    assert.match(app, new RegExp(`export async function ${casing.appFnName()}`));
    assert.match(server, new RegExp(`await ${casing.appFnName()}\\(\\)`));
    assert.match(server, new RegExp(`from "./${casing.fileBase("app")}.js"`));
    assert.equal(casing.appFnName(), "CreateBackendApp");
    assert.equal(imports.app(), "app.ts");
  });

  it("Pascal file names", async () => {
    const settings = {
      application_name: "catalog-api",
      "languages.typescript.casing.file_names": "Pascal",
    };
    const files = await byFilename(settings);
    assert.ok(files.has("App.ts"));
    assert.ok(files.has("Server.ts"));
    assert.ok(files.has("__tests__/AppBoot.test.ts"));
    assert.match(files.get("Server.ts")!, /from "\.\/App\.js"/);
    const tsconfig = JSON.parse(files.get("tsconfig.json")!);
    assert.ok(tsconfig.include.includes("App.ts"));
    assert.ok(tsconfig.include.includes("Server.ts"));
  });

  it("Snake file names", async () => {
    const settings = {
      application_name: "catalog-api",
      "languages.typescript.casing.file_names": "Snake",
    };
    const files = await byFilename(settings);
    assert.ok(files.has("app.ts"));
    assert.ok(files.has("server.ts"));
    assert.ok(files.has("__tests__/app_boot.test.ts"));
    assert.match(files.get("server.ts")!, /from "\.\/app\.js"/);
  });

  it("Snake types use create_backend_app", async () => {
    const settings = {
      application_name: "catalog-api",
      "languages.typescript.casing.types": "Snake",
    };
    const files = await byFilename(settings);
    const app = files.get("app.ts")!;
    const server = files.get("server.ts")!;
    assert.match(app, /export async function create_backend_app/);
    assert.match(server, /await create_backend_app\(\)/);
    assert.doesNotMatch(app, /export async function CreateBackendApp/);
    assert.doesNotMatch(app, /export async function createBackendApp/);
  });

  it("Camel fields keep the health status key", async () => {
    const settings = {
      application_name: "catalog-api",
      app_generate_complexity: "minimal",
      "languages.typescript.casing.fields": "Camel",
    };
    const files = await byFilename(settings);
    assert.match(files.get("app.ts")!, /JSON\.stringify\(\{ status: "ok" \}\)/);
  });
});
