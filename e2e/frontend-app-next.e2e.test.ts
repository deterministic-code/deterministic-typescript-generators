import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { bootGeneratedFrontend } from "./generated-frontend-app.ts";
import { stopGeneratedApp, type BootedApp } from "./generated-app.ts";

const TEMP_PREFIX = "ts-frontend-app-next-e2e-";
const DEFAULT_APPLICATION_NAME = "generated-frontend";

describe("frontend-app next e2e", { timeout: 180_000 }, () => {
  let booted: BootedApp | undefined;

  before(async () => {
    booted = await bootGeneratedFrontend({
      tempPrefix: TEMP_PREFIX,
      settings: { frontend_generate_framework: "next" },
    });
  });

  after(async () => {
    await stopGeneratedApp(booted, TEMP_PREFIX);
  });

  it("serves the generated Next.js app with the application name", async () => {
    assert.ok(booted);
    const res = await fetch(`http://127.0.0.1:${booted.port}/`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, new RegExp(`<title>${DEFAULT_APPLICATION_NAME}</title>`));
    assert.match(html, new RegExp(`<h1>${DEFAULT_APPLICATION_NAME}</h1>`));
  });
});
