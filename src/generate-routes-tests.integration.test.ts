import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { memoryReader } from "./common/deterministic-reader.ts";
import type { GenerateEntry } from "./common/generate-entry.ts";
import { generate } from "./generate-routes-tests.ts";

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
      "orders.integration.test.ts",
      "roles.integration.test.ts",
      "users.integration.test.ts",
    ]);

    const users = textOf(entries, "users.integration.test.ts");
    assert.match(users, /import \{ usersRouter \} from "\.\.\/users"/);
    assert.match(users, /POST \/api\/users delegates to service.create/);
    assert.match(users, /GET \/api\/users\/email\/:value returns the row/);
    assert.match(users, /new PrimaryKey\("id", "integer"\)/);

    const roles = textOf(entries, "roles.integration.test.ts");
    assert.match(roles, /GET \/api\/roles returns items from service.findAll/);
    assert.ok(!roles.includes("service.create"));

    const orders = textOf(entries, "orders.integration.test.ts");
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

  it("nests tests under features when by-feature", async () => {
    const entries = await generate({
      reader: memoryReader(yaml),
      settings: { "other.organize_by_feature": "true" },
    });
    const paths = entries.map((e) => e.filename);
    assert.ok(paths.includes("features/user/__tests__/users.integration.test.ts"));
  });
});
