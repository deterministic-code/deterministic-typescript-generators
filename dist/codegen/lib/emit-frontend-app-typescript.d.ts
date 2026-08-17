interface FrontendAppArgs {
    language?: string;
    framework?: string;
    combined?: boolean;
}
interface FrontendAppSettings {
    frontend?: {
        framework?: string;
    };
    applicationName?: string;
}
interface FrontendAppInput {
    settings?: FrontendAppSettings;
    args?: FrontendAppArgs;
}
/** `--framework` is declared here so the runner (emit.mjs `profileFor`) merges it into the validated flag set for this step only — the sanctioned per-step extension, not a CANONICAL_FLAGS change. `--language` already rides the common flag set. */
export declare const flags: ({
    flag: string;
    target: string;
    kind: string;
    defaultValue: boolean;
    description: string;
} | {
    flag: string;
    target: string;
    kind: string;
    placeholder: string;
    description: string;
})[];
/** Scaffold a minimal React + Vite + TypeScript app under `frontend/`. Reads the merged settings.yaml (settings.frontend.framework + settings.application_name); `--framework` overrides the file, the file overrides the defaults. Throws on any {language, framework} outside the supported set so an unsupported request fails loudly instead of emitting a broken app. */
export declare function emit({ settings, args }: FrontendAppInput): Promise<{
    entries: ({
        kind: string;
        filename: string;
        content: string;
        section: string;
        contents?: undefined;
    } | {
        kind: string;
        filename: string;
        contents: string;
        content?: undefined;
        section?: undefined;
    } | {
        kind: string;
        filename: string;
        content: string;
    })[];
}>;
export declare const entriesNative = true;
/** A lone `emit --step frontend_app --output X` must compose its own PATCH pieces (package.json + frontend/.gitignore) immediately — otherwise they'd sit un-assembled under deterministic/patches/. Fires only on that standalone single-step path; `emit --all --tier frontend`, the `--assemble` orchestration, and the in-process server path all run frontend_app through runOneStep and assemble once at the end, so this flag never fires there. */
export declare const assembleAfterStep = true;
export {};
