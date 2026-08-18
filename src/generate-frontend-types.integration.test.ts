import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { memoryReader } from "./common/deterministic-reader.ts";
import { generate } from "./generate-frontend-types.ts";

describe("generate-frontend-types", () => {
  it("emits nothing when frontend_bindings.yaml is absent", async () => {
    const entries = await generate({
      reader: memoryReader({}),
      settings: {},
    });
    assert.deepEqual(entries, []);
  });
});
