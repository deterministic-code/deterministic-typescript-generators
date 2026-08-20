import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { memoryReader } from "@deterministic-code/generators-common/deterministic-reader";
import {
  DATASOURCE_TYPES_YAML,
  VIEW_TYPES_YAML,
} from "@deterministic-code/generators-common/specification-parser";
import { generate as generateFrontendTypes } from "../src/generate-frontend-types.ts";
import { generate as generateViewTypes } from "../src/generate-view-types.ts";

const VIEW_YAML = `types:
  - card_payment:
      fields:
        - amount:
            type: decimal
        - paid_at:
            type: datetime
        - note:
            type: string
            is_nullable: true
`;

describe("generate-frontend-types", () => {
  it("rejects a missing view_types.yaml", async () => {
    await assert.rejects(
      () =>
        generateFrontendTypes({
          reader: memoryReader({}),
          settings: {},
        }),
      /missing view_types\.yaml/,
    );
  });

  it("emits the same entries as generate-view-types", async () => {
    const ctx = {
      reader: memoryReader({
        [VIEW_TYPES_YAML]: VIEW_YAML,
        [DATASOURCE_TYPES_YAML]: `types: []
`,
      }),
      settings: {},
    };
    assert.deepEqual(
      await generateFrontendTypes(ctx),
      await generateViewTypes(ctx),
    );
  });

  it("emits a singular nested datasource field without []", async () => {
    const [entry] = await generateFrontendTypes({
      reader: memoryReader({
        [VIEW_TYPES_YAML]: `types:
  - contact:
      fields:
        - address:
            type: datasource_types.tag
`,
        [DATASOURCE_TYPES_YAML]: `types:
  - tag:
      fields:
        - label:
            type: string
`,
      }),
      settings: { "codegen.create_index": "false" },
    });
    const body =
      entry !== undefined && "contents" in entry
        ? String(entry.contents)
        : entry !== undefined && "content" in entry
          ? entry.content
          : "";
    assert.match(body, /address: tag;/);
    assert.doesNotMatch(body, /address: tag\[\];/);
  });
});
