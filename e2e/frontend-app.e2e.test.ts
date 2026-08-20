import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { bootGeneratedFrontend } from "./generated-frontend-app.ts";
import { stopGeneratedApp, type BootedApp } from "./generated-app.ts";

const TEMP_PREFIX = "ts-frontend-app-e2e-";
const APP_NAME = "catalog-ui";

describe("frontend-app e2e", { timeout: 180_000 }, () => {
  let booted: BootedApp | undefined;

  before(async () => {
    booted = await bootGeneratedFrontend({
      tempPrefix: TEMP_PREFIX,
      settings: { application_name: APP_NAME },
    });
  });

  after(async () => {
    await stopGeneratedApp(booted, TEMP_PREFIX);
  });

  it("serves the generated Vite preview with the app name", async () => {
    assert.ok(booted);
    const origin = `http://127.0.0.1:${booted.port}`;
    const res = await fetch(`${origin}/`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, new RegExp(`<title>${APP_NAME}</title>`));
    const asset = html.match(/src="(\/assets\/[^"]+\.js)"/);
    assert.ok(asset?.[1], "preview HTML is missing the Vite JS asset");
    const js = await fetch(`${origin}${asset[1]}`);
    assert.equal(js.status, 200);
    assert.match(await js.text(), new RegExp(APP_NAME));
  });
});
