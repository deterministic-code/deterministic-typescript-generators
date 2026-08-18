import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { memoryReader } from "./common/deterministic-reader.ts";
import type { GenerateEntry } from "./common/generate-entry.ts";
import { generate } from "./generate-service-tests.ts";

const DS_YAML = `types:
  - user:
      fields:
        - email:
            type: string
            is_unique: true
            size: 256
  - role:
      datasource_type: readonly-lookup
      fields:
        - name:
            type: string
            is_unique: true
  - sku:
      fields:
        - code:
            type: string
            primary_key: true
`;

const VIEW_YAML = `includes:
  - datasource_types:
      include: "*"
types: []
`;

const SERVICES_YAML = `includes:
  - view_type_services:
      filter: 'type is view_type'
services:
  - name: ReportService
`;

const NO_INCLUDES = `services:
  - name: ReportService
`;

const fixtureReader = (files: Record<string, string>) => memoryReader(files);

const yaml = {
  "datasource_types.yaml": DS_YAML,
  "view_types.yaml": VIEW_YAML,
  "services.yaml": SERVICES_YAML,
};

const textOf = (entries: GenerateEntry[], path: string): string => {
  const hit = entries.find((e) => e.kind === "content" && e.filename === path);
  assert.ok(hit, `missing entry ${path}`);
  assert.equal(hit.kind, "content");
  return hit.contents;
};

describe("generate-service-tests", () => {
  it("emits a mock unit test per generic service and skips custom stubs", async () => {
    const entries = await generate({
      reader: fixtureReader(yaml),
      settings: {},
    });
    const paths = entries.map((e) => e.filename).sort();
    assert.deepEqual(paths, [
      "role-service.test.ts",
      "sku-service.test.ts",
      "user-service.test.ts",
    ]);

    const user = textOf(entries, "user-service.test.ts");
    assert.match(user, /import \{ faker \} from "@faker-js\/faker"/);
    assert.match(
      user,
      /from "@deterministic-code\/deterministic\/repositories"/,
    );
    assert.match(user, /import \{ UserService \} from "\.\.\/user-service"/);
    assert.match(user, /entityName: "user"/);
    assert.match(user, /new PrimaryKey\("id", "integer"\)/);
    assert.match(user, /faker\.number\.int\(\{ min: 1 \}\)/);
    assert.match(user, /findAll delegates to the repository/);

    const sku = textOf(entries, "sku-service.test.ts");
    assert.match(sku, /new PrimaryKey\("code", "string"\)/);
    assert.match(sku, /faker\.string\.alphanumeric/);
  });

  it("emits nothing without view_type_services", async () => {
    const entries = await generate({
      reader: fixtureReader({
        ...yaml,
        "services.yaml": NO_INCLUDES,
      }),
      settings: {},
    });
    assert.deepEqual(entries, []);
  });

  it("nests tests under features/…/__tests__ when by-feature", async () => {
    const entries = await generate({
      reader: fixtureReader(yaml),
      settings: { "other.organize_by_feature": "true" },
    });
    const paths = entries.map((e) => e.filename).sort();
    assert.ok(paths.includes("features/user/__tests__/user-service.test.ts"));
    const user = textOf(entries, "features/user/__tests__/user-service.test.ts");
    assert.match(user, /from "\.\.\/user-service"/);
  });

  it("uses the project id_type for the implicit id PK", async () => {
    const entries = await generate({
      reader: fixtureReader(yaml),
      settings: { "datasource.id_type": "uuid" },
    });
    const user = textOf(entries, "user-service.test.ts");
    assert.match(user, /new PrimaryKey\("id", "uuid"\)/);
    assert.match(user, /faker\.string\.uuid\(\)/);
  });

  it("points repository imports at bundled _deterministic when requested", async () => {
    const entries = await generate({
      reader: fixtureReader(yaml),
      settings: {
        "languages.typescript.library_reference_mode": "bundled",
      },
    });
    const user = textOf(entries, "user-service.test.ts");
    assert.match(user, /from "\.\.\/\.\.\/\.\.\/_deterministic\/repositories\.js"/);
  });
});
