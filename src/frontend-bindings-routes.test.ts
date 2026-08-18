import { describe, expect, it } from "vitest";
import { resolvesToSelf } from "./frontend-bindings-routes.ts";

describe("resolvesToSelf", () => {
  it("resolves the legacy self sentinel", () => {
    expect(resolvesToSelf("self")).toBe(true);
  });

  it("resolves an id: reference to this project's own backend", () => {
    expect(resolvesToSelf("id:kitchen-sink")).toBe(true);
    expect(resolvesToSelf("id:contacts-backend")).toBe(true);
  });

  it("does not resolve external file: or https: documents", () => {
    expect(resolvesToSelf("file:./openapi.json")).toBe(false);
    expect(resolvesToSelf("https://api.example.com/openapi.json")).toBe(false);
  });

  it("does not resolve a non-string or empty schema", () => {
    expect(resolvesToSelf(undefined)).toBe(false);
    expect(resolvesToSelf("")).toBe(false);
  });
});
