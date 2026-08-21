import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, posix } from "node:path";
import { fileURLToPath } from "node:url";
import { memoryReader } from "@deterministic-code/generators-common/deterministic-reader";
import type { GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import { generate as generateSql } from "../../generators-sql/src/generate-sql.ts";
import { createImportGenerator } from "../src/import-generator.ts";
import { generate as generateBackendApp } from "../src/generate-backend-app.ts";
import { generate as generateClientBindings } from "../src/generate-client-bindings.ts";
import { generate as generateDatasourceTypes } from "../src/generate-datasource-types.ts";
import { generate as generateFrontendApp } from "../src/generate-frontend-app.ts";
import { generate as generateFrontendTypes } from "../src/generate-frontend-types.ts";
import { generate as generateRoutes } from "../src/generate-routes.ts";
import { generate as generateServices } from "../src/generate-services.ts";
import { generate as generateViewTypes } from "../src/generate-view-types.ts";
import { removeE2eTempDirs } from "./cleanup-temp.ts";
import {
  loadContactsSample,
  type ContactsSample,
  type ContactsVariant,
} from "./contacts-sample-yaml.ts";
import {
  generateBundledMigrate,
  installBuildAndMigrateSqlite,
  npm,
  sqliteAppEnv,
  startGeneratedServer,
  withSqlRoot,
  writeDeterministicYaml,
  type BootedApp,
} from "./generated-app.ts";
import {
  dumpCodegenEntries,
  dumpFinalFiles,
  dumpServerTrace,
  verboseOutputEnabled,
} from "./verbose-output.ts";
import { writeGenerateEntries } from "./write-generate-entries.ts";

const nestUnder = (dir: string, entries: GenerateEntry[]): GenerateEntry[] =>
  entries.map((entry) => ({
    ...entry,
    filename: posix.normalize(`${dir}/${entry.filename}`),
  }));

const filenames = (entries: GenerateEntry[]): string[] =>
  entries.map((entry) => entry.filename);

const requireNamed = (entries: GenerateEntry[], needle: string): void => {
  const hit = filenames(entries).some((name) => name.includes(needle));
  if (!hit) {
    throw new Error(
      `codegen missing ${needle}; got ${filenames(entries).join(", ")}`,
    );
  }
};

const requireNamedAny = (entries: GenerateEntry[], needles: string[]): void => {
  const names = filenames(entries);
  if (needles.some((needle) => names.some((name) => name.includes(needle)))) {
    return;
  }
  throw new Error(
    `codegen missing ${needles.join(" or ")}; got ${names.join(", ")}`,
  );
};

const CUSTOM_SERVICE_MODULES = [
  {
    name: "ContactImportService",
    module: "./services/contact-import-service",
  },
  {
    name: "LegacyMigrationService",
    module: "./services/legacy-migration-service",
  },
] as const;

const customModulePathsFor = (
  variant: ContactsVariant,
  settings: Record<string, string>,
): Record<string, string> => {
  if (!variant.organizeByFeature) return {};
  const imports = createImportGenerator(".", settings);
  const paths: Record<string, string> = {};
  for (const spec of CUSTOM_SERVICE_MODULES) {
    const laid = imports.serviceCustom(spec.name, spec.module).replace(/\.ts$/, "");
    paths[spec.module] = `./${laid}`;
  }
  return paths;
};

const injectCustomModulePaths = async (
  appDir: string,
  paths: Record<string, string>,
): Promise<void> => {
  if (Object.keys(paths).length === 0) return;
  const appPath = join(appDir, "app.ts");
  const needle = "srcRoot: process.env.SRC_ROOT ?? process.cwd(),";
  const text = await readFile(appPath, "utf8");
  if (!text.includes(needle)) {
    throw new Error("contacts boot: app.ts is missing srcRoot assignment");
  }
  const literal = JSON.stringify(paths, null, 2).replace(/\n/g, "\n    ");
  await writeFile(
    appPath,
    text.replace(needle, `${needle}\n    customModulePaths: ${literal},`),
    "utf8",
  );
};

const RUNTIME_ROOT = fileURLToPath(new URL("../runtime/", import.meta.url));

let runtimeBuild: Promise<void> | undefined;

const ensureLocalRuntime = async (): Promise<void> => {
  runtimeBuild ??= npm(["run", "build"], RUNTIME_ROOT);
  await runtimeBuild;
};

const pinLocalRuntime = async (appDir: string): Promise<void> => {
  await ensureLocalRuntime();
  const pkgPath = join(appDir, "package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf8")) as {
    dependencies?: Record<string, string>;
  };
  pkg.dependencies = {
    ...pkg.dependencies,
    "@deterministic-code/deterministic": `file:${RUNTIME_ROOT}`,
  };
  await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
};

const isCustomStub = (filename: string): boolean =>
  filename.startsWith("../") || filename.includes("/custom/");

const excludeGeneratedTypesFromBuild = async (appDir: string): Promise<void> => {
  const tsconfigPath = join(appDir, "tsconfig.json");
  const tsconfig = JSON.parse(await readFile(tsconfigPath, "utf8")) as {
    exclude?: string[];
  };
  tsconfig.exclude = [...(tsconfig.exclude ?? []), "types/**"];
  await writeFile(tsconfigPath, `${JSON.stringify(tsconfig, null, 2)}\n`, "utf8");
};


