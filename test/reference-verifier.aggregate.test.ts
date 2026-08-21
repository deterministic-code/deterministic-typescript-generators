import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { memoryReader } from "@deterministic-code/generators-common/deterministic-reader";
import { content } from "@deterministic-code/generators-common/generate-entry";
import {
  finalizeEntries,
  ReferenceVerifier,
} from "@deterministic-code/generators-common/reference-verifier";
import { generate as generateDatasourceTypes } from "../src/generate-datasource-types.ts";
import { generate as generateServices } from "../src/generate-services.ts";
import { generate as generateViewTypes } from "../src/generate-view-types.ts";

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

const fixture = {
  "datasource_types.yaml": DS_YAML,
  "view_types.yaml": VIEW_YAML,
  "services.yaml": SERVICES_YAML,
  "routes.yaml": ROUTES_YAML,
};

describe("reference verifier aggregate", () => {
  it("finalizes datasource + view + service entries together", async () => {
    const reader = memoryReader(fixture);
    const settings = {};
    const entries = [
      ...(await generateDatasourceTypes({ reader, settings })),
      ...(await generateViewTypes({ reader, settings })),
      ...(await generateServices({ reader, settings })),
    ];
    const finalized = finalizeEntries(entries);
    assert.ok(finalized.length > 0);
    for (const entry of finalized) {
      if (entry.kind === "content") {
        assert.equal(
          "attributes" in entry && entry.attributes !== undefined,
          false,
        );
      }
    }
  });

  it("fails when a service uses a mistyped export name", async () => {
    const reader = memoryReader(fixture);
    const settings = {};
    const entries = [
      ...(await generateDatasourceTypes({ reader, settings })),
      ...(await generateViewTypes({ reader, settings })),
      content("brokenService.ts", "", {
        module: "services/generated/brokenService.ts",
        imports: "types/generated/views/user.ts",
        uses: "user",
      }),
    ];
    assert.throws(
      () => new ReferenceVerifier().verify(entries),
      /uses "user"/,
    );
  });
});
