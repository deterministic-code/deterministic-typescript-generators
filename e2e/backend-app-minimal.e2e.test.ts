import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import {
  bootGeneratedApp,
  stopGeneratedApp,
  type BootedApp,
} from "./generated-app.ts";

const TEMP_PREFIX = "ts-backend-app-e2e-minimal-";

describe("backend-app minimal e2e", { timeout: 180_000 }, () => {
  let booted: BootedApp | undefined;

  before(async () => {
    booted = await bootGeneratedApp({
      tempPrefix: TEMP_PREFIX,
      settings: {
        application_name: "health-e2e",
        app_generate_complexity: "minimal",
      },
      writeYaml: false,
    });
  });

  after(async () => {
    await stopGeneratedApp(booted, TEMP_PREFIX);
  });

  it("serves GET /api/health with 200 { status: ok }", async () => {
    assert.ok(booted);
    const res = await fetch(`http://127.0.0.1:${booted.port}/api/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: "ok" });
  });
});
