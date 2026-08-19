import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { memoryReader } from "@deterministic-code/generators-common/deterministic-reader";
import type { GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
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
    assert.ok(paths.includes("user_service.ts"), `got: ${paths.join(", ")}`);
    assert.ok(paths.includes("role_service.ts"));
    assert.ok(paths.includes("../custom/ReportService.ts"));
    assert.ok(paths.includes("../custom/health-check-service.ts"));
    assert.ok(paths.includes("index.ts"));
    assert.ok(paths.includes("../custom/index.ts"));

    const user = textOf(entries, "user_service.ts");
    assert.match(user, /export class user_service extends BaseService<user>/);
    assert.match(user, /async find_by_email\(email: string\)/);
    assert.match(
      user,
      /from "\.\.\/\.\.\/types\/generated\/views\/user"/,
    );

    const report = textOf(entries, "../custom/ReportService.ts");
    assert.match(report, /async run\(\.\.\._args: unknown\[\]\)/);
    assert.match(report, /return \{\};/);

    const index = textOf(entries, "index.ts");
    assert.match(index, /export \{ role_service \} from "\.\/role_service"/);
    assert.match(index, /export \{ user_service \} from "\.\/user_service"/);
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
    assert.ok(paths.includes("user_service.ts"));
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
    const user = textOf(entries, "user_service.ts");
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
    const user = textOf(entries, "user_service.ts");
    assert.ok(!user.includes("/**"));
  });
});
