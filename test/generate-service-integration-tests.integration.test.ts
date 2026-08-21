import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { memoryReader } from "@deterministic-code/generators-common/deterministic-reader";
import type { GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import { generate } from "../src/generate-service-integration-tests.ts";

const DS_YAML = `types:
  - contact:
      fields:
        - first_name:
            type: string
  - contact_group:
      fields:
        - name:
            type: string
            is_unique: true
  - contact_group_member:
      datasource_type: "many-to-many"
      fields:
        - contact_id:
            type: number
            references: contact.id
        - contact_group_id:
            type: number
            references: contact_group.id
`;

const VIEW_YAML = `includes:
  - datasource_types:
      include: "*"
types: []
`;

const SERVICES_YAML = `includes:
  - view_type_services:
      filter: 'type is view_type || type is datasource_type'
services: []
`;

const yaml = {
  "datasource_types.yaml": DS_YAML,
  "view_types.yaml": VIEW_YAML,
  "services.yaml": SERVICES_YAML,
};

const textOf = (entries: GenerateEntry[], path: string): string => {
  const hit = entries.find((e) => e.kind === "content" && e.filename === path);
  assert.ok(
    hit,
    `missing entry ${path}; got ${entries.map((e) => e.filename).join(", ")}`,
  );
  assert.equal(hit.kind, "content");
  return hit.contents;
};

describe("generate-service-integration-tests", () => {
  it("uses the physical (pluralized) table name by default", async () => {
    const entries = await generate({
      reader: memoryReader(yaml),
      settings: {},
    });
    const body = textOf(
      entries,
      "contactGroupMemberService.integration.test.ts",
    );
    assert.match(body, /const TABLE_NAME = "contact_group_members"/);
    assert.doesNotMatch(body, /const TABLE_NAME = "contact_group_member"/);
  });

  it("keeps the authored table name when pluralize is off", async () => {
    const entries = await generate({
      reader: memoryReader(yaml),
      settings: { "datasource.pluralize_datatable_names": "false" },
    });
    const body = textOf(
      entries,
      "contactGroupMemberService.integration.test.ts",
    );
    assert.match(body, /const TABLE_NAME = "contact_group_member"/);
  });
});
