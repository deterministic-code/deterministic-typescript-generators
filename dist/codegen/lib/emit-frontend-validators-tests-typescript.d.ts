import type { EmitEntry } from "@deterministic-code/generator-sdk/codegen/lib/emit-result";
import type { EmitArgs } from "./frontend-emit-types.ts";
/** Emit a `validators.test.ts` next to every object's `validators.ts` — one describe per zod schema that file exports, driven by the same route projection + reachable-component closure the validators emitter uses, so the tests cover exactly the schemas that were emitted. Each schema gets a valid-payload case, a nullable-fields case when it has any, and a rejecting case per invalid mutation (missing/null required, wrong scalar type). Adds the vitest + zod harness to frontend/package.json. */
export declare function emit({ inputs, settings }: EmitArgs): Promise<{
    entries: EmitEntry[];
}>;
export declare const entriesNative = true;
export declare const assembleAfterStep = true;
