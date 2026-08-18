import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolvesToSelf } from "./frontend-bindings-routes.ts";

describe("resolvesToSelf", () => {
  it("resolves the legacy self sentinel", () => {
    assert.equal(resolvesToSelf("self"), true);
  });

  it("resolves an id: reference to this project's own backend", () => {
    assert.equal(resolvesToSelf("id:kitchen-sink"), true);
    assert.equal(resolvesToSelf("id:contacts-backend"), true);
  });

  it("does not resolve external file: or https: documents", () => {
    assert.equal(resolvesToSelf("file:./openapi.json"), false);
    assert.equal(
      resolvesToSelf("https://api.example.com/openapi.json"),
      false,
    );
  });

  it("does not resolve a non-string or empty schema", () => {
    assert.equal(resolvesToSelf(undefined), false);
    assert.equal(resolvesToSelf(""), false);
  });
});
