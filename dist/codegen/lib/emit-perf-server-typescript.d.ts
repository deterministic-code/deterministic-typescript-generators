import { resolveLibraryReferenceMode } from "@deterministic-code/generator-sdk/read-settings";
import type { EmittedFile } from "@deterministic-code/generator-sdk/codegen/lib/routes-emit-types";
interface DatasourceData {
    types?: unknown;
}
interface PerfServerTsOptions {
    datasourceData?: DatasourceData;
    libraryReferenceMode?: string;
}
interface PerfServerTsEmitInput {
    inputs: {
        all: () => Promise<{
            datasourceYamlText: string;
        }>;
    };
    settings: {
        languages: Parameters<typeof resolveLibraryReferenceMode>[0];
    };
}
/** why: verify-only wrapper that applies migrations before createBackendApp() so perf hits every emitted table (dist/server.js stays migration-free per #690). skip_migrations entities now ride the migrations chain via deterministic/custom/<dialect>/*_up.sql — single source of truth, no baked DDL constant. */
export declare function emitPerfServerTypescript({ datasourceData, libraryReferenceMode, }?: PerfServerTsOptions): EmittedFile;
export declare const entriesNative = true;
/** Self-describing catalog `perf_server` (typescript): the verify-only server entrypoint plus its vitest.perf harness (config file + `test:perf` package.json script), routed through EmitPlan's content/patch writers. */
export declare function emit({ inputs, settings }: PerfServerTsEmitInput): Promise<{
    entries: import("@deterministic-code/generator-sdk/codegen/lib/emit-result").EmitEntry[];
}>;
export {};
