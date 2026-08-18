import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { memoryReader } from "./common/deterministic-reader.ts";
import type { GenerateEntry } from "./common/generate-entry.ts";
import { generate } from "./generate-routes.ts";

const DS_YAML = `types:
  - user:
      fields:
        - email:
            type: string
            is_unique: true
            size: 256
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
  - order_item:
      fields:
        - order_id:
            type: number
            references: order.id
        - sku:
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
combined_routes:
  - order:
      combined_types:
        - order_item
`;

const textOf = (entries: GenerateEntry[], path: string): string => {
  const hit = entries.find((e) => e.kind === "content" && e.filename === path);
  assert.ok(hit, `missing entry ${path}; got ${entries.map((e) => e.filename).join(", ")}`);
  assert.equal(hit.kind, "content");
  return hit.contents;
};

describe("generate-routes", () => {
  it("emits CRUD, readonly, byField, custom health, app-wiring, and nested", async () => {
    const entries = await generate({
      reader: memoryReader({
        "datasource_types.yaml": DS_YAML,
        "view_types.yaml": VIEW_YAML,
        "routes.yaml": ROUTES_YAML,
      }),
      settings: {},
    });

    const paths = entries.map((e) => e.filename).sort();
    assert.ok(paths.includes("users.ts"), `got: ${paths.join(", ")}`);
    assert.ok(paths.includes("roles.ts"));
    assert.ok(paths.includes("orders.ts"));
    assert.ok(paths.includes("app-wiring.ts"));
    assert.ok(paths.some((p) => p.includes("get-health") || p.includes("GetHealth") || p.endsWith("get-health-route.ts") || p.includes("health")));
    assert.ok(
      paths.some((p) => p.includes("nested-order-order-item") || p.includes("nested_order_order_item")),
      `nested missing in ${paths.join(", ")}`,
    );

    const users = textOf(entries, "users.ts");
    assert.match(users, /export function usersRouter/);
    assert.match(users, /createCrudRouter/);
    assert.match(users, /router\.get\("\/email\/:email"/);

    const roles = textOf(entries, "roles.ts");
    assert.match(roles, /createReadOnlyRouter/);

    const wiring = textOf(entries, "app-wiring.ts");
    assert.match(wiring, /router\.use\("\/api\/users"/);
    assert.match(wiring, /router\.use\("\/api\/roles"/);
    assert.match(wiring, /ctx\.entityService\("role"\)/);
  });

  it("emits OCC option when enabled", async () => {
    const entries = await generate({
      reader: memoryReader({
        "datasource_types.yaml": DS_YAML,
        "view_types.yaml": VIEW_YAML,
        "routes.yaml": `includes:
  - view_type_routes:
      filter: 'type == "order"'
routes: []
`,
      }),
      settings: { "datasource.use_optimistic_concurrency": "true" },
    });
    const orders = textOf(entries, "orders.ts");
    assert.match(orders, /useOptimisticConcurrency: true/);
  });

  it("places routers under features/ when by-feature", async () => {
    const entries = await generate({
      reader: memoryReader({
        "datasource_types.yaml": DS_YAML,
        "view_types.yaml": VIEW_YAML,
        "routes.yaml": `includes:
  - view_type_routes:
      filter: 'type == "user"'
routes: []
`,
      }),
      settings: { "other.organize_by_feature": "true" },
    });
    const paths = entries.map((e) => e.filename).sort();
    assert.ok(paths.includes("features/user/users.ts"), `got: ${paths.join(", ")}`);
    assert.ok(paths.includes("features/app-wiring.ts"));
    assert.ok(!paths.includes("index.ts"));
  });
});
