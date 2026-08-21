import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { memoryReader } from "@deterministic-code/generators-common/deterministic-reader";
import type { GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import { createCasing } from "../src/common/default-casing.ts";
import { generate } from "../src/generate-frontend-app.ts";

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

describe("generate frontend app casing", () => {
  it("Auto uses Camel files and Pascal types", async () => {
    const settings = { application_name: "catalog-ui" };
    const files = await byFilename(settings);
    const casing = createCasing(settings);
    assert.ok(files.has("frontend/src/app.tsx"));
    assert.ok(files.has("frontend/src/main.tsx"));
    const app = files.get("frontend/src/app.tsx")!;
    const main = files.get("frontend/src/main.tsx")!;
    assert.match(app, new RegExp(`export default function ${casing.appComponentName()}`));
    assert.match(main, new RegExp(`import ${casing.appComponentName()} from "./${casing.fileBase("app")}"`));
    assert.equal(casing.appComponentName(), "App");
  });

  it("Pascal file names", async () => {
    const files = await byFilename({
      application_name: "catalog-ui",
      "languages.typescript.casing.file_names": "Pascal",
    });
    assert.ok(files.has("frontend/src/App.tsx"));
    assert.ok(files.has("frontend/src/Main.tsx"));
    assert.match(files.get("frontend/src/Main.tsx")!, /from "\.\/App"/);
    assert.match(files.get("frontend/index.html")!, /src="\/src\/Main\.tsx"/);
  });

  it("Snake file names", async () => {
    const files = await byFilename({
      application_name: "catalog-ui",
      "languages.typescript.casing.file_names": "Snake",
    });
    assert.ok(files.has("frontend/src/app.tsx"));
    assert.ok(files.has("frontend/src/main.tsx"));
    assert.match(files.get("frontend/src/main.tsx")!, /from "\.\/app"/);
  });

  it("Snake types use app / home / root_layout / app_config", async () => {
    const settings = {
      application_name: "catalog-ui",
      "languages.typescript.casing.types": "Snake",
    };
    const vite = await byFilename(settings);
    assert.match(vite.get("frontend/src/app.tsx")!, /export default function app\(/);
    assert.match(vite.get("frontend/src/main.tsx")!, /import app from "\.\/app"/);
    assert.doesNotMatch(vite.get("frontend/src/app.tsx")!, /export default function App\(/);

    const next = await byFilename({
      ...settings,
      frontend_generate_framework: "next",
    });
    assert.match(next.get("frontend/app/page.tsx")!, /export default function home\(/);
    assert.match(next.get("frontend/app/layout.tsx")!, /export default function root_layout\(/);

    const ng = await byFilename({
      ...settings,
      frontend_generate_framework: "angular",
    });
    assert.match(ng.get("frontend/src/app/app.ts")!, /export class app \{\}/);
    assert.match(ng.get("frontend/src/app/appConfig.ts")!, /export const app_config:/);
    assert.match(ng.get("frontend/src/main.ts")!, /import \{ app \} from "\.\/app\/app"/);
    assert.match(ng.get("frontend/src/main.ts")!, /import \{ app_config \} from "\.\/app\/appConfig"/);
  });

  it("Pascal directories rename the Angular app folder", async () => {
    const files = await byFilename({
      application_name: "catalog-ui",
      frontend_generate_framework: "angular",
      "languages.typescript.casing.directories": "Pascal",
      "languages.typescript.casing.file_names": "Pascal",
    });
    assert.ok(files.has("frontend/src/App/App.ts"));
    assert.ok(files.has("frontend/src/App/AppConfig.ts"));
    assert.match(files.get("frontend/src/Main.ts")!, /from "\.\/App\/App"/);
    assert.match(files.get("frontend/src/Main.ts")!, /from "\.\/App\/AppConfig"/);
  });
});
