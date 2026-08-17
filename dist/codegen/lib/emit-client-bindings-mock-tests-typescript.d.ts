import type { ParsedSettings } from "@deterministic-code/generator-sdk/read-settings";
/** Emit a `<client>.test.ts` next to every emitted client file, one per (object, library). Each drives the real client function against a mocked transport — fetch/tanstack stub `globalThis.fetch`, axios mocks the module — and asserts the exact method + URL (params substituted) + JSON body the client sends, that the response is returned, and that a non-ok/error transport rejects. Driven by the same route projection as client_bindings, so the tests track the emitted clients one-to-one. Adds the vitest harness to frontend/package.json. */
export declare function emit({ inputs, settings, }: {
    inputs: unknown;
    settings: ParsedSettings;
}): Promise<{
    entries: import("@deterministic-code/generator-sdk/codegen/lib/emit-result").EmitEntry[];
}>;
export declare const entriesNative = true;
export declare const assembleAfterStep = true;
