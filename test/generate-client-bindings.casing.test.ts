import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { memoryReader } from "@deterministic-code/generators-common/deterministic-reader";
import type { GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import { generate } from "../src/generate-client-bindings.ts";

const yaml = {
  "datasource_types.yaml": `types:
  - contact_source:
      datasource_type: readonly-lookup
      fields:
        - name:
            type: string
            is_unique: true
`,
  "view_types.yaml": `includes:
  - datasource_types:
      include: "*"
      auto_enrich: true
types: []
`,
  "routes.yaml": `includes:
  - view_type_routes:
      filter: 'type is view_type || type is datasource_type'
`,
};

const ctx = (settings: Record<string, string>) => ({
  reader: memoryReader(yaml),
  settings,
});

const textOf = (entries: GenerateEntry[], path: string): string => {
  const hit = entries.find((e) => e.kind === "content" && e.filename === path);
  assert.ok(
    hit,
    `missing entry ${path}; got ${entries.map((e) => e.filename).join(", ")}`,
  );
  assert.equal(hit.kind, "content");
  return hit.contents;
};

const fetchPath = (fileBase: string): string =>
  `frontend/src/client/fetch/${fileBase}.ts`;

describe("generate client bindings casing", () => {
  it("Auto uses Camel files and a camel client factory", async () => {
    const entries = await generate(ctx({}));
    const body = textOf(entries, fetchPath("contactSource"));
    assert.match(body, /export const contactSourceClient/);
    const tanstack = textOf(
      entries,
      "frontend/src/client/tanstack/contactSource.ts",
    );
    assert.match(tanstack, /export const contactSourceClientQueryOptions/);
    assert.match(tanstack, /export const UseContactSourceList/);
    assert.doesNotMatch(tanstack, /use\{\{/);
  });

  it("Kebab file names keep a camel client factory", async () => {
    const entries = await generate(
      ctx({ "languages.typescript.casing.file_names": "Kebab" }),
    );
    const body = textOf(entries, fetchPath("contact-source"));
    assert.match(body, /export const contactSourceClient/);
  });

  it("Pascal file names keep a camel client factory", async () => {
    const entries = await generate(
      ctx({ "languages.typescript.casing.file_names": "Pascal" }),
    );
    const body = textOf(entries, fetchPath("ContactSource"));
    assert.match(body, /export const contactSourceClient/);
  });

  it("Snake file names keep a camel client factory", async () => {
    const entries = await generate(
      ctx({ "languages.typescript.casing.file_names": "Snake" }),
    );
    const body = textOf(entries, fetchPath("contact_source"));
    assert.match(body, /export const contactSourceClient/);
  });

  it("Snake types use convertTypes stems for tanstack hooks", async () => {
    const entries = await generate(
      ctx({ "languages.typescript.casing.types": "Snake" }),
    );
    const tanstack = textOf(
      entries,
      "frontend/src/client/tanstack/contactSource.ts",
    );
    assert.match(tanstack, /export const use_contact_source_list/);
    assert.doesNotMatch(tanstack, /useContactSourceList/);
    assert.doesNotMatch(tanstack, /usecontact_source_list/);
  });
});
