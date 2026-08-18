import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { memoryReader } from "./common/deterministic-reader.ts";
import type { GenerateEntry } from "./common/generate-entry.ts";
import { generate } from "./generate-frontend-app.ts";

const entryBody = (entry: GenerateEntry): string =>
  "contents" in entry ? String(entry.contents) : entry.content;

const indexEntries = (entries: GenerateEntry[]): Map<string, GenerateEntry> => {
  const map = new Map<string, GenerateEntry>();
  for (const entry of entries) {
    assert.equal(
      map.has(entry.filename),
      false,
      `duplicate generate entry: ${entry.filename}`,
    );
    map.set(entry.filename, entry);
  }
  return map;
};

const requireEntry = (
  map: Map<string, GenerateEntry>,
  filename: string,
): GenerateEntry => {
  const entry = map.get(filename);
  assert.ok(entry, `missing generate entry: ${filename}`);
  return entry;
};

describe("generate frontend app", () => {
  it("scaffolds a React Vite app under frontend/", async () => {
    const byName = indexEntries(
      await generate({
        reader: memoryReader({}),
        settings: { application_name: "catalog-ui" },
      }),
    );
    assert.deepEqual(
      [...byName.keys()].sort(),
      [
        "frontend/.gitignore",
        "frontend/index.html",
        "frontend/package.json",
        "frontend/src/App.tsx",
        "frontend/src/main.tsx",
        "frontend/tsconfig.json",
        "frontend/vite.config.ts",
      ],
    );
    assert.equal(requireEntry(byName, "frontend/package.json").kind, "patch");
    assert.equal(
      JSON.parse(entryBody(requireEntry(byName, "frontend/package.json"))).name,
      "catalog-ui",
    );
    assert.match(
      entryBody(requireEntry(byName, "frontend/src/App.tsx")),
      /catalog-ui/,
    );
    assert.equal(byName.has("frontend/Dockerfile"), false);
    assert.equal(byName.has("docker-compose.yml"), false);
  });

  it("adds compose + Dockerfile for full-stack", async () => {
    const byName = indexEntries(
      await generate({
        reader: memoryReader({}),
        settings: {
          application_name: "catalog-ui",
          application_tier: "full-stack",
        },
      }),
    );
    const compose = requireEntry(byName, "docker-compose.yml");
    assert.equal(compose.kind, "patch");
    assert.equal(
      "section" in compose ? compose.section : undefined,
      "COMPOSE_SERVICE_FRONTEND",
    );
    assert.match(entryBody(compose), /^frontend:/m);
    assert.equal(requireEntry(byName, "frontend/Dockerfile").kind, "content");
  });
});
