import type { ParsedSettings } from "@deterministic-code/generator-sdk/read-settings";
type ResolvedSettings = ParsedSettings;
/** Emit a `<client>.bindings.live.ts` beside every emitted fetch/axios client, driving the REAL client functions against a running backend + real database — no `vi.mock`, no stubbed transport. Unlike the mocked `client_bindings_mock_tests`, and unlike the previous list-only smoke test, these exercise EVERY endpoint of each object: a full CRUD lifecycle (create → read → update → delete), readonly reads, and sub-resource routes, seeding each route's FK parents recursively up the tree by driving the parents' own emitted clients (so a `phone` create first creates its `contact`, whose `contact_source` id is read from the seeded lookup). tanstack is excluded (its hook needs a React renderer to run un-mocked). The `client_bindings_live` verify step launches the composed stack, points `BINDINGS_BASE_URL` at the proxy, and runs `npm run test:bindings-live`. Emits the frontend-root live harness once. */
export declare function emit({ inputs, settings, }: {
    inputs: unknown;
    settings: ResolvedSettings;
}): Promise<{
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
export {};
