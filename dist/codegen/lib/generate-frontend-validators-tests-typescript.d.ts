import type { GenerateEntry } from "@deterministic-code/generator-sdk/codegen/lib/generate-result";
import type { GenerateArgs } from "./frontend-generate-types.ts";
/** Generate a `validators.test.ts` next to every object's `validators.ts` — one describe per zod schema that file exports, driven by the same route projection + reachable-component closure the validators generator uses, so the tests cover exactly the schemas that were generated. Each schema gets a valid-payload case, a nullable-fields case when it has any, and a rejecting case per invalid mutation (missing/null required, wrong scalar type). Adds the vitest + zod harness to frontend/package.json. */
export declare function generate({ inputs, settings }: GenerateArgs): Promise<{
    entries: GenerateEntry[];
}>;
export declare const entriesNative = true;
export declare const assembleAfterStep = true;
