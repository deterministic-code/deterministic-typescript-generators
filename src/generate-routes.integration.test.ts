import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { memoryReader } from "@deterministic-code/generators-common/deterministic-reader";
import type { GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
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
  it("emits CRUD, readonly, byField, and custom health", async () => {
    const entries = await generate({
      reader: memoryReader({
        "datasource_types.yaml": DS_YAML,
        "view_types.yaml": VIEW_YAML,
        "routes.yaml": ROUTES_YAML,
      }),
      settings: {},
    });

    const paths = entries.map((e) => e.filename).sort();
    assert.ok(paths.includes("user.ts"), `got: ${paths.join(", ")}`);
    assert.ok(paths.includes("role.ts"));
    assert.ok(paths.includes("order.ts"));
    assert.ok(paths.includes("index.ts"));
    assert.ok(paths.includes("../custom/index.ts"));
    assert.ok(paths.some((p) => p.includes("getHealth")));
    assert.ok(
      !paths.some((p) => p.includes("nested")),
      `nested routers must not emit; got ${paths.join(", ")}`,
    );

    const users = textOf(entries, "user.ts");
    assert.match(users, /export function userRouter/);
    assert.match(users, /createCrudRouter/);
    assert.match(users, /router\.get\("\/email\/:email"/);

    const roles = textOf(entries, "role.ts");
    assert.match(roles, /createReadOnlyRouter/);

    const index = textOf(entries, "index.ts");
    assert.match(index, /export \{ userRouter \} from "\.\/user"/);
    assert.match(index, /export \{ roleRouter \} from "\.\/role"/);
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
    const orders = textOf(entries, "order.ts");
    assert.match(orders, /useOptimisticConcurrency: true/);
  });

  it("omits index when codegen.create_index is false", async () => {
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
      settings: { "codegen.create_index": "false" },
    });
    const paths = entries.map((e) => e.filename);
    assert.ok(paths.includes("user.ts"));
    assert.ok(!paths.includes("index.ts"));
  });

  it("rejects missing routes.yaml", async () => {
    await assert.rejects(
      () =>
        generate({
          reader: memoryReader({
            "datasource_types.yaml": DS_YAML,
            "view_types.yaml": VIEW_YAML,
          }),
          settings: {},
        }),
      /routes\.yaml/,
    );
  });
});