const placeLayered = (
  dir: string,
  entries: GenerateEntry[],
  organizeByFeature: boolean,
): GenerateEntry[] => (organizeByFeature ? entries : nestUnder(dir, entries));

export type ContactsLaneEntries = {
  datasource: GenerateEntry[];
  views: GenerateEntry[];
  services: GenerateEntry[];
  routes: GenerateEntry[];
};

export type BootedContactsApp = BootedApp & {
  variant: ContactsVariant;
  settings: Record<string, string>;
  lanes: ContactsLaneEntries;
};

const generateLanes = async (
  sample: ContactsSample,
): Promise<ContactsLaneEntries> => {
  const ctx = {
    reader: memoryReader(sample.yaml),
    settings: sample.settings,
  };
  const [datasource, views, services, routes] = await Promise.all([
    generateDatasourceTypes(ctx),
    generateViewTypes(ctx),
    generateServices(ctx),
    generateRoutes(ctx),
  ]);
  requireNamed(datasource, "contact");
  requireNamed(views, "contact");
  requireNamedAny(services, ["contact-import-service", "ContactImportService"]);
  requireNamedAny(services, [
    "legacy-migration-service",
    "LegacyMigrationService",
  ]);
  requireNamed(routes, "contact");
  return { datasource, views, services, routes };
};

export const bootContactsSample = async (
  variant: ContactsVariant,
  tempPrefix: string,
): Promise<BootedContactsApp> => {
  const sample = await loadContactsSample(variant);
  const ctx = {
    reader: memoryReader(sample.yaml),
    settings: sample.settings,
  };
  const [
    appEntries,
    frontendEntries,
    typeEntries,
    bindingEntries,
    sqlEntries,
    migrateEntries,
    lanes,
  ] = await Promise.all([
    generateBackendApp(ctx),
    generateFrontendApp(ctx),
    generateFrontendTypes(ctx),
    generateClientBindings(ctx),
    generateSql(ctx),
    generateBundledMigrate(sample.settings),
    generateLanes(sample),
  ]);
  requireNamed(frontendEntries, "frontend/src/App.tsx");
  requireNamed(bindingEntries, "frontend/src/client/fetch/http.ts");
  requireNamed(migrateEntries, "migraters/typescript/package.json");
  requireNamed(migrateEntries, "migraters/typescript/src/bin/migrate-up.ts");

  const byFeature = variant.organizeByFeature;
  const datasourceOnDisk = placeLayered(
    "types/generated/datasource",
    lanes.datasource,
    byFeature,
  );
  const servicesOnDisk = placeLayered(
    "services/generated",
    lanes.services.filter((entry) => isCustomStub(entry.filename)),
    byFeature,
  );

  await removeE2eTempDirs([tempPrefix]);
  const appDir = await mkdtemp(join(tmpdir(), tempPrefix));
  const entries = [
    ...appEntries,
    ...frontendEntries,
    ...typeEntries,
    ...bindingEntries,
    ...datasourceOnDisk,
    ...servicesOnDisk,
    ...withSqlRoot(sqlEntries),
    ...migrateEntries,
  ];
  if (verboseOutputEnabled()) dumpCodegenEntries(entries);
  await writeGenerateEntries(appDir, entries);
  await writeDeterministicYaml(appDir, sample.yaml);
  await injectCustomModulePaths(
    appDir,
    customModulePathsFor(variant, sample.settings),
  );
  await excludeGeneratedTypesFromBuild(appDir);
  await pinLocalRuntime(appDir);
  if (verboseOutputEnabled()) await dumpFinalFiles(appDir);

  await installBuildAndMigrateSqlite(appDir);
  const booted = await startGeneratedServer(appDir, {
    ...sqliteAppEnv(appDir),
    DETERMINISTIC_TRACE: "route,service,datasource",
    SRC_ROOT: join(appDir, "dist"),
  });
  return {
    ...booted,
    variant,
    settings: sample.settings,
    lanes,
  };
};

export const requireAppFile = async (
  appDir: string,
  rel: string,
): Promise<void> => {
  await access(join(appDir, rel));
};

export const datasourceTypePath = (
  entity: string,
  variant: ContactsVariant,
  settings: Record<string, string>,
): string => {
  const laid = createImportGenerator(".", settings).datasource(entity);
  return variant.organizeByFeature
    ? laid
    : `types/generated/datasource/${laid}`;
};

export const customServicePath = (
  name: string,
  module: string,
  variant: ContactsVariant,
  settings: Record<string, string>,
): string => {
  const laid = createImportGenerator(".", settings).serviceCustom(name, module);
  return variant.organizeByFeature
    ? laid
    : posix.normalize(`services/generated/${laid}`);
};

export const dumpContactsTrace = (booted: BootedApp): void => {
  if (!verboseOutputEnabled()) return;
  dumpServerTrace(Buffer.concat(booted.stdoutChunks).toString());
};
