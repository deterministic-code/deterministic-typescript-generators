import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { memoryReader } from "@deterministic-code/generators-common/deterministic-reader";
import type { GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import { generate } from "../src/generate-routes-e2e-test.ts";

const DS_YAML = `types:
  - user:
      fields:
        - email:
            type: string
            is_unique: true
`;

const VIEW_YAML = `includes:
  - datasource_types:
      include: "*"
types: []
`;

const ROUTES_YAML = `includes:
  - view_type_routes:
      filter: 'type is view_type || type is datasource_type'
`;

const textOf = (entries: GenerateEntry[], path: string): string => {
  const hit = entries.find((e) => e.kind === "content" && e.filename === path);
  assert.ok(
    hit,
    `missing entry ${path}; got ${entries.map((e) => e.filename).join(", ")}`,
  );
  assert.equal(hit.kind, "content");
  return hit.contents;
};

describe("generate-routes-e2e-test", () => {
  it("emits a file-backed sqlite app integration test, not an in-memory db", async () => {
    const entries = await generate({
      reader: memoryReader({
        "datasource_types.yaml": DS_YAML,
        "view_types.yaml": VIEW_YAML,
        "routes.yaml": ROUTES_YAML,
      }),
      settings: {},
    });
    const body = textOf(entries, "__tests__/app.integration.test.ts");
    assert.match(body, /npm_package_config_test_db/);
    assert.match(body, /backend: "sqlite"/);
    assert.doesNotMatch(body, /backend: "memory"/);
    assert.match(body, /from "supertest"/);
  });
});
