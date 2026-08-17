import { type EmitEntry } from "@deterministic-code/generator-sdk/codegen/lib/emit-result";
/** The add-if-absent `frontend/package.json` patch every frontend test emitter needs so the emitted `*.test.ts` files can run: `vitest` as a devDependency and a `test` script. Pass `needsZod` for the validators tests, whose imported `validators.ts` resolves `zod` at runtime. Deep-merged with the frontend_app skeleton and the client dependency patch, so a version already pinned wins. */
export declare function frontendTestHarnessPatch({ needsZod, }?: {
    needsZod?: boolean;
}): EmitEntry;
/** The frontend-root harness the live client-bindings tests need: a base-URL setup that rewrites the emitted clients' relative `/api/...` fetches at `BINDINGS_BASE_URL` (a resolver, not a mock — real requests pass through to the running backend), a dedicated `passWithNoTests` vitest config whose `bindings.live.ts` include keeps these files out of the default `vitest run`, and a `test:bindings-live` script the verify runner invokes. Always emitted, so a project with zero frontend bindings still has the script the verify step calls — it just runs zero live tests and passes. */
export declare function bindingsLiveHarnessEntries(): EmitEntry[];
