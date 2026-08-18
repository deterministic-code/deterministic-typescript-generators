import type { GenerateContext } from "./common/generate-context.ts";
import { content, type GenerateEntry } from "./common/generate-entry.ts";
import { datasourceSettings } from "./common/datasource-settings.ts";
import { loadRoutes } from "./common/parse-routes.ts";
import { settingsStr } from "./common/settings.ts";
import { libraryImportSpecifier } from "./library-import.ts";

export const generate = async (
  ctx: GenerateContext,
): Promise<GenerateEntry[]> => {
  const ds = datasourceSettings(ctx.settings);
  const parsed = await loadRoutes(ctx.reader, { idType: ds.idType });
  const detRoot = libraryImportSpecifier(
    "",
    settingsStr(ctx.settings, "languages.typescript.library_reference_mode"),
    "__tests__/app.integration.test.ts",
  );
  const names = parsed.candidates.map((c) => c.name);
  const body = `import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createBackendApp, connectDatabase, type DatabaseConnection } from "${detRoot}";

const ENTITIES = ${JSON.stringify(names)} as const;

let app: Awaited<ReturnType<typeof createBackendApp>>;
let conn: DatabaseConnection;

beforeAll(async () => {
  conn = await connectDatabase({ backend: "memory" });
  app = await createBackendApp(conn);
});

afterAll(async () => {
  await conn.close();
});

describe("app routes e2e", () => {
  it("serves GET /api/health", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBeLessThan(500);
  });

  for (const entity of ENTITIES) {
    it(\`lists \${entity}\`, async () => {
      const res = await request(app).get(\`/api/\${entity.replace(/_/g, "-")}s\`);
      expect([200, 404]).toContain(res.status);
    });
  }
});
`;
  return [content("app.integration.test.ts", body)];
};
