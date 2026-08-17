import { resolveLibraryReferenceMode } from "@deterministic-code/generator-sdk/read-settings";
import type { GeneratedFile } from "@deterministic-code/generator-sdk/codegen/lib/routes-generate-types";
interface DatasourceData {
    types?: unknown;
}
interface PerfServerTsOptions {
    datasourceData?: DatasourceData;
    libraryReferenceMode?: string;
}
interface PerfServerTsGenerateInput {
    inputs: {
        all: () => Promise<{
            datasourceYamlText: string;
        }>;
    };
    settings: {
        languages: Parameters<typeof resolveLibraryReferenceMode>[0];
    };
}
/** why: verify-only wrapper that applies migrations before createBackendApp() so perf hits every generated table (dist/server.js stays migration-free per #690). skip_migrations entities now ride the migrations chain via deterministic/custom/<dialect>/*_up.sql — single source of truth, no baked DDL constant. */
export declare function generatePerfServerTypescript({ datasourceData, libraryReferenceMode, }?: PerfServerTsOptions): GeneratedFile;
export declare const entriesNative = true;
/** Self-describing catalog `perf_server` (typescript): the verify-only server entrypoint plus its vitest.perf harness (config file + `test:perf` package.json script), routed through GeneratePlan's content/patch writers. */
export declare function generate({ inputs, settings }: PerfServerTsGenerateInput): Promise<{
    entries: import("@deterministic-code/generator-sdk/codegen/lib/generate-result").GenerateEntry[];
}>;
export {};
