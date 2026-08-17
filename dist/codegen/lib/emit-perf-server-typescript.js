import { parseDatasourceTypes } from "@deterministic-code/generator-sdk/codegen/lib/parse-datasource-types";
import { resolveLibraryReferenceMode } from "@deterministic-code/generator-sdk/read-settings";
import { libraryImportSpecifier } from "./library-import.js";
import { CONTENT } from "@deterministic-code/generator-sdk/codegen/lib/emit-result";
import { perfServerTypescriptEntries } from "@deterministic-code/generator-sdk/codegen/lib/migrate-perf-harness";
/** why: verify-only wrapper that applies migrations before createBackendApp() so perf hits every emitted table (dist/server.js stays migration-free per #690). skip_migrations entities now ride the migrations chain via deterministic/custom/<dialect>/*_up.sql — single source of truth, no baked DDL constant. */
export function emitPerfServerTypescript({ datasourceData, libraryReferenceMode, } = {}) {
    if (!datasourceData || typeof datasourceData !== "object") {
        throw new Error("emitPerfServerTypescript: datasourceData is required (parsed datasource_types.yaml)");
    }
    if (!Array.isArray(datasourceData.types)) {
        throw new Error("emitPerfServerTypescript: datasourceData.types must be an array — malformed datasource_types.yaml");
    }
    const appImport = libraryImportSpecifier("app", libraryReferenceMode, "perf-server.ts");
    const content = `import { createBackendApp } from "./app.js";
import { type SupportedBackend } from "${appImport}";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Single migration path via createBackendApp's connectDatabase({migrationsDir}); earlier a sibling applyNetworkSchema reapplied the chain and MySQL hit "Table 'MailBoxes' already exists", killing perf-load before health came up.

async function ensureSqlitePath(): Promise<{ cleanup: () => Promise<void> }> {
  // Always a fresh temp DB per perf run — never reuse an inherited DB_PATH — so the server migrates from empty and the run is start-to-finish. createBackendApp opens its own better-sqlite3 handle and ":memory:" is per-connection, so we materialize a real path.
  const dir = await mkdtemp(join(tmpdir(), "perf-sqlite-"));
  const path = join(dir, "perf.sqlite");
  process.env.DB_PATH = path;
  return { cleanup: () => rm(dir, { recursive: true, force: true }) };
}

async function bootstrap(): Promise<void> {
  const backend = (process.env.DATABASE_BACKEND ?? "sqlite") as SupportedBackend;
  if (backend === "memory") {
    throw new Error(
      "perf-server: DATABASE_BACKEND=memory has no migration chain to apply — pick sqlite or a network dialect",
    );
  }
  let cleanup: () => Promise<void> = async () => {};
  if (backend === "sqlite") {
    cleanup = (await ensureSqlitePath()).cleanup;
  } else if (!process.env.DATABASE_URL) {
    throw new Error(
      \`perf-server: DATABASE_BACKEND=\${backend} requires DATABASE_URL to be set\`,
    );
  }
  // Self-migrate every dialect via createBackendApp's connectDatabase({migrationsDir}) so perf hits a freshly-built schema — sqlite from an empty temp file, network dialects against their fresh container.
  process.env.DETERMINISTIC_APP_MIGRATE = "1";
  const app = await createBackendApp();
  const port = Number(process.env.PORT ?? 4000);
  app.listen(port);
  const onSignal = async (): Promise<void> => {
    await cleanup();
    process.exit(0);
  };
  process.on("SIGTERM", onSignal);
  process.on("SIGINT", onSignal);
}

bootstrap().catch((err) => {
  process.stderr.write(\`perf-server: bootstrap failed: \${err?.stack ?? err}\\n\`);
  process.exit(1);
});
`;
    return { path: "perf-server.ts", content };
}
export const entriesNative = true;
/** Self-describing catalog `perf_server` (typescript): the verify-only server entrypoint plus its vitest.perf harness (config file + `test:perf` package.json script), routed through EmitPlan's content/patch writers. */
export async function emit({ inputs, settings }) {
    const { datasourceYamlText } = await inputs.all();
    const file = emitPerfServerTypescript({
        datasourceData: parseDatasourceTypes(datasourceYamlText, settings),
        libraryReferenceMode: resolveLibraryReferenceMode(settings.languages, "typescript"),
    });
    return {
        entries: [
            { kind: CONTENT, filename: file.path, contents: file.content },
            ...(await perfServerTypescriptEntries()),
        ],
    };
}
