import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { memoryReader } from "./common/deterministic-reader.ts";
import type { GenerateEntry } from "./common/generate-entry.ts";
import { generate } from "./generate-services.ts";

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

const ROUTES_YAML = `routes:
  - getReport:
      method: GET
      path: /api/report
      service: ReportService
      serviceMethod: run
`;

const fixtureReader = (files: Record<string, string>) => memoryReader(files);

const textOf = (entries: GenerateEntry[], path: string): string => {
  const hit = entries.find((e) => e.kind === "content" && e.filename === path);
  assert.ok(hit, `missing entry ${path}`);
  assert.equal(hit.kind, "content");
  return hit.contents;
};

describe("generate-services", () => {
  it("emits generic services, finders, custom stubs, and indexes", async () => {
    const entries = await generate({
      reader: fixtureReader({
        "datasource_types.yaml": DS_YAML,
        "view_types.yaml": VIEW_YAML,
        "services.yaml": SERVICES_YAML,
        "routes.yaml": ROUTES_YAML,
      }),
      settings: {},
    });

    const paths = entries.map((e) =>
      e.kind === "content" ? e.filename : e.filename,
    ).sort();
    assert.ok(paths.includes("user-service.ts"), `got: ${paths.join(", ")}`);
    assert.ok(paths.includes("role-service.ts"));
    assert.ok(paths.includes("../custom/report-service.ts"));
    assert.ok(paths.includes("../custom/health-check-service.ts"));
    assert.ok(paths.includes("index.ts"));
    assert.ok(paths.includes("../custom/index.ts"));

    const user = textOf(entries, "user-service.ts");
    assert.match(user, /export class UserService extends BaseService<User>/);
    assert.match(user, /async findByEmail\(email: string\)/);
    assert.match(
      user,
      /from "\.\.\/\.\.\/types\/generated\/views\/user"/,
    );

    const report = textOf(entries, "../custom/report-service.ts");
    assert.match(report, /async run\(\.\.\._args: unknown\[\]\)/);
    assert.match(report, /return \{\};/);

    const index = textOf(entries, "index.ts");
    assert.match(index, /export \{ RoleService \} from "\.\/role-service"/);
    assert.match(index, /export \{ UserService \} from "\.\/user-service"/);
  });

  it("places custom stubs under features/…/custom when by-feature", async () => {
    const entries = await generate({
      reader: fixtureReader({
        "datasource_types.yaml": DS_YAML,
        "view_types.yaml": VIEW_YAML,
        "services.yaml": `includes:
  - view_type_services:
      filter: 'type == "user"'
services: []
`,
      }),
      settings: { "other.organize_by_feature": "true" },
    });

    const paths = entries.map((e) => e.filename).sort();
    assert.ok(
      paths.includes("features/user/user-service.ts"),
      `got: ${paths.join(", ")}`,
    );
    assert.ok(
      paths.includes("features/health-check/custom/health-check-service.ts"),
    );
    assert.ok(!paths.includes("index.ts"));
  });

  it("rejects by-feature custom modules outside features/", async () => {
    await assert.rejects(
      () =>
        generate({
          reader: fixtureReader({
            "datasource_types.yaml": DS_YAML,
            "view_types.yaml": VIEW_YAML,
            "services.yaml": `includes:
  - view_type_services:
      filter: 'false'
services:
  - name: WeirdService
    module: ./elsewhere/weird
`,
          }),
          settings: { "other.organize_by_feature": "true" },
        }),
      /outside \.\/features\//,
    );
  });

  it("omits indexes when codegen.create_index is false", async () => {
    const entries = await generate({
      reader: fixtureReader({
        "datasource_types.yaml": DS_YAML,
        "view_types.yaml": VIEW_YAML,
        "services.yaml": SERVICES_YAML,
        "routes.yaml": ROUTES_YAML,
      }),
      settings: { "codegen.create_index": "false" },
    });
    const paths = entries.map((e) => e.filename);
    assert.ok(paths.includes("user-service.ts"));
    assert.ok(!paths.includes("index.ts"));
    assert.ok(!paths.includes("../custom/index.ts"));
  });

  it("emits description doc comments when comments=description", async () => {
    const entries = await generate({
      reader: fixtureReader({
        "datasource_types.yaml": DS_YAML,
        "view_types.yaml": VIEW_YAML,
        "services.yaml": `includes:
  - view_type_services:
      filter: 'type == "user"'
services: []
`,
      }),
      settings: { comments: "description" },
    });
    const user = textOf(entries, "user-service.ts");
    assert.match(user, /Datasource type: standard/);
    assert.match(user, /Target: StandardCrud/);
  });

  it("emits no doc comments when comments=none", async () => {
    const entries = await generate({
      reader: fixtureReader({
        "datasource_types.yaml": DS_YAML,
        "view_types.yaml": VIEW_YAML,
        "services.yaml": `includes:
  - view_type_services:
      filter: 'type == "user"'
services: []
`,
      }),
      settings: { comments: "none" },
    });
    const user = textOf(entries, "user-service.ts");
    assert.ok(!user.includes("/**"));
  });
});
