import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SECTION_MARKERS } from "@deterministic-code/generator-sdk/section-markers";
import { DEV_PORTS, buildAppModel, } from "@deterministic-code/generator-sdk/create-backend-app-model";
import { makeChunkLoader, applyTokens, renderTemplate, } from "@deterministic-code/generator-sdk/codegen/lib/chunk-loader";
import { PACK_TEMPLATES_DIR } from "../../pack-root.js";
const { loadChunk } = makeChunkLoader(PACK_TEMPLATES_DIR);
import { pathExists } from "@deterministic-code/generator-sdk/path-exists";
import { readSettingsWithDefault, resolveLibraryReferenceMode, } from "@deterministic-code/generator-sdk/read-settings";
import { normalizeDialect } from "@deterministic-code/generator-sdk/lib/emit-sql";
import { namesForSettings } from "@deterministic-code/generator-sdk/codegen/lib/ts-codegen-naming";
import { resolveCustomEmitPath } from "./emit-services-typescript.js";
import { resolveCustomRoutePath } from "./emit-routes-typescript.js";
import { emitTestApp } from "./emit-test-app-typescript.js";
import { datasourceSettingsForSettings } from "@deterministic-code/generator-sdk/codegen/lib/ts-datasource-settings";
import { COMPOSE_FILENAME, renderTypescriptComposeService, } from "@deterministic-code/generator-sdk/codegen/lib/compose-services";
import { REPO_ROOT, firstExistingDir, } from "@deterministic-code/generator-sdk/codegen/lib/artifact-paths";
import { CONTENT, PATCH, } from "@deterministic-code/generator-sdk/codegen/lib/emit-result";
import { DOCKERIGNORE_TRIGGER, dockerignoreSection, } from "@deterministic-code/patch-merger";
import { loadBackendAppInputs } from "@deterministic-code/generator-sdk/codegen/lib/backend-app-inputs";
import { makeBackendAppEmit } from "@deterministic-code/generator-sdk/codegen/lib/backend-app-emit-helpers";
import { isMultiLanguage } from "@deterministic-code/generator-sdk/codegen/lib/declared-languages";
import { backendLaneDir, COMBINED_FLAG, } from "@deterministic-code/generator-sdk/codegen/lib/backend-lane";
const __dirname = dirname(fileURLToPath(import.meta.url));
const templatesDir = resolve(PACK_TEMPLATES_DIR, "create-backend-app");
const APP_TS_CHUNK = await loadChunk("typescript", "app");
const SERVER_TS_CHUNK = await loadChunk("typescript", "server");
const APP_TS_DB_HOOK_IMPORTS_CHUNK = await loadChunk("typescript", "app_ts_db_hook_imports");
const APP_TS_BEFORE_HOOK_CHUNK = await loadChunk("typescript", "app_ts_before_hook");
const TEST_APP_DB_CONN_CHUNK = await loadChunk("typescript", "test_app_db_conn");
export const TEST_DB_RELATIVE_PATH = ".test/prebuilt.sqlite";
export function buildAppTsDbHookImportsBlock(libraryReferenceMode) {
    const libImport = libraryReferenceMode === "bundled"
        ? "./_deterministic/app.js"
        : "@deterministic-code/deterministic/app";
    return applyTokens(APP_TS_DB_HOOK_IMPORTS_CHUNK, { libImport }) + "\n";
}
export function buildAppTsBeforeHookBlock() {
    return APP_TS_BEFORE_HOOK_CHUNK + "\n";
}
export function buildAppTsAfterHookBlock() {
    return "";
}
export function buildTestAppDbConnBlock(libraryReferenceMode) {
    // test-app.ts lives in __tests__/, so the bundled specifier needs one more ".." than app.ts's.
    const libImport = libraryReferenceMode === "bundled"
        ? "../_deterministic/app.js"
        : "@deterministic-code/deterministic/app";
    return applyTokens(TEST_APP_DB_CONN_CHUNK, { libImport });
}
export function buildMigrateScripts(migrateDir, dialects, layout) {
    const list = dialects.length > 0 ? dialects : ["sqlite"];
    const defaultDialect = list.includes("sqlite") ? "sqlite" : list[0];
    const migrationsPath = (dialect) => layout.migrationsPath(dialect);
    const cmds = (dialect) => ({
        setup: `node --env-file-if-exists=.env ${migrateDir}/migrate-setup.mjs --provider ${dialect}`,
        up: `node --env-file-if-exists=.env ${migrateDir}/migrate-up.mjs --provider ${dialect} --migrate-path ${migrationsPath(dialect)}`,
        down: `node --env-file-if-exists=.env ${migrateDir}/migrate-down.mjs --provider ${dialect} --migrate-path ${migrationsPath(dialect)}`,
    });
    const out = {};
    if (dialects.length > 0) {
        for (const dialect of list) {
            const c = cmds(dialect);
            out[`migrate:${dialect}:setup`] = c.setup;
            out[`migrate:${dialect}`] = c.up;
            out[`migrate:${dialect}:down`] = c.down;
        }
    }
    const def = cmds(defaultDialect);
    out["migrate:setup"] = def.setup;
    out.migrate = def.up;
    out["migrate:down"] = def.down;
    return out;
}
export function buildPretestScript(migrateDir, libraryReferenceMode, layout) {
    const prefix = libraryReferenceMode === "bundled"
        ? "npm run build && cp -r _deterministic dist/_deterministic && "
        : "";
    // Pass the resolved --migrate-path so migrate-setup forwards it to the migrate-up it spawns (--and-up only forwards a path it was given). The default is the host lane-relative root (`../sql` multi-language, `sql` otherwise); TEST_MIGRATIONS_DIR overrides it when `npm test` runs inside the container (docker_test), where the flattened tree lives at the absolute /app/sql the entrypoint exports — `../sql` from WORKDIR /app would resolve to an empty /sql and leave the prebuilt test DB tableless.
    const migratePath = `\${TEST_MIGRATIONS_DIR:-${layout.migrationsPath("sqlite")}}`;
    return `${prefix}node ${migrateDir}/migrate-setup.mjs --provider sqlite --connection $npm_package_config_test_db --migrate-path ${migratePath} --and-up`;
}
function toSpecifier(emitPath) {
    return `./${emitPath.replace(/\.ts$/, "")}`;
}
function asArray(x) {
    return Array.isArray(x) ? x : [];
}
/** The relative custom-impl `module:` (`./…`) on a service entry or route def, or null when it isn't a relocatable custom entry. */
function customEntryModule(entry) {
    if (!entry || typeof entry !== "object")
        return null;
    const mod = entry.module;
    return typeof mod === "string" && mod.startsWith(".") ? mod : null;
}
/** The single `{ <name>: def }` route def object, or null when the entry isn't a single-keyed route. */
function routeEntryDef(entry) {
    if (!entry || typeof entry !== "object")
        return null;
    const keys = Object.keys(entry);
    if (keys.length !== 1)
        return null;
    const def = entry[keys[0]];
    return def && typeof def === "object"
        ? def
        : null;
}
/** The `original module: → relocated features/<entity>/custom/…` map the emitted `app.ts` hands `createBackendApp`, so the shipped `deterministic/` contract stays the verbatim, layout-neutral input while the by-feature runtime still loads the moved custom impls. Empty in flat layout. Derived through `CodegenLayout` via `resolveCustomEmitPath`/`resolveCustomRoutePath`, so casing/placement stay SDK-owned. */
export function buildCustomModulePaths({ servicesDoc, routesDoc, names, }) {
    const map = {};
    const add = (mod, target) => {
        if (map[mod] !== undefined && map[mod] !== target) {
            throw new Error(`by-feature custom module "${mod}" resolves to both "${map[mod]}" and "${target}" — declare distinct module paths per entry`);
        }
        map[mod] = target;
    };
    for (const entry of asArray(servicesDoc?.services)) {
        const mod = customEntryModule(entry);
        if (mod) {
            const path = resolveCustomEmitPath(entry, names, true);
            add(mod, toSpecifier(path));
        }
    }
    for (const entry of asArray(routesDoc?.routes)) {
        const def = routeEntryDef(entry);
        const mod = def && customEntryModule(def);
        if (mod) {
            const path = resolveCustomRoutePath(entry, names, true);
            add(mod, toSpecifier(path));
        }
    }
    return map;
}
function renderCustomModulePathsLiteral(map) {
    const keys = Object.keys(map ?? {});
    if (keys.length === 0)
        return "";
    const body = keys
        .map((k) => `      ${JSON.stringify(k)}: ${JSON.stringify(map[k])},`)
        .join("\n");
    return `\n    customModulePaths: {\n${body}\n    },`;
}
export function renderAppTs(_model, opts = {}) {
    const libImport = opts.libraryReferenceMode === "bundled"
        ? "./_deterministic/app.js"
        : "@deterministic-code/deterministic/app";
    const composeRouterImport = opts.organizeByFeature
        ? "./features/app-wiring.js"
        : "./routes/generated/app-wiring.js";
    return (applyTokens(APP_TS_CHUNK, {
        libImport,
        composeRouterImport,
        APP_CUSTOM_MODULE_PATHS: renderCustomModulePathsLiteral(opts.customModulePaths),
        APP_DB_IMPORTS_START: SECTION_MARKERS.APP_DB_IMPORTS.start,
        APP_DB_IMPORTS_END: SECTION_MARKERS.APP_DB_IMPORTS.end,
        APP_BEFORE_HOOK_START: SECTION_MARKERS.APP_BEFORE_HOOK.start,
        APP_BEFORE_HOOK_END: SECTION_MARKERS.APP_BEFORE_HOOK.end,
        APP_AFTER_HOOK_START: SECTION_MARKERS.APP_AFTER_HOOK.start,
        APP_AFTER_HOOK_END: SECTION_MARKERS.APP_AFTER_HOOK.end,
    }) + "\n");
}
export function renderServerTs(appName) {
    return (applyTokens(SERVER_TS_CHUNK, {
        devPort: DEV_PORTS.typescript,
        appName,
    }) + "\n");
}
export function renderTypescriptEnvSection() {
    return `PORT=${DEV_PORTS.typescript}\n`;
}
const BUNDLED_LIBRARY_RUNTIME_DEPS = {
    cors: "^2.8.5",
    express: "^4.21.0",
    helmet: "^8.0.0",
    "js-yaml": "^4.1.1",
    jsonwebtoken: "^9.0.2",
    pluralize: "^8.0.0",
    zod: "^3.23.8",
};
export async function renderPackageJson(model, _dialects = [], opts = {}) {
    const templatePath = resolve(templatesDir, "package.json.tmpl");
    const content = await renderTemplate(templatePath, {
        appName: model.appName,
    });
    const pkg = JSON.parse(content);
    pkg.dependencies = pkg.dependencies ?? {};
    if (opts.libraryReferenceMode === "bundled") {
        delete pkg.dependencies["@deterministic-code/deterministic"];
        for (const [name, version] of Object.entries(BUNDLED_LIBRARY_RUNTIME_DEPS)) {
            pkg.dependencies[name] = version;
        }
    }
    return JSON.stringify(pkg, null, 2) + "\n";
}
const ALL_DIALECT_DRIVER_MODULES = [
    { module: "pg", usedBy: "postgres" },
    { module: "mysql2/promise", usedBy: "mysql" },
    { module: "mssql", usedBy: "sqlserver" },
    { module: "oracledb", usedBy: "oracle" },
];
export function renderDbDriverShims(dialects = []) {
    const enabledModules = new Set();
    for (const dialect of dialects) {
        if (dialect === "postgres")
            enabledModules.add("pg");
        if (dialect === "mysql")
            enabledModules.add("mysql2/promise");
        if (dialect === "sqlserver")
            enabledModules.add("mssql");
        if (dialect === "oracle")
            enabledModules.add("oracledb");
    }
    const stubLines = [];
    for (const { module } of ALL_DIALECT_DRIVER_MODULES) {
        if (enabledModules.has(module))
            continue;
        stubLines.push(`declare module '${module}' { const x: any; export = x; }`);
    }
    if (stubLines.length === 0)
        return null;
    return `// Ambient stubs for DB driver modules the rolled-up library .d.ts references but this project does not install — keeps \`tsc --noEmit\` happy without bloating node_modules.
${stubLines.join("\n")}\n`;
}
export async function renderDockerfile(opts = {}) {
    const templatePath = resolve(templatesDir, "Dockerfile.tmpl");
    const bundled = opts.libraryReferenceMode === "bundled";
    // COPY . ./ takes the whole emitted output (whatever steps ran); tsc preserves source-relative imports verbatim into dist/, so bundled mode mirrors _deterministic/ into dist/_deterministic/ for runtime resolution.
    const deterministicLibraryRuntimeCopy = bundled
        ? `\nRUN cp -r _deterministic dist/_deterministic`
        : "";
    // When output is nested under a lane dir (multi-lang `<lang>/` or combined `backend/`) the root compose sets `context: .` and `dockerfile: ./<lane>Dockerfile`, so the lane-relative COPY lines carry the lane prefix. Root-shared trees are reached explicitly from the root context: sql/ via the migrate COPY, and deterministic/ (the runtime service-spec YAML) here — flat single-lang single-tier rides `COPY . ./`.
    const laneDir = opts.laneDir ?? "";
    const deterministicCopy = laneDir
        ? "COPY deterministic ./deterministic\n"
        : "";
    return await renderTemplate(templatePath, {
        tsPrefix: laneDir,
        deterministicCopy,
        workDir: "/app",
        deterministicLibraryRuntimeCopy,
        apkClientsBegin: SECTION_MARKERS.APK_CLIENTS.start,
        apkClientsEnd: SECTION_MARKERS.APK_CLIENTS.end,
        migrateCopyBegin: SECTION_MARKERS.MIGRATE_COPY.start,
        migrateCopyEnd: SECTION_MARKERS.MIGRATE_COPY.end,
    });
}
export async function renderTsConfig(_model, opts = {}) {
    const templatePath = resolve(templatesDir, "tsconfig.json.tmpl");
    const content = await renderTemplate(templatePath, {});
    if (opts.libraryReferenceMode !== "bundled")
        return content;
    const parsed = JSON.parse(content);
    const exclude = Array.isArray(parsed.exclude) ? [...parsed.exclude] : [];
    if (!exclude.includes("_deterministic/**"))
        exclude.push("_deterministic/**");
    parsed.exclude = exclude;
    return JSON.stringify(parsed, null, 2) + "\n";
}
export async function renderHealthCheckService() {
    const templatePath = resolve(templatesDir, "health-check-service.ts.tmpl");
    return await renderTemplate(templatePath, {});
}
function renderTypescriptGitignoreSection() {
    return ["node_modules/", "dist/", "*.tgz", ".env.local", "*.log", ""].join("\n");
}
async function renderVitestConfig() {
    const templatePath = resolve(templatesDir, "vitest.config.ts.tmpl");
    return await renderTemplate(templatePath, {});
}
async function renderHealthSmokeTest() {
    const templatePath = resolve(templatesDir, "health.test.ts.tmpl");
    return await renderTemplate(templatePath, {});
}
async function renderAppBootTest() {
    const templatePath = resolve(templatesDir, "app-boot.test.ts.tmpl");
    return await renderTemplate(templatePath, {});
}
export async function renderEntrypointScript() {
    const templatePath = resolve(templatesDir, "entrypoint.sh");
    return await renderTemplate(templatePath, {
        migrateHookBegin: SECTION_MARKERS.MIGRATE_HOOK.start,
        migrateHookEnd: SECTION_MARKERS.MIGRATE_HOOK.end,
    });
}
function routesDeclareHealthEndpoint(routesDoc) {
    const routes = routesDoc && typeof routesDoc === "object"
        ? routesDoc
        : {};
    const routeList = Array.isArray(routes.routes) ? routes.routes : [];
    return routeList.some((entry) => {
        if (!entry || typeof entry !== "object")
            return false;
        return Object.values(entry).some((def) => def &&
            typeof def === "object" &&
            def.path === "/api/health");
    });
}
async function resolveLibraryDistDir(rootDir) {
    return firstExistingDir([
        join(rootDir, "node_modules", "@deterministic-code", "deterministic", "typescript", "dist"),
        join(rootDir, "node_modules", "@deterministic-code", "deterministic", "dist"),
        join(rootDir, "typescript", "dist"),
    ], `library_reference_mode=bundled requires @deterministic-code/deterministic to be built or installed.`);
}
async function bundledDistEntries() {
    const distDir = await resolveLibraryDistDir(REPO_ROOT);
    const out = [];
    const walk = async (dir, rel) => {
        for (const ent of await readdir(dir, { withFileTypes: true })) {
            const relPath = rel ? `${rel}/${ent.name}` : ent.name;
            if (ent.isDirectory()) {
                await walk(join(dir, ent.name), relPath);
                continue;
            }
            if (ent.name.endsWith(".cjs"))
                continue;
            out.push({
                kind: CONTENT,
                filename: `_deterministic/${relPath}`,
                contents: await readFile(join(dir, ent.name), "utf8"),
            });
        }
    };
    await walk(distDir, "");
    return out;
}
/** Container + local-dev scaffolding (Docker, compose, env, gitignore) — the deployment half of the TS backend, split from the app-source entries so each builder stays within the size budget. */
async function typescriptDeploymentEntries({ o, }) {
    return [
        {
            kind: PATCH,
            filename: "Dockerfile",
            content: await renderDockerfile(o),
        },
        {
            kind: PATCH,
            filename: ".dockerignore",
            section: dockerignoreSection("typescript"),
            content: DOCKERIGNORE_TRIGGER,
        },
        {
            kind: PATCH,
            filename: "scripts/entrypoint.sh",
            content: await renderEntrypointScript(),
        },
        {
            kind: PATCH,
            filename: COMPOSE_FILENAME,
            content: renderTypescriptComposeService(
            // compose-services.mjs infers dockerfilePath as null from its default; the runtime accepts the string path.
            (o.laneDir
                ? { dockerfilePath: `./${o.laneDir}Dockerfile` }
                : {})),
        },
        { kind: PATCH, filename: ".env", content: renderTypescriptEnvSection() },
        {
            kind: PATCH,
            filename: ".env.example",
            content: renderTypescriptEnvSection(),
        },
        {
            kind: PATCH,
            filename: ".gitignore",
            content: renderTypescriptGitignoreSection(),
        },
    ];
}
async function typescriptScaffoldEntries({ model, dialects, libraryReferenceMode, customModulePaths, multiLanguage, laneDir, organizeByFeature, }) {
    const o = { libraryReferenceMode, multiLanguage, laneDir };
    return [
        {
            kind: PATCH,
            filename: "app.ts",
            content: await renderAppTs(model, {
                ...o,
                customModulePaths,
                organizeByFeature,
            }),
        },
        {
            kind: CONTENT,
            filename: "server.ts",
            contents: renderServerTs(model.appName),
        },
        {
            kind: PATCH,
            filename: "package.json",
            content: await renderPackageJson(model, dialects, o),
        },
        {
            kind: CONTENT,
            filename: "tsconfig.json",
            contents: await renderTsConfig(model, o),
        },
        ...(await typescriptDeploymentEntries({ o })),
    ];
}
async function typescriptTestEntries({ inputs, settings, libraryReferenceMode, }) {
    const entries = [
        {
            kind: CONTENT,
            filename: "vitest.config.ts",
            contents: await renderVitestConfig(),
        },
    ];
    if (routesDeclareHealthEndpoint(inputs.routesDoc)) {
        entries.push({
            kind: CONTENT,
            filename: "__tests__/health.test.ts",
            contents: await renderHealthSmokeTest(),
        });
    }
    entries.push({
        kind: CONTENT,
        filename: "__tests__/app-boot.test.ts",
        contents: await renderAppBootTest(),
    });
    const ds = datasourceSettingsForSettings(settings);
    const testAppFile = emitTestApp({
        datasourceData: inputs.datasourceTypesDoc,
        routesData: inputs.routesDoc,
        viewTypesData: inputs.viewTypesDoc,
        pluralizeTableNames: ds.pluralizeTableNames,
        datetime: ds.datetimeRepr,
        uuid: ds.uuidRepr,
        idType: ds.idType,
        libraryReferenceMode,
        organizeByFeature: settings.other.organizeByFeature === true,
    });
    entries.push({
        kind: PATCH,
        filename: join("__tests__", testAppFile.path),
        content: testAppFile.content,
    });
    return entries;
}
async function resolveTypescriptBackend(inputDir) {
    const settings = await readSettingsWithDefault(inputDir);
    const inputs = await loadBackendAppInputs(inputDir, settings);
    const dialects = (settings.backend.datasources.length > 0
        ? settings.backend.datasources
        : ["sqlite"])
        .map((d) => normalizeDialect(d))
        .filter((d) => d !== null);
    const model = buildAppModel({
        ...inputs,
        applicationName: settings.applicationName,
        byFeature: settings.other.organizeByFeature === true,
    });
    return {
        inputs,
        settings,
        dialects,
        model,
        libraryReferenceMode: resolveLibraryReferenceMode(settings.languages, "typescript"),
    };
}
export async function emitBackendApp(args) {
    if (!args.input) {
        throw new Error("create-backend-app (typescript): --input is required");
    }
    const inputDir = resolve(args.input);
    if (!(await pathExists(inputDir))) {
        throw new Error(`create-backend-app (typescript): input directory does not exist: ${inputDir}`);
    }
    const { inputs, settings, dialects, model, libraryReferenceMode } = await resolveTypescriptBackend(inputDir);
    const multiLanguage = isMultiLanguage(settings);
    const laneDir = backendLaneDir({
        combined: args.combined === true,
        multiLanguage,
        language: "typescript",
    });
    const customModulePaths = settings.other.organizeByFeature
        ? buildCustomModulePaths({
            servicesDoc: inputs.servicesDoc,
            routesDoc: inputs.routesDoc,
            names: namesForSettings(settings, "typescript"),
        })
        : {};
    const entries = [
        ...(await typescriptScaffoldEntries({
            model,
            dialects,
            libraryReferenceMode,
            customModulePaths,
            multiLanguage,
            laneDir,
            organizeByFeature: settings.other.organizeByFeature === true,
        })),
        ...(await typescriptTestEntries({
            inputs,
            settings,
            libraryReferenceMode,
        })),
    ];
    if (libraryReferenceMode === "bundled") {
        entries.push(...(await bundledDistEntries()));
    }
    return entries;
}
export const emit = makeBackendAppEmit(emitBackendApp, "typescript");
export const entriesNative = true;
export const pinProjectRoot = true;
export const flags = [COMBINED_FLAG];
