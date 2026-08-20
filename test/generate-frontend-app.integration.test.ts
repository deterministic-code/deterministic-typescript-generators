import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { memoryReader } from "@deterministic-code/generators-common/deterministic-reader";
import type { GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import { generate } from "../src/generate-frontend-app.ts";

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

  it("defaults package.json name and the frontend heading from application_name", async () => {
    const byName = indexEntries(
      await generate({
        reader: memoryReader({}),
        settings: {},
      }),
    );
    assert.equal(
      JSON.parse(entryBody(requireEntry(byName, "frontend/package.json"))).name,
      "generated-frontend",
    );
    assert.match(
      entryBody(requireEntry(byName, "frontend/src/App.tsx")),
      /<h1>generated-frontend<\/h1>/,
    );
    assert.match(
      entryBody(requireEntry(byName, "frontend/index.html")),
      /<title>generated-frontend<\/title>/,
    );
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

  it("scaffolds a Next.js app under frontend/", async () => {
    const byName = indexEntries(
      await generate({
        reader: memoryReader({}),
        settings: {
          application_name: "catalog-ui",
          frontend_generate_framework: "next",
        },
      }),
    );
    assert.deepEqual(
      [...byName.keys()].sort(),
      [
        "frontend/.gitignore",
        "frontend/app/layout.tsx",
        "frontend/app/page.tsx",
        "frontend/next-env.d.ts",
        "frontend/next.config.ts",
        "frontend/package.json",
        "frontend/tsconfig.json",
      ],
    );
    assert.equal(
      JSON.parse(entryBody(requireEntry(byName, "frontend/package.json"))).name,
      "catalog-ui",
    );
    assert.match(
      entryBody(requireEntry(byName, "frontend/app/page.tsx")),
      /<h1>catalog-ui<\/h1>/,
    );
    assert.match(
      entryBody(requireEntry(byName, "frontend/app/layout.tsx")),
      /title: "catalog-ui"/,
    );
    assert.equal(byName.has("frontend/vite.config.ts"), false);
    assert.equal(byName.has("frontend/index.html"), false);
  });

  it("defaults the Next.js package name and heading from application_name", async () => {
    const byName = indexEntries(
      await generate({
        reader: memoryReader({}),
        settings: { frontend_generate_framework: "next" },
      }),
    );
    assert.equal(
      JSON.parse(entryBody(requireEntry(byName, "frontend/package.json"))).name,
      "generated-frontend",
    );
    assert.match(
      entryBody(requireEntry(byName, "frontend/app/page.tsx")),
      /<h1>generated-frontend<\/h1>/,
    );
  });

  it("adds Next.js compose + Dockerfile for full-stack", async () => {
    const byName = indexEntries(
      await generate({
        reader: memoryReader({}),
        settings: {
          frontend_generate_framework: "next",
          application_tier: "full-stack",
        },
      }),
    );
    const compose = requireEntry(byName, "docker-compose.yml");
    assert.equal(compose.kind, "patch");
    assert.match(entryBody(compose), /:3000/);
    assert.match(
      entryBody(requireEntry(byName, "frontend/Dockerfile")),
      /EXPOSE 3000/,
    );
  });

  it("rejects an unknown frontend_generate_framework", async () => {
    await assert.rejects(
      () =>
        generate({
          reader: memoryReader({}),
          settings: { frontend_generate_framework: "remix" },
        }),
      /settings\.frontend_generate_framework must be "vite" or "next"/,
    );
  });
});
