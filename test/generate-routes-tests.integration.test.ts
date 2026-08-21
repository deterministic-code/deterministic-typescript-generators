import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { memoryReader } from "@deterministic-code/generators-common/deterministic-reader";
import type { GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import { generate } from "../src/generate-routes-tests.ts";

const DS_YAML = `types:
  - user:
      fields:
        - email:
            type: string
            is_unique: true
        - role_id:
            type: number
            references: role.id
  - role:
      datasource_type: readonly-lookup
      fields:
        - name:
            type: string
            is_unique: true
  - order:
      use_optimistic_concurrency: true
      fields:
        - label:
            type: string
`;

const VIEW_YAML = `includes:
  - datasource_types:
      include: "*"
types: []
`;

const ROUTES_YAML = `includes:
  - view_type_routes:
      filter: 'type is view_type || type is datasource_type'
routes:
  - users_by_email:
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

const yaml = {
  "datasource_types.yaml": DS_YAML,
  "view_types.yaml": VIEW_YAML,
  "routes.yaml": ROUTES_YAML,
};

describe("generate-routes-tests", () => {
  it("emits CRUD, readonly, and by-field router tests", async () => {
    const entries = await generate({
      reader: memoryReader(yaml),
      settings: {},
    });
    const paths = entries.map((e) => e.filename).sort();
    assert.deepEqual(paths, [
      "order.integration.test.ts",
      "package.json",
      "role.integration.test.ts",
      "user.integration.test.ts",
    ]);

    const users = textOf(entries, "user.integration.test.ts");
    assert.match(users, /import \{ UserRouter \} from "\.\.\/user"/);
    assert.match(users, /POST \/api\/user delegates to service.create/);
    assert.match(users, /GET \/api\/user\/email\/:value returns the row/);
    assert.match(users, /new PrimaryKey\("id", "integer"\)/);

    const roles = textOf(entries, "role.integration.test.ts");
    assert.match(roles, /GET \/api\/role returns items from service.findAll/);
    assert.ok(!roles.includes("service.create"));

    const orders = textOf(entries, "order.integration.test.ts");
    assert.match(orders, /If-Match/);
    assert.match(orders, /expectedUpdated: occToken/);
  });

  it("emits nothing without view_type_routes", async () => {
    const entries = await generate({
      reader: memoryReader({
        ...yaml,
        "routes.yaml": "routes: []\n",
      }),
      settings: {},
    });
    assert.deepEqual(entries, []);
  });
});
