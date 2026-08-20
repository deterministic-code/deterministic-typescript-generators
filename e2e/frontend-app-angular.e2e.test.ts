import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { bootGeneratedFrontend } from "./generated-frontend-app.ts";
import { stopGeneratedApp, type BootedApp } from "./generated-app.ts";

const TEMP_PREFIX = "ts-frontend-app-angular-e2e-";
const APPLICATION_NAME = "frontend-e2e";

describe("frontend-app angular e2e", { timeout: 180_000 }, () => {
  let booted: BootedApp | undefined;

  before(async () => {
    booted = await bootGeneratedFrontend({
      tempPrefix: TEMP_PREFIX,
      settings: {
        application_name: APPLICATION_NAME,
        frontend_generate_framework: "angular",
      },
    });
  });

  after(async () => {
    await stopGeneratedApp(booted, TEMP_PREFIX);
  });

  it("serves the generated Angular app with the application name", async () => {
    assert.ok(booted);
    const origin = `http://127.0.0.1:${booted.port}`;
    const res = await fetch(`${origin}/`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, new RegExp(`<title>${APPLICATION_NAME}</title>`));
    const asset = html.match(/src="([^"]+\.js)"/);
    assert.ok(asset?.[1], "preview HTML is missing the Angular JS asset");
    const href = asset[1].startsWith("http")
      ? asset[1]
      : `${origin}/${asset[1].replace(/^\//, "")}`;
    const js = await fetch(href);
    assert.equal(js.status, 200);
    assert.match(await js.text(), new RegExp(APPLICATION_NAME));
  });
});
