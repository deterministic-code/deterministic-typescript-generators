import { buildAppModel } from "@deterministic-code/generator-sdk/create-backend-app-model";
import { type GenerateEntry } from "@deterministic-code/generator-sdk/codegen/lib/generate-result";
import type { CodegenNames } from "@deterministic-code/generator-sdk/codegen-naming";
type AppModel = ReturnType<typeof buildAppModel>;
interface BackendAppOptions {
    libraryReferenceMode?: string;
    multiLanguage?: boolean;
    laneDir?: string;
}
interface AppTsOptions {
    libraryReferenceMode?: string;
    customModulePaths?: Record<string, string>;
    organizeByFeature?: boolean;
}
interface MigrationLayout {
    migrationsPath(dialect: string): string;
}
export declare const TEST_DB_RELATIVE_PATH = ".test/prebuilt.sqlite";
export declare function buildAppTsDbHookImportsBlock(libraryReferenceMode: string): string;
export declare function buildAppTsBeforeHookBlock(): string;
export declare function buildAppTsAfterHookBlock(): string;
export declare function buildTestAppDbConnBlock(libraryReferenceMode: string): string;
export declare function buildMigrateScripts(migrateDir: string, dialects: string[], layout: MigrationLayout): Record<string, string>;
export declare function buildPretestScript(migrateDir: string, libraryReferenceMode: string, layout: MigrationLayout): string;
interface CustomModulePathsInput {
    servicesDoc: {
        services?: unknown;
    } | null;
    routesDoc: {
        routes?: unknown;
    } | null;
    names: CodegenNames;
}
/** The `original module: → relocated features/<entity>/custom/…` map the generated `app.ts` hands `createBackendApp`, so the shipped `deterministic/` contract stays the verbatim, layout-neutral input while the by-feature runtime still loads the moved custom impls. Empty in flat layout. Derived through `CodegenLayout` via `resolveCustomGeneratePath`/`resolveCustomRoutePath`, so casing/placement stay SDK-owned. */
export declare function buildCustomModulePaths({ servicesDoc, routesDoc, names, }: CustomModulePathsInput): Record<string, string>;
export declare function renderAppTs(_model: AppModel, opts?: AppTsOptions): string;
export declare function renderServerTs(appName: string): string;
export declare function renderTypescriptEnvSection(): string;
export declare function renderPackageJson(model: AppModel, _dialects?: string[], opts?: BackendAppOptions): Promise<string>;
export declare function renderDbDriverShims(dialects?: string[]): string | null;
export declare function renderDockerfile(opts?: BackendAppOptions): Promise<string>;
export declare function renderTsConfig(_model: AppModel, opts?: BackendAppOptions): Promise<string>;
export declare function renderHealthCheckService(): Promise<string>;
export declare function renderEntrypointScript(): Promise<string>;
interface GenerateArgs {
    input?: string;
    combined?: boolean;
}
export declare function generateBackendApp(args: GenerateArgs): Promise<GenerateEntry[]>;
export declare const generate: ({ inputs, args }: import("@deterministic-code/generator-sdk/codegen/lib/backend-app-generate-helpers").BackendAppGenerateContext) => Promise<{
    entries: unknown;
}>;
export declare const entriesNative = true;
export declare const pinProjectRoot = true;
export declare const flags: {
    flag: string;
    target: string;
    kind: string;
    defaultValue: boolean;
    description: string;
}[];
export {};
