import type { GenerateArgs } from "./frontend-generate-types.ts";
/** Generate a `<stem>.test.ts` next to every read type frontend_types generates — under `bindings/<datasource>/types/` for each `frontend_bindings.yaml` datasource, the same entity/view components filtered to read types the same way. Each test constructs a fully-typed instance (a compile-time shape check against the generated interface) and exercises get/set on its plain scalar fields plus null-assignment on its nullable ones. Adds the vitest harness to frontend/package.json. */
export declare function generate({ inputs, settings }: GenerateArgs): Promise<{
    entries: ({
        kind: string;
        filename: string;
        contents: unknown;
    } | {
        kind: string;
        filename: string;
        content: string;
        section?: string;
        path?: string;
    })[];
}>;
export declare const entriesNative = true;
export declare const assembleAfterStep = true;
