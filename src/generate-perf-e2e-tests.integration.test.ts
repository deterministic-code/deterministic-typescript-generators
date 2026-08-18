import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { memoryReader } from "./common/deterministic-reader.ts";
import { generate } from "./generate-perf-e2e-tests.ts";

describe("generate-perf-e2e-tests", () => {
  it("emits the static vitest client", async () => {
    const entries = await generate({
      reader: memoryReader({}),
      settings: {},
    });
    assert.equal(entries.length, 1);
    assert.equal(entries[0]?.filename, "app.perf.client.test.ts");
    assert.equal(entries[0]?.kind, "content");
    if (entries[0]?.kind === "content") {
      assert.match(entries[0].contents, /performance-plan\.yaml/);
      assert.match(entries[0].contents, /PERF_ITERATIONS/);
    }
  });
});
